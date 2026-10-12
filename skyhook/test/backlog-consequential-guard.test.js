import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BacklogStateMachine } from '../lib/backlog/BacklogStateMachine.js';
import { createSkyhookContext } from '../lib/context.js';
import { cmdClaimTask, cmdUpdateStatus } from '../lib/handlers/backlog.js';

test('Guard 2B: Consequential work item without ADR is blocked from in-progress', () => {
  const task = {
    id: 'TASK-001',
    title: 'Migrate user credentials schema',
    status: 'ready',
    consequential: true
  };

  const validation = BacklogStateMachine.validateTransition(task, 'in-progress', [task]);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.error.includes("Cannot start consequential task 'TASK-001' without an accepted ADR"));
  assert.ok(validation.error.includes("Link an accepted ADR or use --force"));
});

test('Guard 2B: Consequential work item with draft ADR is blocked from in-progress', () => {
  const story = {
    id: 'STORY-001',
    title: 'Multi-Region Failover Architecture',
    status: 'ready',
    tags: ['consequential', 'infrastructure'],
    decisionId: 'ADR-001'
  };

  const decisions = [
    { id: 'ADR-001', title: 'Multi-Region Strategy', status: 'draft' }
  ];

  const validation = BacklogStateMachine.validateTransition(story, 'in-progress', [story], { decisions });
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.error.includes("Cannot start consequential story 'STORY-001' without an accepted ADR"));
});

test('Guard 2B: Spike work item succeeds when linked to accepted ADR', () => {
  const spikeTask = {
    id: 'TASK-SPIKE-1',
    title: 'Spike: Quantum Resistance Cipher Evaluation',
    status: 'ready',
    type: 'spike',
    relatedDecisions: ['ADR-SEC-04']
  };

  const decisions = [
    { id: 'ADR-SEC-04', title: 'Adopt Post-Quantum TLS', status: 'accepted' }
  ];

  const validation = BacklogStateMachine.validateTransition(spikeTask, 'in-progress', [spikeTask], { decisions });
  assert.strictEqual(validation.valid, true);
});

test('Guard 2B: Force override bypasses consequential ADR requirement', () => {
  const task = {
    id: 'TASK-002',
    title: 'Emergency Hotfix Migration',
    status: 'ready',
    consequential: true
  };

  const validation = BacklogStateMachine.validateTransition(task, 'in-progress', [task], { force: true });
  assert.strictEqual(validation.valid, true);
});

test('Guard 2B: Normal non-consequential tasks transition without requiring ADR', () => {
  const task = {
    id: 'TASK-003',
    title: 'Update button styling',
    status: 'ready',
    type: 'feature'
  };

  const validation = BacklogStateMachine.validateTransition(task, 'in-progress', [task]);
  assert.strictEqual(validation.valid, true);
});

test('BacklogStateMachine.transition enforces Guard 2B and allows force override', () => {
  const backlog = {
    stories: [],
    tasks: [
      {
        id: 'TASK-004',
        title: 'Deprecate legacy API keys',
        status: 'ready',
        consequential: true
      }
    ]
  };

  assert.throws(
    () => BacklogStateMachine.transition(backlog, 'TASK-004', 'in-progress'),
    /Cannot start consequential task 'TASK-004' without an accepted ADR/
  );

  assert.doesNotThrow(() => {
    BacklogStateMachine.transition(backlog, 'TASK-004', 'in-progress', {}, { force: true });
  });

  assert.strictEqual(backlog.tasks[0].status, 'in-progress');
});

test('cmdClaimTask integration: auto-claim skips unapproved consequential task, explicit claim enforces guard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-claim-consequential-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });

  const backlog = {
    epics: [],
    stories: [
      { id: 'STORY-NORMAL', title: 'Normal Story', status: 'ready', priority: 'medium' }
    ],
    tasks: [
      {
        id: 'TASK-RISKY',
        parentId: 'STORY-NORMAL',
        title: 'Risky Migration',
        status: 'ready',
        priority: 'critical', // Highest priority, but consequential!
        consequential: true
      },
      {
        id: 'TASK-SAFE',
        parentId: 'STORY-NORMAL',
        title: 'Safe Task',
        status: 'ready',
        priority: 'high'
      }
    ]
  };

  fs.writeFileSync(path.join(skyhookDir, 'decisions', 'index.yaml'), 'decisions: []');

  const ctx = createSkyhookContext(tmpDir);
  ctx.writeBacklog(backlog);

  try {
    // 1. Auto-claim: TASK-RISKY is higher priority (critical vs high), but lacks accepted ADR.
    // It should skip TASK-RISKY and claim TASK-SAFE.
    const autoClaimRes = await cmdClaimTask(ctx, { agent: 'agent-1' });
    assert.strictEqual(autoClaimRes.success, true);
    assert.strictEqual(autoClaimRes.claimed, true);
    assert.strictEqual(autoClaimRes.task.id, 'TASK-SAFE');

    // 2. Explicit claim on TASK-RISKY by ID without force should reject
    const explicitClaimRes = await cmdClaimTask(ctx, { taskId: 'TASK-RISKY', agent: 'agent-2' });
    assert.strictEqual(explicitClaimRes.error !== undefined, true);
    assert.ok(explicitClaimRes.error.includes("Cannot start consequential task 'TASK-RISKY' without an accepted ADR"));

    // 3. Explicit claim with force should succeed
    const forcedClaimRes = await cmdClaimTask(ctx, { taskId: 'TASK-RISKY', agent: 'agent-2', force: true });
    assert.strictEqual(forcedClaimRes.success, true);
    assert.strictEqual(forcedClaimRes.claimed, true);
    assert.strictEqual(forcedClaimRes.task.id, 'TASK-RISKY');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdUpdateStatus integration: rejects in-progress on consequential item without accepted ADR', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-update-consequential-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });

  const backlog = {
    epics: [],
    stories: [],
    tasks: [
      {
        id: 'TASK-AUTH-OVERHAUL',
        title: 'Overhaul Session Store',
        status: 'ready',
        tags: ['consequential']
      }
    ]
  };

  fs.writeFileSync(path.join(skyhookDir, 'decisions', 'index.yaml'), 'decisions: []');

  const ctx = createSkyhookContext(tmpDir);
  ctx.writeBacklog(backlog);

  try {
    // 1. Attempt transition to in-progress without ADR
    const res = await cmdUpdateStatus(ctx, {
      taskId: 'TASK-AUTH-OVERHAUL',
      status: 'in-progress'
    });
    assert.strictEqual(res.error !== undefined, true);
    assert.ok(res.error.includes("Cannot start consequential task 'TASK-AUTH-OVERHAUL' without an accepted ADR"));

    // 2. Transition with force flag succeeds
    const forceRes = await cmdUpdateStatus(ctx, {
      taskId: 'TASK-AUTH-OVERHAUL',
      status: 'in-progress',
      force: true
    });
    assert.strictEqual(forceRes.success, true);
    assert.strictEqual(forceRes.status, 'in-progress');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
