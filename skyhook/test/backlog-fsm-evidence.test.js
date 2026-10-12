import test from 'node:test';
import assert from 'node:assert';
import { BacklogStateMachine, VALID_STATUSES, ALLOWED_TRANSITIONS } from '../lib/backlog/BacklogStateMachine.js';

function createSampleBacklog() {
  return {
    epics: [
      { id: 'EPIC-1', title: 'Core Architecture', status: 'in-progress' }
    ],
    stories: [
      {
        id: 'STORY-1',
        epicId: 'EPIC-1',
        title: 'Auth Pipeline',
        status: 'ready',
        acceptanceCriteria: ['Supports JWT tokens']
      }
    ],
    tasks: [
      {
        id: 'TASK-1',
        parentId: 'STORY-1',
        parentType: 'story',
        title: 'Implement token generator',
        status: 'ready'
      },
      {
        id: 'TASK-2',
        parentId: 'STORY-1',
        parentType: 'story',
        title: 'Implement token validator',
        status: 'ready'
      }
    ]
  };
}

test('VALID_STATUSES and ALLOWED_TRANSITIONS include implemented and verified', () => {
  assert.ok(VALID_STATUSES.includes('implemented'));
  assert.ok(VALID_STATUSES.includes('verified'));
  assert.ok(ALLOWED_TRANSITIONS['in-progress'].includes('implemented'));
  assert.ok(ALLOWED_TRANSITIONS['implemented'].includes('verified'));
  assert.ok(ALLOWED_TRANSITIONS['verified'].includes('done'));
});

test('Three-tier lifecycle progression: ready -> in-progress -> implemented -> verified -> done', () => {
  const backlog = createSampleBacklog();
  const taskId = 'TASK-1';

  // 1. ready -> in-progress
  const r1 = BacklogStateMachine.transition(backlog, taskId, 'in-progress');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r1.newStatus, 'in-progress');
  assert.ok(backlog.tasks[0].startedAt);

  // 2. in-progress -> implemented
  const r2 = BacklogStateMachine.transition(backlog, taskId, 'implemented');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(r2.newStatus, 'implemented');
  assert.ok(backlog.tasks[0].implementedAt);

  // 3. implemented -> verified (with evidence)
  const evidence = {
    commitHash: 'a1b2c3d4e5',
    changedFiles: ['lib/auth/token.js'],
    automatedChecks: {
      testCommand: 'npm test test/token.test.js',
      exitCode: 0,
      passedCount: 5,
      failedCount: 0
    }
  };
  const r3 = BacklogStateMachine.transition(backlog, taskId, 'verified', { evidence });
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.newStatus, 'verified');
  assert.ok(backlog.tasks[0].verifiedAt);
  assert.strictEqual(backlog.tasks[0].verificationStatus, 'verified');
  assert.deepStrictEqual(backlog.tasks[0].evidence, evidence);

  // 4. verified -> done
  const r4 = BacklogStateMachine.transition(backlog, taskId, 'done');
  assert.strictEqual(r4.success, true);
  assert.strictEqual(r4.newStatus, 'done');
  assert.ok(backlog.tasks[0].completedAt);
  assert.strictEqual(backlog.tasks[0].verificationStatus, 'verified');
});

test('Backward compatibility: direct in-progress -> done continues to work', () => {
  const backlog = createSampleBacklog();
  const taskId = 'TASK-1';

  BacklogStateMachine.transition(backlog, taskId, 'in-progress');
  const r = BacklogStateMachine.transition(backlog, taskId, 'done');
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.newStatus, 'done');
  assert.strictEqual(backlog.tasks[0].verificationStatus, 'unverified');
  assert.ok(r.warnings.some(w => w.includes('without automated verification evidence')));
});

test('Subtask completeness blocks transition to implemented, verified, and done unless forced', () => {
  const backlog = createSampleBacklog();
  const taskId = 'TASK-1';
  backlog.tasks[0].subtasks = [
    { id: 'sub-1', title: 'Write tests', completed: false },
    { id: 'sub-2', title: 'Implement feature', completed: true }
  ];

  BacklogStateMachine.transition(backlog, taskId, 'in-progress');

  // Blocking implemented
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'implemented');
  }, /Cannot mark 'TASK-1' as implemented: 1 uncompleted subtask\(s\) remain/);

  // Force override on implemented
  const f1 = BacklogStateMachine.transition(backlog, taskId, 'implemented', {}, { force: true });
  assert.strictEqual(f1.success, true);

  // Blocking verified
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'verified');
  }, /Cannot mark 'TASK-1' as verified: 1 uncompleted subtask\(s\) remain/);

  // Force override on verified
  const f2 = BacklogStateMachine.transition(backlog, taskId, 'verified', {}, { force: true });
  assert.strictEqual(f2.success, true);

  // Blocking done
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'done');
  }, /Cannot mark 'TASK-1' as done: 1 uncompleted subtask\(s\) remain/);

  // Complete subtask and succeed
  backlog.tasks[0].subtasks[0].completed = true;
  const f3 = BacklogStateMachine.transition(backlog, taskId, 'done');
  assert.strictEqual(f3.success, true);
  assert.strictEqual(f3.newStatus, 'done');
});

