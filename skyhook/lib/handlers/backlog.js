import fs from 'fs';
import path from 'path';
import { generateULID, getTimestamp, writeYaml } from '../utils.js';
import { DependencyResolver } from '../backlog/DependencyResolver.js';
import { TaskLeaseManager } from '../backlog/TaskLeaseManager.js';
import { EventLedger, EVENT_TYPES } from '../backlog/EventLedger.js';

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
      id: s.id,
      title: s.title,
      status: s.status,
      priority: s.priority,
      dependsOn: s.dependsOn || [],
      lease: s.lease || null,
      assignee: s.assignee || null
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

export async function cmdGetNextTask(ctx, args = {}) {
  const backlog = ctx.readBacklog();
  const allStories = backlog.stories || [];
  const agentId = args.agent || args.agentId || null;
  const leaseMinutes = args.lease ? Number(args.lease) : null;
  
  // Sweep expired leases first
  TaskLeaseManager.sweepExpiredLeases(backlog);

  // Filter ready stories that have NO unmet dependencies and are not leased to another agent
  const readyStories = allStories
    .filter(s => {
      if (s.status !== 'ready') return false;

      // 1. Dependency check: all dependencies must be done
      const unmet = DependencyResolver.getUnmetDependencies(s, allStories);
      if (unmet.length > 0) return false;

      // 2. Lease check: not leased by someone else
      if (TaskLeaseManager.isLeased(s)) {
        if (!agentId || s.lease.agentId !== agentId) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const pa = typeof a.priority === 'string' ? (priorityOrder[a.priority] ?? 2) : (100 - (a.priority || 50));
      const pb = typeof b.priority === 'string' ? (priorityOrder[b.priority] ?? 2) : (100 - (b.priority || 50));
      return pa - pb;
    });
  
  if (readyStories.length === 0) {
    return { message: 'No ready tasks found', task: null };
  }
  
  const task = readyStories[0];

  // If an agent requested the task with leasing, lease it atomically
  if (agentId) {
    TaskLeaseManager.acquireLease(task, agentId, leaseMinutes || 30);
    ctx.writeBacklog(backlog);

    if (ctx.skyhookDir) {
      EventLedger.appendEvent(ctx.skyhookDir, {
        type: EVENT_TYPES.TASK_LEASED,
        actor: agentId,
        payload: {
          storyId: task.id,
          agentId,
          expiresAt: task.lease.expiresAt,
          durationMinutes: task.lease.durationMinutes
        }
      });
    }
  }

  return { task };
}

export async function cmdGetBlockers(ctx, args) {
  const backlog = ctx.readBacklog();
  const allStories = backlog.stories || [];
  const blocked = allStories.filter(s => DependencyResolver.isBlocked(s, allStories));

  const detailedBlockers = blocked.map(s => ({
    id: s.id,
    title: s.title,
    status: s.status,
    blockerReason: s.blockerReason || null,
    unmetDependencies: DependencyResolver.getUnmetDependencies(s, allStories)
  }));

  return { blockers: detailedBlockers, count: detailedBlockers.length };
}

export async function cmdUpdateStatus(ctx, args) {
  if (!args.storyId || !args.status) {
    return { error: 'Missing required: storyId, status' };
  }
  
  const validStatuses = ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'];
  if (!validStatuses.includes(args.status)) {
    return { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') };
  }

  try {
    const metadata = {
      reason: args.reason,
      agentId: args.agent || args.agentId,
      leaseMinutes: args.lease ? Number(args.lease) : null
    };

    const options = {
      force: !!args.force
    };

    const success = ctx.updateStoryStatus(args.storyId, args.status, metadata, options);
    if (!success) return { error: 'Story not found: ' + args.storyId };
    
    return { success: true, storyId: args.storyId, status: args.status };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdReleaseLease(ctx, args) {
  if (!args.storyId) {
    return { error: 'Missing required: storyId' };
  }

  const backlog = ctx.readBacklog();
  const story = (backlog.stories || []).find(s => s.id === args.storyId);
  if (!story) return { error: 'Story not found: ' + args.storyId };

  try {
    TaskLeaseManager.releaseLease(story, args.agent || args.agentId, !!args.force);
    ctx.writeBacklog(backlog);

    if (ctx.skyhookDir) {
      EventLedger.appendEvent(ctx.skyhookDir, {
        type: EVENT_TYPES.TASK_RELEASED,
        actor: args.agent || 'system',
        payload: { storyId: story.id }
      });
    }

    return { success: true, storyId: story.id, message: 'Lease released successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdBacklogEvents(ctx, args = {}) {
  if (!ctx.skyhookDir) {
    return { error: 'No .skyhook directory found' };
  }

  const limit = args.limit !== undefined ? Number(args.limit) : 50;
  const events = EventLedger.readEvents(ctx.skyhookDir, limit);
  const metrics = EventLedger.calculateMetrics(events);

  return {
    events,
    count: events.length,
    metrics
  };
}

export async function cmdBacklogReplay(ctx, args = {}) {
  if (!ctx.skyhookDir) {
    return { error: 'No .skyhook directory found' };
  }

  const events = EventLedger.readEvents(ctx.skyhookDir, 0);
  const projected = EventLedger.projectBacklog(events);

  if (args.save) {
    ctx.writeBacklog(projected);
  }

  return {
    success: true,
    eventsReplayed: events.length,
    projectedBacklog: projected,
    saved: !!args.save
  };
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
          const backlog = ctx.readBacklog();
          const storyId = generateULID();
          if (!backlog.stories) backlog.stories = [];
          backlog.stories.push({ ...item.data, id: storyId, createdAt: getTimestamp(), updatedAt: getTimestamp() });
          ctx.writeBacklog(backlog);

          if (ctx.skyhookDir) {
            EventLedger.appendEvent(ctx.skyhookDir, {
              type: EVENT_TYPES.STORY_CREATED,
              actor: 'system',
              payload: { id: storyId, ...item.data }
            });
          }
          result = { storyId };
          break;
        }
        case 'requirement': {
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
