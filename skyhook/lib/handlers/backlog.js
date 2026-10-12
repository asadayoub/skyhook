import fs from 'fs';
import path from 'path';
import { generateULID, getTimestamp, writeYaml } from '../utils.js';
import { DependencyResolver } from '../backlog/DependencyResolver.js';
import { TaskLeaseManager } from '../backlog/TaskLeaseManager.js';
import { BacklogLock } from '../backlog/BacklogLock.js';
import { BacklogStateMachine, VALID_STATUSES } from '../backlog/BacklogStateMachine.js';
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

/**
 * Atomically claim and lease the next ready task or specified task,
 * transitioning it to in-progress and assembling an execution context packet.
 */
export async function cmdClaimTask(ctx, args = {}) {
  const agentId = args.agent || args.agentId || args.assignee || 'anonymous-agent';
  const leaseMinutes = args.lease ? Number(args.lease) : 30;
  const level = args.level || 'any';
  const specificId = args.taskId || args.storyId || args.id || null;
  const filterStory = args.story || args.storyId || null;
  const filterType = args.type || null;
  const filterEpic = args.epic || null;
  const role = args.role || null;

  const skyhookDir = ctx.skyhookDir || (ctx.projectDir ? path.join(ctx.projectDir, '.skyhook') : null);

  const executeClaim = () => {
    try {
      const backlog = ctx.readBacklog();
      const allStories = backlog.stories || [];
    const allTasks = backlog.tasks || [];
    const allEpics = backlog.epics || [];

    TaskLeaseManager.sweepExpiredLeases(backlog);

    let chosen = null;

    if (specificId) {
      const foundTask = allTasks.find(t => t.id === specificId);
      const foundStory = allStories.find(s => s.id === specificId);
      chosen = foundTask || foundStory;

      if (!chosen) {
        return { success: false, claimed: false, error: `Work item '${specificId}' not found in backlog` };
      }

      // Check if already in-progress by this agent (idempotent resume)
      const isAlreadyClaimedByAgent = chosen.status === 'in-progress' &&
        chosen.lease && chosen.lease.agentId === agentId;

      if (!isAlreadyClaimedByAgent) {
        // Validate dependencies
        const unmet = DependencyResolver.getUnmetDependencies(chosen, allStories, allTasks);
        if (unmet.length > 0) {
          const unmetDesc = unmet.map(d => `${d.id} (${d.status})`).join(', ');
          return {
            success: false,
            claimed: false,
            error: `Cannot claim '${chosen.id}': unresolved dependencies: ${unmetDesc}`
          };
        }

        // Validate lease collision
        if (TaskLeaseManager.isLeased(chosen) && chosen.lease.agentId !== agentId) {
          return {
            success: false,
            claimed: false,
            error: `Work item '${chosen.id}' is already leased by agent '${chosen.lease.agentId}' until ${chosen.lease.expiresAt}`
          };
        }
      }
    } else {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortByPriority = (items) => [...items].sort((a, b) => {
        const pa = typeof a.priority === 'string' ? (priorityOrder[a.priority] ?? 2) : (100 - (a.priority || 50));
        const pb = typeof b.priority === 'string' ? (priorityOrder[b.priority] ?? 2) : (100 - (b.priority || 50));
        return pa - pb;
      });

      let candidateTasks = [];
      if (level !== 'story') {
        candidateTasks = allTasks.filter(t => {
          if (t.status !== 'ready') return false;
          if (filterStory && t.parentId !== filterStory && t.storyId !== filterStory) return false;
          if (filterType && t.type !== filterType) return false;
          if (role && t.agentRole && t.agentRole !== role) return false;

          const unmet = DependencyResolver.getUnmetDependencies(t, allStories, allTasks);
          if (unmet.length > 0) return false;

          if (TaskLeaseManager.isLeased(t) && t.lease.agentId !== agentId) return false;

          const parentStory = allStories.find(s => s.id === t.parentId);
          if (parentStory && TaskLeaseManager.isLeased(parentStory) && parentStory.lease.agentId !== agentId) return false;

          if (!args.force) {
            const decData = typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : { decisions: [] };
            const v = BacklogStateMachine.validateTransition(t, 'in-progress', allTasks, {
              agentId,
              decisions: decData?.decisions || []
            });
            if (!v.valid) return false;
          }

          return true;
        });
        candidateTasks = sortByPriority(candidateTasks);
      }

      let candidateStories = [];
      if (level !== 'task') {
        candidateStories = allStories.filter(s => {
          if (s.status !== 'ready') return false;
          if (filterStory && s.id !== filterStory) return false;
          if (filterEpic && s.epicId !== filterEpic) return false;
          if (role && s.agentRole && s.agentRole !== role) return false;

          const unmet = DependencyResolver.getUnmetDependencies(s, allStories, allTasks);
          if (unmet.length > 0) return false;

          if (TaskLeaseManager.isLeased(s) && s.lease.agentId !== agentId) return false;

          const hasOtherChildLease = allTasks.some(t =>
            t.parentId === s.id && TaskLeaseManager.isLeased(t) && t.lease.agentId !== agentId
          );
          if (hasOtherChildLease) return false;

          if (!args.force) {
            const decData = typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : { decisions: [] };
            const v = BacklogStateMachine.validateTransition(s, 'in-progress', allStories, {
              agentId,
              decisions: decData?.decisions || []
            });
            if (!v.valid) return false;
          }

          return true;
        });
        candidateStories = sortByPriority(candidateStories);
      }

      chosen = level === 'task'
        ? (candidateTasks[0] || null)
        : level === 'story'
          ? (candidateStories[0] || null)
          : (candidateTasks[0] || candidateStories[0] || null);

      if (!chosen) {
        return { success: true, claimed: false, message: 'No ready tasks found in backlog', task: null };
      }
    }

    const isTask = !!chosen.parentId || (chosen.id && chosen.id.startsWith('TASK-'));

    // 1. Acquire Lease
    if (isTask) {
      TaskLeaseManager.acquireTaskLease(chosen, agentId, leaseMinutes, backlog);
    } else {
      TaskLeaseManager.acquireLease(chosen, agentId, leaseMinutes);
    }

    // 2. Transition State: ready -> in-progress
    if (chosen.status !== 'in-progress') {
      const decData = typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : { decisions: [] };
      BacklogStateMachine.transition(
        backlog,
        chosen.id,
        'in-progress',
        { agentId, reason: 'Claimed by agent via cmdClaimTask' },
        { force: !!args.force, decisions: decData?.decisions || [] }
      );
    }

    // Persist backlog mutations
    ctx.writeBacklog(backlog);

    // 3. Record in Event Ledger
    if (skyhookDir) {
      EventLedger.appendEvent(skyhookDir, {
        type: EVENT_TYPES.TASK_LEASED,
        actor: agentId,
        payload: {
          storyId: isTask ? chosen.parentId : chosen.id,
          taskId: isTask ? chosen.id : undefined,
          agentId,
          expiresAt: chosen.lease?.expiresAt,
          durationMinutes: leaseMinutes
        }
      });

      EventLedger.appendEvent(skyhookDir, {
        type: isTask ? EVENT_TYPES.TASK_STATE_TRANSITIONED : EVENT_TYPES.STATE_TRANSITIONED,
        actor: agentId,
        payload: {
          workId: chosen.id,
          storyId: isTask ? chosen.parentId : chosen.id,
          taskId: isTask ? chosen.id : null,
          from: 'ready',
          to: 'in-progress',
          reason: 'Claimed by agent via cmdClaimTask'
        }
      });
    }

    // 4. Multi-Domain Context Packaging
    let parentStory = null;
    let parentEpic = null;

    if (isTask) {
      parentStory = allStories.find(s => s.id === chosen.parentId) || null;
      if (parentStory) {
        parentEpic = allEpics.find(e => e.id === parentStory.epicId) || null;
      }
    } else {
      parentEpic = allEpics.find(e => e.id === chosen.epicId) || null;
    }

    // Linked Requirements
    const reqIds = [
      ...(chosen.relatedRequirements || []),
      ...(parentStory?.relatedRequirements || [])
    ];
    let matchedRequirements = [];
    if (typeof ctx.readFunctionalReqs === 'function') {
      const funcReqs = ctx.readFunctionalReqs() || { requirements: [] };
      matchedRequirements = (funcReqs.requirements || []).filter(r => reqIds.includes(r.id)).map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        acceptanceCriteria: r.acceptanceCriteria || [],
        priority: r.priority
      }));
    }

    // Governing Standards
    let governingStandards = [];
    if (typeof ctx.resolveStandardsForStory === 'function') {
      const stdRes = ctx.resolveStandardsForStory(chosen);
      governingStandards = stdRes.governingStandards || [];
    }

    // Applicable ADR Invariants
    const applicableADRs = [];
    if (typeof ctx.readDecisions === 'function') {
      const decData = ctx.readDecisions() || { decisions: [] };
      for (const d of (decData.decisions || [])) {
        if (d.status === 'accepted' && d.enforcement?.rules) {
          for (const rule of d.enforcement.rules) {
            applicableADRs.push({
              id: d.id,
              title: d.title,
              prohibitedImports: rule.prohibitedImports || [],
              forbiddenInDir: rule.forbiddenInDir || null
            });
          }
        }
      }
    }

    // Target Files & Concurrency Warnings
    const fileConflictWarnings = TaskLeaseManager.checkFileConflicts(chosen, backlog);
    const targetFiles = Array.isArray(chosen.targetFiles) ? chosen.targetFiles : [];

    // Verification Plan
    const suggestedUnitTests = targetFiles.map(tf => {
      const base = path.basename(tf).replace(/\.[^.]+$/, '');
      return `test/${base}.test.js`;
    });

    return {
      success: true,
      claimed: true,
      task: {
        id: chosen.id,
        parentId: chosen.parentId || null,
        title: chosen.title,
        description: chosen.description || '',
        type: chosen.type || 'feature',
        priority: chosen.priority || 'medium',
        status: chosen.status,
        startedAt: chosen.startedAt,
        lease: chosen.lease,
        targetFiles,
        subtasks: chosen.subtasks || []
      },
      context: {
        parentStory: parentStory ? {
          id: parentStory.id,
          title: parentStory.title,
          userStory: parentStory.userStory || parentStory.description || '',
          acceptanceCriteria: parentStory.acceptanceCriteria || [],
          storyPoints: parentStory.storyPoints
        } : null,
        parentEpic: parentEpic ? {
          id: parentEpic.id,
          title: parentEpic.title,
          goal: parentEpic.goal || parentEpic.description || ''
        } : null,
        requirements: matchedRequirements,
        governingStandards,
        applicableADRs,
        verificationPlan: {
          suggestedUnitTests,
          testCommand: suggestedUnitTests.length > 0 ? `npm test ${suggestedUnitTests[0]}` : 'npm test',
          policyCheckRequired: applicableADRs.length > 0
        }
      },
      warnings: {
        fileConflictWarnings,
        unmetDependencies: []
      }
    };
    } catch (err) {
      return { success: false, claimed: false, error: err.message };
    }
  };

  if (skyhookDir) {
    return BacklogLock.withLockSync(skyhookDir, executeClaim);
  }
  return executeClaim();
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