test('Evidence integrity: failing automated check (exitCode !== 0) rejects transition', () => {
  const backlog = createSampleBacklog();
  const taskId = 'TASK-1';

  BacklogStateMachine.transition(backlog, taskId, 'in-progress');
  BacklogStateMachine.transition(backlog, taskId, 'implemented');

  const failingEvidence = {
    automatedChecks: {
      testCommand: 'npm test test/token.test.js',
      exitCode: 1,
      failedCount: 2
    }
  };

  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'verified', { evidence: failingEvidence });
  }, /Cannot transition 'TASK-1' to 'verified': automated check failed with exit code 1/);

  // Direct move to done with failing evidence is also rejected
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'done', { evidence: failingEvidence });
  }, /Cannot transition 'TASK-1' to 'done': automated check failed with exit code 1/);
});

test('Strict evidence enforcement: rejects completion if strictEvidence is true and no evidence provided', () => {
  const backlog = createSampleBacklog();
  const taskId = 'TASK-1';

  BacklogStateMachine.transition(backlog, taskId, 'in-progress');
  BacklogStateMachine.transition(backlog, taskId, 'implemented');

  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'verified', {}, { strictEvidence: true });
  }, /Cannot mark 'TASK-1' as verified without verification evidence \(strictEvidence enabled\)/);

  assert.throws(() => {
    BacklogStateMachine.transition(backlog, taskId, 'done', {}, { strictEvidence: true });
  }, /Cannot mark 'TASK-1' as done without verification evidence \(strictEvidence enabled\)/);

  // Providing evidence passes strict check
  const passingEvidence = {
    commitHash: 'def456',
    automatedChecks: { exitCode: 0 }
  };
  const res = BacklogStateMachine.transition(backlog, taskId, 'verified', { evidence: passingEvidence }, { strictEvidence: true });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.newStatus, 'verified');
});

test('Hierarchical rollup: advances parent story to in-review when all sibling tasks are verified or done', () => {
  const backlog = createSampleBacklog();

  // Task 1: in-progress -> implemented -> verified
  BacklogStateMachine.transition(backlog, 'TASK-1', 'in-progress');
  BacklogStateMachine.transition(backlog, 'TASK-1', 'implemented');
  const r1 = BacklogStateMachine.transition(backlog, 'TASK-1', 'verified');
  assert.strictEqual(r1.rolledUpStory, null); // TASK-2 still ready

  // Task 2: in-progress -> done
  BacklogStateMachine.transition(backlog, 'TASK-2', 'in-progress');
  const r2 = BacklogStateMachine.transition(backlog, 'TASK-2', 'done');

  // Both tasks are either verified or done => parent story STORY-1 advances to in-review
  assert.ok(r2.rolledUpStory);
  assert.strictEqual(r2.rolledUpStory.id, 'STORY-1');
  assert.strictEqual(r2.rolledUpStory.status, 'in-review');
  assert.strictEqual(backlog.stories[0].status, 'in-review');
});

test('MCP Execution: skyhook_update_status and skyhook_update_task_status support implemented, verified and evidence', async () => {
  const { MCPToolRegistry } = await import('../lib/harness/mcp/MCPToolRegistry.js');
  const registry = MCPToolRegistry.createDefault();

  const state = {
    backlog: createSampleBacklog()
  };

  const mockCtx = {
    state,
    skyhookDir: null,
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; },
    updateStoryStatus: (itemId, status, metadata = {}, options = {}) => {
      BacklogStateMachine.transition(state.backlog, itemId, status, metadata, options);
      return true;
    }
  };

  // 1. Move TASK-1 to in-progress
  await registry.execute('skyhook_update_status', {
    taskId: 'TASK-1',
    status: 'in-progress'
  }, mockCtx);

  // 2. Move TASK-1 to implemented
  const impRes = await registry.execute('skyhook_update_task_status', {
    taskId: 'TASK-1',
    status: 'implemented'
  }, mockCtx);
  assert.strictEqual(impRes.isError, undefined);
  const impPayload = JSON.parse(impRes.content[0].text);
  assert.strictEqual(impPayload.success, true);
  assert.strictEqual(impPayload.status, 'implemented');
  assert.strictEqual(state.backlog.tasks[0].status, 'implemented');

  // 3. Move TASK-1 to verified with evidence
  const evidence = {
    commitHash: 'commit123',
    automatedChecks: { exitCode: 0, testCommand: 'npm test' }
  };
  const verRes = await registry.execute('skyhook_update_status', {
    taskId: 'TASK-1',
    status: 'verified',
    evidence,
    strictEvidence: true
  }, mockCtx);
  assert.strictEqual(verRes.isError, undefined);
  const verPayload = JSON.parse(verRes.content[0].text);
  assert.strictEqual(verPayload.success, true);
  assert.strictEqual(verPayload.status, 'verified');
  assert.strictEqual(state.backlog.tasks[0].status, 'verified');
  assert.strictEqual(state.backlog.tasks[0].verificationStatus, 'verified');
});
