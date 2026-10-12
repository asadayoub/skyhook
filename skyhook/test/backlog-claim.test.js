import test from 'node:test';
import assert from 'node:assert';
import { cmdClaimTask } from '../lib/handlers/backlog.js';

function createMockContext(initialBacklog = {}, extras = {}) {
  const state = {
    backlog: {
      epics: initialBacklog.epics || [],
      stories: initialBacklog.stories || [],
      tasks: initialBacklog.tasks || []
    },
    decisions: {
      decisions: extras.decisions || []
    },
    requirements: {
      requirements: extras.requirements || []
    }
  };

  return {
    state,
    skyhookDir: null,
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; },
    readDecisions: () => state.decisions,
    readFunctionalReqs: () => state.requirements
  };
}

test('cmdClaimTask: atomically leases and moves ready task to in-progress with rich context', async () => {
  const ctx = createMockContext({
    epics: [
      { id: 'EPIC-1', title: 'Core Security', goal: 'Zero trust authentication' }
    ],
    stories: [
      {
        id: 'STORY-1',
        epicId: 'EPIC-1',
        title: 'User Authentication',
        userStory: 'As a user I want to log in securely',
        acceptanceCriteria: ['Valid JWT returned', 'Token expires in 1h'],
        relatedRequirements: ['REQ-001'],
        storyPoints: 3
      }
    ],
    tasks: [
      {
        id: 'TASK-1',
        parentId: 'STORY-1',
        title: 'Implement JWT Token Signer',
        status: 'ready',
        priority: 'high',
        targetFiles: ['src/auth/jwt.js'],
        subtasks: [
          { id: 'SUB-1', title: 'Sign payload', completed: false }
        ]
      }
    ]
  }, {
    requirements: [
      {
        id: 'REQ-001',
        title: 'JWT Authentication',
        description: 'Authenticate users using signed JWTs',
        acceptanceCriteria: ['HS256 or RS256 algorithm', 'Short TTL'],
        priority: 'critical'
      }
    ],
    decisions: [
      {
        id: 'ADR-001',
        title: 'Stateless JWT Auth',
        status: 'accepted',
        enforcement: {
          rules: [
            {
              prohibitedImports: ['express-session'],
              forbiddenInDir: 'src/auth'
            }
          ]
        }
      }
    ]
  });

  const res = await cmdClaimTask(ctx, { agent: 'cursor-agent-1', lease: 45 });

  // 1. Core claim invariants
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.claimed, true);
  assert.strictEqual(res.task.id, 'TASK-1');
  assert.strictEqual(res.task.status, 'in-progress');
  assert.ok(res.task.startedAt);
  assert.strictEqual(res.task.lease.agentId, 'cursor-agent-1');
  assert.strictEqual(res.task.lease.durationMinutes, 45);

  // 2. Parent Story and Epic context
  assert.ok(res.context.parentStory);
  assert.strictEqual(res.context.parentStory.id, 'STORY-1');
  assert.strictEqual(res.context.parentStory.title, 'User Authentication');
  assert.deepStrictEqual(res.context.parentStory.acceptanceCriteria, ['Valid JWT returned', 'Token expires in 1h']);
  assert.ok(res.context.parentEpic);
  assert.strictEqual(res.context.parentEpic.id, 'EPIC-1');
  assert.strictEqual(res.context.parentEpic.goal, 'Zero trust authentication');

  // 3. Linked Requirements context
  assert.strictEqual(res.context.requirements.length, 1);
  assert.strictEqual(res.context.requirements[0].id, 'REQ-001');
  assert.strictEqual(res.context.requirements[0].title, 'JWT Authentication');

  // 4. Applicable ADR Invariants
  assert.strictEqual(res.context.applicableADRs.length, 1);
  assert.strictEqual(res.context.applicableADRs[0].id, 'ADR-001');
  assert.deepStrictEqual(res.context.applicableADRs[0].prohibitedImports, ['express-session']);

  // 5. Verification Plan
  assert.deepStrictEqual(res.context.verificationPlan.suggestedUnitTests, ['test/jwt.test.js']);
  assert.strictEqual(res.context.verificationPlan.policyCheckRequired, true);

  // 6. State persisted in backlog
  const backlogTask = ctx.state.backlog.tasks.find(t => t.id === 'TASK-1');
  assert.strictEqual(backlogTask.status, 'in-progress');
  assert.strictEqual(backlogTask.lease.agentId, 'cursor-agent-1');
});

