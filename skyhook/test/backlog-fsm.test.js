import test from 'node:test';
import assert from 'node:assert';
import { BacklogStateMachine } from '../lib/backlog/BacklogStateMachine.js';

function createSampleBacklog() {
  return {
    epics: [
      { id: 'EPIC-1', title: 'Authentication System', status: 'in-progress', childStories: ['STORY-1', 'STORY-2'] }
    ],
    stories: [
      { id: 'STORY-1', epicId: 'EPIC-1', title: 'User Login API', status: 'backlog', priority: 'high', acceptanceCriteria: ['Returns JWT'] },
      { id: 'STORY-2', epicId: 'EPIC-1', title: 'Forgot Password', status: 'backlog', priority: 'medium', dependsOn: ['STORY-1'], acceptanceCriteria: ['Sends reset email'] }
    ]
  };
}

test('BacklogStateMachine permits valid transition path backlog -> ready -> in-progress -> in-review -> done', () => {
  const backlog = createSampleBacklog();
  const storyId = 'STORY-1';

  // 1. backlog -> ready
  const r1 = BacklogStateMachine.transition(backlog, storyId, 'ready');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.newStatus, 'ready');

  // 2. ready -> in-progress
  const r2 = BacklogStateMachine.transition(backlog, storyId, 'in-progress');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.newStatus, 'in-progress');
  assert.ok(backlog.stories[0].startedAt);

  // 3. in-progress -> in-review
  const r3 = BacklogStateMachine.transition(backlog, storyId, 'in-review');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.newStatus, 'in-review');

  // 4. in-review -> done
  const r4 = BacklogStateMachine.transition(backlog, storyId, 'done');
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.newStatus, 'done');
  assert.ok(backlog.stories[0].completedAt);
});

test('BacklogStateMachine blocks illegal state leap without force flag', () => {
  const backlog = createSampleBacklog();
  const storyId = 'STORY-1';

  // Attempt jumping directly from backlog to done
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, storyId, 'done');
  }, /Illegal state transition: Cannot move story from 'backlog' to 'done'/);
});

test('BacklogStateMachine allows override with force flag', () => {
  const backlog = createSampleBacklog();
  const storyId = 'STORY-1';

  const res = BacklogStateMachine.transition(backlog, storyId, 'done', {}, { force: true });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.newStatus, 'done');
});

test('BacklogStateMachine enforces dependency resolution before entering ready', () => {
  const backlog = createSampleBacklog();
  // STORY-2 depends on STORY-1, which is currently 'backlog'
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, 'STORY-2', 'ready');
  }, /Cannot transition to 'ready': Story has unresolved dependencies: STORY-1/);
});

test('BacklogStateMachine cascades unblocks when prerequisite story completes', () => {
  const backlog = createSampleBacklog();
  // Put STORY-2 into blocked status
  backlog.stories[1].status = 'blocked';
  backlog.stories[1].blockerReason = 'Waiting on STORY-1';

  // Advance STORY-1 through to done
  BacklogStateMachine.transition(backlog, 'STORY-1', 'ready');
  BacklogStateMachine.transition(backlog, 'STORY-1', 'in-progress');
  BacklogStateMachine.transition(backlog, 'STORY-1', 'done');

  // Verify STORY-2 was automatically unblocked and moved to ready
  const story2 = backlog.stories.find(s => s.id === 'STORY-2');
  assert.strictEqual(story2.status, 'ready');
  assert.strictEqual(story2.blockerReason, undefined);
});

test('BacklogStateMachine cascades epic completion when all child stories are done', () => {
  const backlog = createSampleBacklog();

  // Complete STORY-1
  BacklogStateMachine.transition(backlog, 'STORY-1', 'ready');
  BacklogStateMachine.transition(backlog, 'STORY-1', 'in-progress');
  BacklogStateMachine.transition(backlog, 'STORY-1', 'done');

  // Complete STORY-2
  BacklogStateMachine.transition(backlog, 'STORY-2', 'ready');
  BacklogStateMachine.transition(backlog, 'STORY-2', 'in-progress');
  const res = BacklogStateMachine.transition(backlog, 'STORY-2', 'done');

  assert.strictEqual(res.epicCompleted, true);
  const epic = backlog.epics.find(e => e.id === 'EPIC-1');
  assert.strictEqual(epic.status, 'done');
});
