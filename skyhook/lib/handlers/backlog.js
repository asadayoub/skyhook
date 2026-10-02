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
  const allTasks = backlog.tasks || [];
  const agentId = args.agent || args.agentId || null;
  const leaseMinutes = args.lease ? Number(args.lease) : null;
  const level = args.level || 'any'; // 'task', 'story', 'any'
  const filterStory = args.story || args.storyId || null;
  const filterType = args.type || null;
  const role = args.role || null;
  
  // Sweep expired leases first
  TaskLeaseManager.sweepExpiredLeases(backlog);

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortByPriority = (items) => [...items].sort((a, b) => {
    const pa = typeof a.priority === 'string' ? (priorityOrder[a.priority] ?? 2) : (100 - (a.priority || 50));
    const pb = typeof b.priority === 'string' ? (priorityOrder[b.priority] ?? 2) : (100 - (b.priority || 50));
    return pa - pb;
  });

  // Filter candidate tasks
  let candidateTasks = [];
  if (level !== 'story') {
    candidateTasks = allTasks.filter(t => {
      if (t.status !== 'ready') return false;
      if (filterStory && t.parentId !== filterStory && t.storyId !== filterStory) return false;
      if (filterType && t.type !== filterType) return false;
      if (role && t.agentRole && t.agentRole !== role) return false;

      // Dependencies check
      const unmet = DependencyResolver.getUnmetDependencies(t, allStories, allTasks);
      if (unmet.length > 0) return false;

      // Direct lease check
      if (TaskLeaseManager.isLeased(t)) {
        if (!agentId || t.lease.agentId !== agentId) return false;
      }

      // Parent story lease check (if parent story is leased by another agent, task is blocked)
      const parentStory = allStories.find(s => s.id === t.parentId);
      if (parentStory && TaskLeaseManager.isLeased(parentStory)) {
        if (!agentId || parentStory.lease.agentId !== agentId) return false;
      }

      return true;
    });
    candidateTasks = sortByPriority(candidateTasks);
  }

  // Filter candidate stories
  let candidateStories = [];
  if (level !== 'task') {
    candidateStories = allStories.filter(s => {
      if (s.status !== 'ready') return false;
      if (filterStory && s.id !== filterStory) return false;
      if (role && s.agentRole && s.agentRole !== role) return false;

      // Dependencies check
      const unmet = DependencyResolver.getUnmetDependencies(s, allStories, allTasks);
      if (unmet.length > 0) return false;

      // Direct lease check
      if (TaskLeaseManager.isLeased(s)) {
        if (!agentId || s.lease.agentId !== agentId) return false;
      }

      // Sibling child tasks lease check
      const hasOtherChildLease = allTasks.some(t =>
        t.parentId === s.id && TaskLeaseManager.isLeased(t) && (!agentId || t.lease.agentId !== agentId)
      );
      if (hasOtherChildLease) return false;

      return true;
    });
    candidateStories = sortByPriority(candidateStories);
  }

  let chosen = null;
  if (level === 'task') {
    chosen = candidateTasks[0] || null;
  } else if (level === 'story') {
    chosen = candidateStories[0] || null;
  } else {
    // 'any': prioritize task if available, otherwise story
    chosen = candidateTasks[0] || candidateStories[0] || null;
  }
  
  if (!chosen) {
    return { message: 'No ready tasks found', task: null };
  }
  
  const isTask = !!chosen.parentId || (chosen.id && chosen.id.startsWith('TASK-'));

  // If an agent requested the task with leasing, lease it atomically
  if (agentId) {
    if (isTask) {
      TaskLeaseManager.acquireTaskLease(chosen, agentId, leaseMinutes || 30, backlog);
    } else {
      TaskLeaseManager.acquireLease(chosen, agentId, leaseMinutes || 30);
    }
    ctx.writeBacklog(backlog);

    if (ctx.skyhookDir) {
      EventLedger.appendEvent(ctx.skyhookDir, {
        type: EVENT_TYPES.TASK_LEASED,
        actor: agentId,
        payload: {
          storyId: chosen.id,
          taskId: isTask ? chosen.id : undefined,
          agentId,
          expiresAt: chosen.lease.expiresAt,
          durationMinutes: chosen.lease.durationMinutes
        }
      });
    }
  }

  const fileConflictWarnings = TaskLeaseManager.checkFileConflicts(chosen, backlog);

  let governingStandards = [];
  if (typeof ctx.resolveStandardsForStory === 'function') {
    const res = ctx.resolveStandardsForStory(chosen);
    governingStandards = res.governingStandards || [];
  }

  return {
    task: {
      ...chosen,
      governingStandards,
      fileConflictWarnings
    },
    governingStandards,
    fileConflictWarnings
  };
}