test('cmdClaimTask: priority ordering picks highest priority ready task', async () => {
  const ctx = createMockContext({
    tasks: [
      { id: 'TASK-LOW', title: 'Low Priority Work', status: 'ready', priority: 'low' },
      { id: 'TASK-CRIT', title: 'Critical Bugfix', status: 'ready', priority: 'critical' },
      { id: 'TASK-MED', title: 'Medium Feature', status: 'ready', priority: 'medium' }
    ]
  });

  const res = await cmdClaimTask(ctx, { agent: 'agent-alpha' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.task.id, 'TASK-CRIT');
  assert.strictEqual(res.task.status, 'in-progress');
});

test('cmdClaimTask: claiming specific task by ID succeeds', async () => {
  const ctx = createMockContext({
    tasks: [
      { id: 'TASK-1', title: 'First Task', status: 'ready', priority: 'high' },
      { id: 'TASK-2', title: 'Second Task', status: 'ready', priority: 'low' }
    ]
  });

  const res = await cmdClaimTask(ctx, { taskId: 'TASK-2', agent: 'agent-beta' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.task.id, 'TASK-2');
  assert.strictEqual(res.task.status, 'in-progress');
  assert.strictEqual(res.task.lease.agentId, 'agent-beta');
});

test('cmdClaimTask: idempotent resume by same agent preserves in-progress state', async () => {
  const ctx = createMockContext({
    tasks: [
      { id: 'TASK-1', title: 'In Progress Task', status: 'ready', priority: 'high' }
    ]
  });

  // First claim
  const first = await cmdClaimTask(ctx, { taskId: 'TASK-1', agent: 'agent-alpha' });
  assert.strictEqual(first.success, true);
  assert.strictEqual(first.task.status, 'in-progress');

  // Second claim by same agent (e.g. after context reset)
  const second = await cmdClaimTask(ctx, { taskId: 'TASK-1', agent: 'agent-alpha' });
  assert.strictEqual(second.success, true);
  assert.strictEqual(second.claimed, true);
  assert.strictEqual(second.task.id, 'TASK-1');
  assert.strictEqual(second.task.status, 'in-progress');
  assert.strictEqual(second.task.lease.agentId, 'agent-alpha');
});

test('cmdClaimTask: prevents collision when task is leased by another agent', async () => {
  const ctx = createMockContext({
    tasks: [
      { id: 'TASK-1', title: 'DB Migration', status: 'ready', priority: 'high' }
    ]
  });

  // Agent 1 claims task
  await cmdClaimTask(ctx, { taskId: 'TASK-1', agent: 'agent-1', lease: 30 });

  // Agent 2 attempts to claim same task specifically
  const res = await cmdClaimTask(ctx, { taskId: 'TASK-1', agent: 'agent-2' });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.claimed, false);
  assert.ok(res.error.includes('already leased by agent'));
});

test('cmdClaimTask: blocks claiming task with unmet dependencies', async () => {
  const ctx = createMockContext({
    tasks: [
      { id: 'TASK-1', title: 'Prerequisite Schema', status: 'ready', priority: 'medium' },
      { id: 'TASK-2', title: 'Dependent API', status: 'ready', priority: 'high', dependsOn: ['TASK-1'] }
    ]
  });

  // Specific claim on TASK-2 fails
  const res = await cmdClaimTask(ctx, { taskId: 'TASK-2', agent: 'agent-1' });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.claimed, false);
  assert.ok(res.error.includes('unresolved dependencies'));

  // Auto-pickup skips TASK-2 and picks TASK-1
  const autoRes = await cmdClaimTask(ctx, { agent: 'agent-1' });
  assert.strictEqual(autoRes.success, true);
  assert.strictEqual(autoRes.task.id, 'TASK-1');
});

test('cmdClaimTask: returns clean message when no ready tasks exist', async () => {
  const ctx = createMockContext({
    tasks: [
      { id: 'TASK-1', title: 'Done Task', status: 'done', priority: 'high' }
    ]
  });

  const res = await cmdClaimTask(ctx, { agent: 'agent-1' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.claimed, false);
  assert.strictEqual(res.task, null);
  assert.ok(res.message.includes('No ready tasks found'));
});

