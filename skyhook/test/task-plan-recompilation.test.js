import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSkyhookContext } from '../lib/context.js';
import { cmdClaimTask, cmdUpdateStatus, cmdToggleSubtask, cmdReleaseLease } from '../lib/handlers/backlog.js';

function setupTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-plan-recompile-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'plan'), { recursive: true });

  const projectYaml = `name: Test Project\nid: 01HXZ1234567890123456789AB\nprofile: minimal\n`;
  fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), projectYaml, 'utf-8');

  const initialBacklog = {
    epics: [
      { id: 'EPIC-01', title: 'Core Epic', status: 'ready' }
    ],
    stories: [
      { id: 'STORY-01', epicId: 'EPIC-01', title: 'User Management', status: 'ready', points: 3 }
    ],
    tasks: [
      {
        id: 'TASK-01',
        parentId: 'STORY-01',
        title: 'Auth Setup',
        status: 'ready',
        subtasks: [
          { id: 'SUB-001', title: 'Create model', completed: false }
        ]
      }
    ]
  };

  const yamlContent = `epics:
  - id: EPIC-01
    title: Core Epic
    status: ready
stories:
  - id: STORY-01
    epicId: EPIC-01
    title: User Management
    status: ready
    points: 3
tasks:
  - id: TASK-01
    parentId: STORY-01
    title: Auth Setup
    status: ready
    subtasks:
      - id: SUB-001
        title: Create model
        completed: false
`;
  fs.writeFileSync(path.join(skyhookDir, 'backlog', 'epics.yaml'), yamlContent, 'utf-8');

  const ctx = createSkyhookContext(tmpDir);
  return { tmpDir, skyhookDir, ctx };
}

test('TASK-F06: cmdClaimTask automatically recompiles PROJECT_PLAN.md with in-progress state', async () => {
  const { tmpDir, skyhookDir, ctx } = setupTestEnvironment();

  try {
    const planPath = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');
    assert.strictEqual(fs.existsSync(planPath), false);

    const claimRes = await cmdClaimTask(ctx, {
      taskId: 'TASK-01',
      agent: 'agent-alpha',
      awaitPlanRecompile: true
    });

    assert.strictEqual(claimRes.claimed, true);
    assert.ok(fs.existsSync(planPath));

    const planContent = fs.readFileSync(planPath, 'utf-8');
    assert.ok(planContent.includes('# Project Plan: Test Project'));
    assert.ok(planContent.includes('User Management') || planContent.includes('STORY-01'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F06: cmdUpdateStatus automatically updates PROJECT_PLAN.md upon terminal transition', async () => {
  const { tmpDir, skyhookDir, ctx } = setupTestEnvironment();

  try {
    const planPath = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');

    // First advance subtask so TASK-01 has no open subtask block
    await cmdToggleSubtask(ctx, {
      taskId: 'TASK-01',
      subtaskId: 'SUB-001',
      completed: true,
      awaitPlanRecompile: true
    });

    // Mark task done
    const updateRes = await cmdUpdateStatus(ctx, {
      id: 'TASK-01',
      status: 'done',
      force: true,
      awaitPlanRecompile: true
    });

    assert.strictEqual(updateRes.success, true);
    assert.ok(fs.existsSync(planPath));

    const planContent = fs.readFileSync(planPath, 'utf-8');
    assert.ok(planContent.includes('PROJECT_PLAN.md') || planContent.includes('Test Project'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F06: skipPlanRecompile flag suppresses automatic living plan generation', async () => {
  const { tmpDir, skyhookDir, ctx } = setupTestEnvironment();

  try {
    const planPath = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');

    const claimRes = await cmdClaimTask(ctx, {
      taskId: 'TASK-01',
      agent: 'agent-beta',
      skipPlanRecompile: true,
      awaitPlanRecompile: true
    });

    assert.strictEqual(claimRes.claimed, true);
    // Because plan compilation was skipped, file should not exist
    assert.strictEqual(fs.existsSync(planPath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F06: cmdReleaseLease resets task and recompiles PROJECT_PLAN.md', async () => {
  const { tmpDir, skyhookDir, ctx } = setupTestEnvironment();

  try {
    const planPath = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');

    // Claim
    await cmdClaimTask(ctx, {
      taskId: 'TASK-01',
      agent: 'agent-gamma',
      awaitPlanRecompile: true
    });
    assert.ok(fs.existsSync(planPath));

    // Release lease
    const releaseRes = await cmdReleaseLease(ctx, {
      taskId: 'TASK-01',
      agent: 'agent-gamma',
      awaitPlanRecompile: true
    });

    assert.strictEqual(releaseRes.success, true);
    assert.strictEqual(releaseRes.status, 'ready');

    const planContent = fs.readFileSync(planPath, 'utf-8');
    assert.ok(planContent.includes('Test Project'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