export function normalizeEvidence(args) {
  let evidence = args.evidence;
  if (typeof evidence === 'string') {
    try {
      evidence = JSON.parse(evidence);
    } catch {
      evidence = { notes: evidence };
    }
  }

  const commitHash = args.commitHash || args.commit;
  const testCommand = args.testCommand || args.test;
  const exitCode = args.testExitCode !== undefined 
    ? Number(args.testExitCode) 
    : (args.exitCode !== undefined 
      ? Number(args.exitCode) 
      : (args['exit-code'] !== undefined ? Number(args['exit-code']) : undefined));

  if (!evidence && (commitHash || testCommand || exitCode !== undefined || args.notes)) {
    evidence = {};
    if (commitHash) evidence.commitHash = commitHash;
    if (args.changedFiles && Array.isArray(args.changedFiles)) evidence.changedFiles = args.changedFiles;
    if (testCommand || exitCode !== undefined) {
      evidence.automatedChecks = {
        testCommand: testCommand || 'automated-test',
        exitCode: exitCode !== undefined ? exitCode : 0,
        passedCount: args.passedCount !== undefined ? Number(args.passedCount) : (args.passed !== undefined ? Number(args.passed) : undefined),
        failedCount: args.failedCount !== undefined ? Number(args.failedCount) : (args.failed !== undefined ? Number(args.failed) : undefined)
      };
    }
    if (args.notes) {
      evidence.manualVerification = {
        notes: args.notes,
        verifiedBy: args.agent || args.agentId
      };
    }
  }

  return evidence;
}

export async function cmdUpdateStatus(ctx, args) {
  const itemId = args.storyId || args.taskId || args.id;
  if (!itemId || !args.status) {
    return { error: 'Missing required: storyId/taskId, status' };
  }
  
  if (!VALID_STATUSES.includes(args.status)) {
    return { error: 'Invalid status. Must be one of: ' + VALID_STATUSES.join(', ') };
  }

  try {
    const evidence = normalizeEvidence(args);

    const metadata = {
      reason: args.reason,
      agentId: args.agent || args.agentId,
      leaseMinutes: args.lease ? Number(args.lease) : null,
      evidence
    };

    const options = {
      force: !!args.force,
      strictEvidence: !!(args.strictEvidence || args.strict)
    };

    const success = ctx.updateStoryStatus(itemId, args.status, metadata, options);
    if (!success) {
      const noun = (itemId && itemId.startsWith('TASK-')) ? 'Task' : 'Story';
      return { error: `${noun} not found: ${itemId}` };
    }
    
    return { success: true, storyId: itemId, taskId: itemId, status: args.status, evidence };
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
