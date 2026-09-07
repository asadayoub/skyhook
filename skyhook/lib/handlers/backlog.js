import fs from 'fs';
import path from 'path';
import { generateULID, getTimestamp, writeYaml } from '../utils.js';

export async function cmdListCurrentFeatures(ctx, args) {
  const backlog = ctx.readBacklog();
  const filter = args.status || 'all';
  
  // Ensure arrays
  let epics = backlog.epics || [];
  if (!Array.isArray(epics)) epics = Object.values(epics);
  let stories = backlog.stories || [];
  if (!Array.isArray(stories)) stories = Object.values(stories);
  
  if (filter !== 'all') {
    stories = stories.filter(s => s.status === filter);
  }
  
  // Group by epic
  const result = epics.map(epic => ({
    epic: { id: epic.id, title: epic.title, status: epic.status },
    stories: stories.filter(s => s.epicId === epic.id).map(s => ({
      id: s.id, title: s.title, status: s.status, priority: s.priority
    }))
  }));
  
  return { features: result };
}

export async function cmdGetFeature(ctx, args) {
  const backlog = ctx.readBacklog();
  const feature = backlog.epics.find(e => e.id === args.id);
  if (!feature) return { error: 'Feature not found: ' + args.id };
  
  const stories = backlog.stories.filter(s => s.epicId === args.id);
  return { feature, stories };
}

export async function cmdGetNextTask(ctx, args) {
  const backlog = ctx.readBacklog();
  const assignee = args.assignee || 'default';
  
  const readyStories = backlog.stories
    .filter(s => s.status === 'ready')
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
  
  if (readyStories.length === 0) {
    return { message: 'No ready tasks found', task: null };
  }
  
  const task = readyStories[0];
  return { task };
}

export async function cmdGetBlockers(ctx, args) {
  const backlog = ctx.readBacklog();
  const blocked = backlog.stories.filter(s => s.status === 'blocked');
  return { blockers: blocked };
}

export async function cmdUpdateStatus(ctx, args) {
  if (!args.storyId || !args.status) {
    return { error: 'Missing required: storyId, status' };
  }
  
  const validStatuses = ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'];
  if (!validStatuses.includes(args.status)) {
    return { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') };
  }
  
  const success = ctx.updateStoryStatus(args.storyId, args.status);
  if (!success) return { error: 'Story not found: ' + args.storyId };
  
  return { success: true, storyId: args.storyId, status: args.status };
}

export async function cmdAddFeature(ctx, args) {
  if (!args.title) return { error: 'Missing required: title' };
  
  const result = ctx.addFeature({
    title: args.title,
    description: args.description,
    goal: args.goal,
    successMetrics: args.successMetrics,
    stories: args.stories,
    targetDate: args.targetDate
  });
  
  return { success: true, ...result };
}

export async function cmdBatchCreate(ctx, args) {
  const items = args.items || [];
  const results = [];
  
  for (const item of items) {
    try {
      let result;
      switch (item.type) {
        case 'feature': {
          result = ctx.addFeature(item.data);
          break;
        }
        case 'story': {
          // Add story to existing epic
          const backlog = ctx.readBacklog();
          const storyId = generateULID();
          if (!backlog.stories) backlog.stories = [];
          backlog.stories.push({ ...item.data, id: storyId, createdAt: getTimestamp(), updatedAt: getTimestamp() });
          ctx.writeBacklog(backlog);
          result = { storyId };
          break;
        }
        case 'requirement': {
          // Add to functional requirements
          const funcReqs = ctx.readFunctionalReqs();
          const reqId = generateULID();
          if (!funcReqs.requirements) funcReqs.requirements = [];
          funcReqs.requirements.push({ ...item.data, id: reqId, createdAt: getTimestamp(), updatedAt: getTimestamp() });
          writeYaml(path.join(ctx.skyhookDir, 'requirements', 'functional.yaml'), funcReqs);
          result = { requirementId: reqId };
          break;
        }
        case 'decision': {
          const decisionId = ctx.writeDecision(item.data);
          result = { decisionId: decisionId };
          break;
        }
        default: {
          result = { error: 'Unknown type: ' + item.type };
        }
      }
      results.push({ type: item.type, success: !result.error, ...result });
    } catch (e) {
      results.push({ type: item.type, success: false, error: e.message });
    }
  }
  
  return { results, success: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
}