export async function cmdGetBlockers(ctx, args) {
  const backlog = ctx.readBacklog();
  const allStories = backlog.stories || [];
  const allTasks = backlog.tasks || [];
  const blockedStories = allStories.filter(s => DependencyResolver.isBlocked(s, allStories, allTasks));
  const blockedTasks = allTasks.filter(t => DependencyResolver.isBlocked(t, allStories, allTasks));

  const detailedBlockers = [
    ...blockedStories.map(s => ({
      id: s.id,
      type: 'story',
      title: s.title,
      status: s.status,
      blockerReason: s.blockerReason || null,
      unmetDependencies: DependencyResolver.getUnmetDependencies(s, allStories, allTasks)
    })),
    ...blockedTasks.map(t => ({
      id: t.id,
      type: 'task',
      title: t.title,
      status: t.status,
      blockerReason: t.blockerReason || null,
      unmetDependencies: DependencyResolver.getUnmetDependencies(t, allStories, allTasks)
    }))
  ];

  return { blockers: detailedBlockers, count: detailedBlockers.length };
}

export async function cmdUpdateStatus(ctx, args) {
  const itemId = args.storyId || args.taskId || args.id;
  if (!itemId || !args.status) {
    return { error: 'Missing required: storyId/taskId, status' };
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

    const success = ctx.updateStoryStatus(itemId, args.status, metadata, options);
    if (!success) {
      const noun = (itemId && itemId.startsWith('TASK-')) ? 'Task' : 'Story';
      return { error: `${noun} not found: ${itemId}` };
    }
    
    return { success: true, storyId: itemId, taskId: itemId, status: args.status };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdReleaseLease(ctx, args) {
  const itemId = args.storyId || args.taskId || args.itemId || args.id;
  if (!itemId) {
    return { error: 'Missing required: storyId or taskId' };
  }

  const backlog = ctx.readBacklog();
  const story = (backlog.stories || []).find(s => s.id === itemId);
  const task = (backlog.tasks || []).find(t => t.id === itemId);
  const item = story || task;

  if (!item) {
    const noun = (itemId && itemId.startsWith('TASK-')) ? 'Task' : 'Story';
    return { error: `${noun} not found: ${itemId}` };
  }

  try {
    TaskLeaseManager.releaseLease(item, args.agent || args.agentId, !!args.force);
    ctx.writeBacklog(backlog);

    if (ctx.skyhookDir) {
      EventLedger.appendEvent(ctx.skyhookDir, {
        type: EVENT_TYPES.TASK_RELEASED,
        actor: args.agent || 'system',
        payload: { itemId: item.id, storyId: item.id }
      });
    }

    return { success: true, storyId: item.id, taskId: item.id, message: 'Lease released successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdAddTask(ctx, args) {
  if (!args.title) return { error: 'Missing required: title' };
  const parentId = args.parentId || args.storyId || args.epicId;
  if (!parentId) return { error: 'Missing required: parentId (or storyId / epicId)' };

  try {
    const task = ctx.addTask({
      title: args.title,
      description: args.description,
      parentId,
      parentType: args.parentType || (args.epicId ? 'epic' : 'story'),
      type: args.type || 'feature',
      status: args.status || 'ready',
      priority: args.priority || 'medium',
      storyPoints: args.storyPoints,
      estimatedMinutes: args.estimatedMinutes,
      targetFiles: args.targetFiles,
      standards: args.standards,
      dependsOn: args.dependsOn,
      subtasks: args.subtasks,
      actor: args.agent || args.agentId || 'system'
    });
    return { success: true, task };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdListTasks(ctx, args = {}) {
  const backlog = ctx.readBacklog();
  let tasks = backlog.tasks || [];
  if (!Array.isArray(tasks)) tasks = Object.values(tasks);

  const parentFilter = args.parentId || args.storyId || args.epicId;
  if (parentFilter) {
    tasks = tasks.filter(t => t.parentId === parentFilter || t.storyId === parentFilter);
  }
  if (args.status && args.status !== 'all') {
    tasks = tasks.filter(t => t.status === args.status);
  }
  if (args.type) {
    tasks = tasks.filter(t => t.type === args.type);
  }
  if (args.priority) {
    tasks = tasks.filter(t => t.priority === args.priority);
  }
  if (args.agentId || args.agent) {
    const ag = args.agentId || args.agent;
    tasks = tasks.filter(t => t.lease && t.lease.agentId === ag);
  }

  return { tasks, count: tasks.length };
}

export async function cmdGetTask(ctx, args) {
  const taskId = args.taskId || args.id;
  if (!taskId) return { error: 'Missing required: taskId' };

  const backlog = ctx.readBacklog();
  const task = (backlog.tasks || []).find(t => t.id === taskId);
  if (!task) return { error: 'Task not found: ' + taskId };

  return { task };
}

export async function cmdUpdateTaskStatus(ctx, args) {
  return cmdUpdateStatus(ctx, args);
}

export async function cmdAddSubtask(ctx, args) {
  const taskId = args.taskId || args.id;
  if (!taskId || !args.title) return { error: 'Missing required: taskId, title' };

  try {
    const subtask = ctx.addSubtask(taskId, args.title);
    return { success: true, subtask };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdToggleSubtask(ctx, args) {
  const taskId = args.taskId || args.id;
  const subtaskId = args.subtaskId || args.subId;
  if (!taskId || !subtaskId) return { error: 'Missing required: taskId, subtaskId' };

  try {
    const completed = args.completed !== undefined ? (args.completed === true || args.completed === 'true') : undefined;
    const subtask = ctx.toggleSubtask(taskId, subtaskId, completed);
    return { success: true, subtask };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdTaskHeartbeat(ctx, args) {
  const itemId = args.taskId || args.storyId || args.itemId || args.id;
  const agentId = args.agent || args.agentId;
  if (!itemId || !agentId) return { error: 'Missing required: taskId/storyId, agentId' };

  const backlog = ctx.readBacklog();
  const story = (backlog.stories || []).find(s => s.id === itemId);
  const task = (backlog.tasks || []).find(t => t.id === itemId);
  const item = story || task;

  if (!item) return { error: 'Work item not found: ' + itemId };

  try {
    const lease = TaskLeaseManager.heartbeatLease(item, agentId, args.extendMinutes ? Number(args.extendMinutes) : 30);
    ctx.writeBacklog(backlog);
    return { success: true, itemId: item.id, lease };
  } catch (err) {
    return { error: err.message };
  }
}

export async function cmdAddStory(ctx, args) {
  if (!args.title) return { error: 'Missing required: title' };

  try {
    const story = ctx.addStory({
      title: args.title,
      epicId: args.epicId,
      description: args.description,
      userStory: args.userStory,
      acceptanceCriteria: args.acceptanceCriteria,
      priority: args.priority,
      storyPoints: args.storyPoints,
      dependsOn: args.dependsOn,
      standards: args.standards,
      targetFiles: args.targetFiles,
      actor: args.agent || args.agentId || 'system'
    });
    return { success: true, story };
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
