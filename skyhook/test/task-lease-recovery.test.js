import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TaskLeaseManager } from '../lib/backlog/TaskLeaseManager.js';
import { cmdGetNextTask, cmdClaimTask, cmdReleaseLease } from '../lib/handlers/backlog.js';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';

function createMockContext(initialBacklog = {}, options = {}) {
  const state = {
    backlog: {
      epics: initialBacklog.epics || [],
      stories: initialBacklog.stories || [],
      tasks: initialBacklog.tasks || []
    }
  };

  return {
    state,
    skyhookDir: options.skyhookDir || null,
    projectDir: options.projectDir || null,
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; },
    readDecisions: () => ({ decisions: [] }),
    readFunctionalReqs: () => ({ requirements: [] })
  };
}

test('TASK-F01: TaskLeaseManager.sweepExpiredLeases reverts in-progress task without evidence to ready', () => {
  const pastTime = new Date(Date.now() - 60000).toISOString();
  const backlog = {
    epics: [],
    stories: [
      { id: 'STORY-1', title: 'Auth Story', status: 'in-progress' }
    ],
    tasks: [
      {
        id: 'TASK-1',
        parentId: 'STORY-1',
        title: 'Crashed Agent Task',
        status: 'in-progress',
        assignee: { type: 'agent', identifier: 'agent-crashed', name: 'agent-crashed' },
        lease: {
          agentId: 'agent-crashed',
          leasedAt: new Date(Date.now() - 120000).toISOString(),
          expiresAt: pastTime
        },
        fileConflictWarnings: [{ file: 'src/auth.js' }]
      }
    ]
  };

  const sweepRes = TaskLeaseManager.sweepExpiredLeases(backlog);

  assert.strictEqual(Number(sweepRes), 1);
  assert.strictEqual(sweepRes.sweptCount, 1);
  assert.strictEqual(sweepRes.sweptItems.length, 1);
  assert.strictEqual(sweepRes.sweptItems[0].id, 'TASK-1');
  assert.strictEqual(sweepRes.sweptItems[0].oldStatus, 'in-progress');
  assert.strictEqual(sweepRes.sweptItems[0].newStatus, 'ready');

  const task = backlog.tasks[0];
  assert.strictEqual(task.status, 'ready');
  assert.strictEqual(task.lease, undefined);
  assert.strictEqual(task.fileConflictWarnings, undefined);
  assert.strictEqual(task.assignee, undefined);
  assert.strictEqual(task.previousAssignee.identifier, 'agent-crashed');
});

test('TASK-F01: TaskLeaseManager.sweepExpiredLeases transitions in-progress task with evidence to in-review', () => {
  const pastTime = new Date(Date.now() - 60000).toISOString();
  const backlog = {
    epics: [],
    stories: [],
    tasks: [
      {
        id: 'TASK-2',
        title: 'Partial Work Task',
        status: 'in-progress',
        evidence: {
          changedFiles: ['src/db.js'],
          commitHash: 'abc1234'
        },
        lease: {
          agentId: 'agent-worker',
          expiresAt: pastTime
        }
      }
    ]
  };

  const sweepRes = TaskLeaseManager.sweepExpiredLeases(backlog);
  assert.strictEqual(sweepRes.sweptCount, 1);
  assert.strictEqual(backlog.tasks[0].status, 'in-review');
});

test('TASK-F01: TaskLeaseManager.sweepExpiredLeases reverts in-progress story to ready', () => {
  const pastTime = new Date(Date.now() - 60000).toISOString();
  const backlog = {
    epics: [],
    stories: [
      {
        id: 'STORY-10',
        title: 'Abandoned Story',
        status: 'in-progress',
        lease: {
          agentId: 'agent-disconnected',
          expiresAt: pastTime
        }
      }
    ],
    tasks: []
  };

  const sweepRes = TaskLeaseManager.sweepExpiredLeases(backlog);
  assert.strictEqual(sweepRes.sweptCount, 1);
  assert.strictEqual(backlog.stories[0].status, 'ready');
});

test('TASK-F01: cmdGetNextTask automatically recovers crashed task and leases to healthy agent', async () => {
  const pastTime = new Date(Date.now() - 60000).toISOString();
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-100',
        title: 'Mission Critical Task',
        status: 'in-progress', // Crashed worker left it in-progress
        priority: 'high',
        lease: {
          agentId: 'crashed-agent-404',
          leasedAt: new Date(Date.now() - 1800000).toISOString(),
          expiresAt: pastTime
        }
      }
    ]
  });

  // Next agent requests a task
  const result = await cmdGetNextTask(ctx, { agent: 'healthy-agent-007', lease: 30 });

  assert.ok(result.task, 'Expected task to be recovered and allocated');
  assert.strictEqual(result.task.id, 'TASK-100');
  assert.strictEqual(result.task.lease.agentId, 'healthy-agent-007');

  // Verify backlog was persisted with active lease
  const persisted = ctx.state.backlog.tasks[0];
  assert.strictEqual(persisted.lease.agentId, 'healthy-agent-007');
});

test('TASK-F01: cmdReleaseLease resets in-progress task back to ready and archives assignee', async () => {
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-55',
        title: 'Build UI Widget',
        status: 'in-progress',
        assignee: { type: 'agent', identifier: 'agent-1' },
        lease: {
          agentId: 'agent-1',
          expiresAt: new Date(Date.now() + 600000).toISOString()
        }
      }
    ]
  });

  const res = await cmdReleaseLease(ctx, { taskId: 'TASK-55', agent: 'agent-1' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'ready');

  const task = ctx.state.backlog.tasks[0];
  assert.strictEqual(task.status, 'ready');
  assert.strictEqual(task.lease, undefined);
  assert.strictEqual(task.assignee, undefined);
  assert.strictEqual(task.previousAssignee.identifier, 'agent-1');
});

test('TASK-F01: TASK_LEASE_EXPIRED is recorded in EventLedger when leases expire', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-lease-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const pastTime = new Date(Date.now() - 60000).toISOString();
  const ctx = createMockContext({
    tasks: [
      {
        id: 'TASK-88',
        title: 'Ledger Audit Task',
        status: 'in-progress',
        priority: 'high',
        lease: {
          agentId: 'ghost-agent',
          expiresAt: pastTime
        }
      }
    ]
  }, { skyhookDir, projectDir: tmpDir });

  // Calling cmdGetNextTask should sweep and log TASK_LEASE_EXPIRED
  await cmdGetNextTask(ctx, { agent: 'live-agent', lease: 30 });

  const events = EventLedger.readEvents(skyhookDir);
  const expiredEvent = events.find(e => e.type === EVENT_TYPES.TASK_LEASE_EXPIRED);

  assert.ok(expiredEvent, 'Expected TASK_LEASE_EXPIRED event in ledger');
  assert.strictEqual(expiredEvent.payload.itemId, 'TASK-88');
  assert.strictEqual(expiredEvent.payload.oldStatus, 'in-progress');
  assert.strictEqual(expiredEvent.payload.newStatus, 'ready');
  assert.strictEqual(expiredEvent.payload.agentId, 'ghost-agent');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

