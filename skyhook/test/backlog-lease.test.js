import test from 'node:test';
import assert from 'node:assert';
import { cmdGetNextTask, cmdReleaseLease } from '../lib/handlers/backlog.js';
import { TaskLeaseManager } from '../lib/backlog/TaskLeaseManager.js';

function createMockContext(stories = []) {
  const state = {
    backlog: {
      epics: [],
      stories
    }
  };

  return {
    state,
    skyhookDir: null,
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; }
  };
}

test('cmdGetNextTask leases task when agent parameter is supplied', async () => {
  const ctx = createMockContext([
    { id: 'TASK-1', title: 'Setup Database', status: 'ready', priority: 'high' }
  ]);

  const result = await cmdGetNextTask(ctx, { agent: 'agent-alpha', lease: 15 });
  assert.ok(result.task);
  assert.strictEqual(result.task.id, 'TASK-1');
  assert.ok(result.task.lease);
  assert.strictEqual(result.task.lease.agentId, 'agent-alpha');
  assert.strictEqual(result.task.lease.durationMinutes, 15);
});

test('cmdGetNextTask prevents concurrent agent collision on leased task', async () => {
  const ctx = createMockContext([
    { id: 'TASK-1', title: 'Setup Database', status: 'ready', priority: 'high' },
    { id: 'TASK-2', title: 'Build Dashboard', status: 'ready', priority: 'medium' }
  ]);

  // Agent 1 claims first task
  const r1 = await cmdGetNextTask(ctx, { agent: 'agent-alpha', lease: 30 });
  assert.strictEqual(r1.task.id, 'TASK-1');

  // Agent 2 requests task; should receive TASK-2, NOT TASK-1
  const r2 = await cmdGetNextTask(ctx, { agent: 'agent-beta', lease: 30 });
  assert.strictEqual(r2.task.id, 'TASK-2');
  assert.strictEqual(r2.task.lease.agentId, 'agent-beta');
});

test('cmdGetNextTask respects expired leases and makes task available again', async () => {
  const ctx = createMockContext([
    {
      id: 'TASK-1',
      title: 'Setup Database',
      status: 'ready',
      priority: 'high',
      lease: {
        agentId: 'agent-crashed',
        leasedAt: '2026-09-28T10:00:00.000Z',
        expiresAt: '2026-09-28T10:05:00.000Z' // Already expired in the past
      }
    }
  ]);

  // Agent 2 should be able to claim it since previous lease expired
  const r = await cmdGetNextTask(ctx, { agent: 'agent-new', lease: 20 });
  assert.ok(r.task);
  assert.strictEqual(r.task.id, 'TASK-1');
  assert.strictEqual(r.task.lease.agentId, 'agent-new');
});

test('cmdReleaseLease releases active lease cleanly', async () => {
  const ctx = createMockContext([
    {
      id: 'TASK-1',
      title: 'Setup Database',
      status: 'ready',
      priority: 'high',
      lease: {
        agentId: 'agent-alpha',
        expiresAt: new Date(Date.now() + 60000).toISOString()
      }
    }
  ]);

  const releaseRes = await cmdReleaseLease(ctx, { storyId: 'TASK-1', agent: 'agent-alpha' });
  assert.strictEqual(releaseRes.success, true);

  const task = ctx.state.backlog.stories[0];
  assert.strictEqual(task.lease, undefined);
});
