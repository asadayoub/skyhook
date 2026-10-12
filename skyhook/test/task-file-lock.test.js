import test from 'node:test';
import assert from 'node:assert';
import { cmdGetNextTask, cmdClaimTask, cmdAddTask } from '../lib/handlers/backlog.js';

function createMockContext(initialBacklog = {}) {
  const state = {
    backlog: {
      epics: initialBacklog.epics || [],
      stories: initialBacklog.stories || [],
      tasks: initialBacklog.tasks || []
    }
  };

  return {
    state,
    skyhookDir: null,
    projectDir: null,
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; },
    readDecisions: () => ({ decisions: [] }),
    readFunctionalReqs: () => ({ requirements: [] }),
    addTask: (taskData) => {
      const task = {
        id: `TASK-${state.backlog.tasks.length + 1}`,
        ...taskData,
        targetFiles: Array.isArray(taskData.targetFiles) ? taskData.targetFiles : (taskData.targetFiles ? [taskData.targetFiles] : [])
      };
      state.backlog.tasks.push(task);
      return task;
    }
  };
}

test('TASK-F02: cmdGetNextTask skips tasks with conflicting target files held by another agent', async () => {
  const futureTime = new Date(Date.now() + 600000).toISOString();
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-1',
        title: 'Active Auth Work',
        status: 'in-progress',
        targetFiles: ['src/services/Auth.js'],
        lease: {
          agentId: 'agent-alpha',
          expiresAt: futureTime
        }
      },
      {
        id: 'TASK-2',
        title: 'High Priority Overlapping Task',
        status: 'ready',
        priority: 'critical',
        targetFiles: ['src/services/Auth.js'] // Conflicts with TASK-1 held by agent-alpha
      },
      {
        id: 'TASK-3',
        title: 'Medium Priority Independent Task',
        status: 'ready',
        priority: 'medium',
        targetFiles: ['src/services/Billing.js'] // Safe, no conflict
      }
    ]
  });

  // agent-beta requests work; should skip TASK-2 and receive independent TASK-3
  const res = await cmdGetNextTask(ctx, { agent: 'agent-beta', lease: 30 });
  assert.ok(res.task, 'Expected independent task to be selected');
  assert.strictEqual(res.task.id, 'TASK-3');
  assert.strictEqual(res.task.lease.agentId, 'agent-beta');
});

test('TASK-F02: cmdClaimTask rejects specific task if target files are actively locked by another agent', async () => {
  const futureTime = new Date(Date.now() + 600000).toISOString();
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-1',
        title: 'Active Auth Work',
        status: 'in-progress',
        targetFiles: ['src/services/Auth.js'],
        lease: {
          agentId: 'agent-alpha',
          expiresAt: futureTime
        }
      },
      {
        id: 'TASK-2',
        title: 'Conflicting Task',
        status: 'ready',
        priority: 'high',
        targetFiles: ['src/services/Auth.js', 'src/models/User.js']
      }
    ]
  });

  // agent-beta explicitly attempts to claim conflicting TASK-2
  const res = await cmdClaimTask(ctx, { taskId: 'TASK-2', agent: 'agent-beta' });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.claimed, false);
  assert.ok(res.error.includes('File lock contention'), 'Error should specify file lock contention');
  assert.ok(res.error.includes('src/services/Auth.js'), 'Error should list conflicting file');
  assert.ok(res.error.includes('agent-alpha'), 'Error should identify holding agent');
  assert.ok(res.error.includes('TASK-1'), 'Error should identify holding task ID');
});

test('TASK-F02: holding agent can claim and re-query own task without self-contention', async () => {
  const futureTime = new Date(Date.now() + 600000).toISOString();
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-1',
        title: 'Active Auth Work',
        status: 'in-progress',
        targetFiles: ['src/services/Auth.js'],
        lease: {
          agentId: 'agent-alpha',
          expiresAt: futureTime
        }
      }
    ]
  });

  // agent-alpha requests claim matching its own active lease (idempotent resume)
  const res = await cmdClaimTask(ctx, { taskId: 'TASK-1', agent: 'agent-alpha' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.claimed, true);
  assert.strictEqual(res.task.id, 'TASK-1');
});

test('TASK-F02: exclusiveFiles: false permits bypass of file conflict locks if explicitly requested', async () => {
  const futureTime = new Date(Date.now() + 600000).toISOString();
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-1',
        title: 'Active Auth Work',
        status: 'in-progress',
        targetFiles: ['src/services/Auth.js'],
        lease: {
          agentId: 'agent-alpha',
          expiresAt: futureTime
        }
      },
      {
        id: 'TASK-2',
        title: 'High Priority Overlapping Task',
        status: 'ready',
        priority: 'critical',
        targetFiles: ['src/services/Auth.js']
      }
    ]
  });

  // agent-beta passes exclusiveFiles: false
  const res = await cmdGetNextTask(ctx, { agent: 'agent-beta', lease: 30, exclusiveFiles: false });
  assert.ok(res.task);
  assert.strictEqual(res.task.id, 'TASK-2');
});

test('TASK-F02: cmdAddTask normalizes comma-separated targetFiles string into an array', async () => {
  const ctx = createMockContext();

  const res = await cmdAddTask(ctx, {
    title: 'Multi-file feature',
    parentId: 'EPIC-1',
    parentType: 'epic',
    targetFiles: 'src/components/Header.jsx, src/styles/theme.css, src/utils.js'
  });

  assert.strictEqual(res.success, true);
  assert.ok(Array.isArray(res.task.targetFiles));
  assert.deepStrictEqual(res.task.targetFiles, [
    'src/components/Header.jsx',
    'src/styles/theme.css',
    'src/utils.js'
  ]);
});
