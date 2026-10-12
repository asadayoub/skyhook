import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSkyhookContext } from '../lib/context.js';
import { BacklogStateMachine } from '../lib/backlog/BacklogStateMachine.js';
import { writeYaml } from '../lib/utils.js';

function setupTempProject(initialTasks = []) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-subtask-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  const projectData = {
    schemaVersion: '1.0.0',
    id: 'test-project',
    name: 'Subtask Test',
    profile: 'web-app'
  };
  writeYaml(path.join(skyhookDir, 'project.yaml'), projectData);

  const epicsData = {
    epics: [{ id: 'EPIC-1', title: 'Test Epic' }],
    stories: [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'Test Story' }],
    tasks: initialTasks
  };
  writeYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'), epicsData);

  const ctx = createSkyhookContext(tmpDir);
  return { ctx, tmpDir, skyhookDir };
}

test('TASK-F03: toggleSubtask advances task from in-progress to implemented when all subtasks completed', () => {
  const { ctx, tmpDir } = setupTempProject([
    {
      id: 'TASK-1',
      parentId: 'STORY-1',
      parentType: 'story',
      title: 'Auth Implementation',
      status: 'in-progress',
      subtasks: [
        { id: 'SUB-001', title: 'Write tests', completed: false }
      ]
    }
  ]);

  const sub = ctx.toggleSubtask('TASK-1', 'SUB-001', true);
  assert.strictEqual(sub.completed, true);

  const backlog = ctx.readBacklog();
  const task = backlog.tasks.find(t => t.id === 'TASK-1');
  assert.strictEqual(task.status, 'implemented');
  assert.ok(task.implementedAt);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F03: toggleSubtask advances task from ready to in-progress when first subtask is completed', () => {
  const { ctx, tmpDir } = setupTempProject([
    {
      id: 'TASK-2',
      parentId: 'STORY-1',
      parentType: 'story',
      title: 'Database Schema',
      status: 'ready',
      subtasks: [
        { id: 'SUB-001', title: 'Draft migrations', completed: false },
        { id: 'SUB-002', title: 'Run seeds', completed: false }
      ]
    }
  ]);

  ctx.toggleSubtask('TASK-2', 'SUB-001', true);

  const backlog = ctx.readBacklog();
  const task = backlog.tasks.find(t => t.id === 'TASK-2');
  assert.strictEqual(task.status, 'in-progress');
  assert.ok(task.startedAt);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F03: toggleSubtask reverts task from implemented to in-progress if a subtask is untoggled', () => {
  const { ctx, tmpDir } = setupTempProject([
    {
      id: 'TASK-3',
      parentId: 'STORY-1',
      parentType: 'story',
      title: 'Feature X',
      status: 'implemented',
      implementedAt: new Date().toISOString(),
      subtasks: [
        { id: 'SUB-001', title: 'Step 1', completed: true },
        { id: 'SUB-002', title: 'Step 2', completed: true }
      ]
    }
  ]);

  ctx.toggleSubtask('TASK-3', 'SUB-002', false);

  const backlog = ctx.readBacklog();
  const task = backlog.tasks.find(t => t.id === 'TASK-3');
  assert.strictEqual(task.status, 'in-progress');
  assert.strictEqual(task.implementedAt, undefined);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F03: BacklogStateMachine.validateTransition blocks moving task to done with open subtasks', () => {
  const taskWithOpenSubtasks = {
    id: 'TASK-10',
    title: 'Payment Integration',
    status: 'in-progress',
    subtasks: [
      { id: 'SUB-001', title: 'Stripe webhook', completed: true },
      { id: 'SUB-002', title: 'Idempotency key', completed: false }
    ]
  };

  const validation = BacklogStateMachine.validateTransition(
    taskWithOpenSubtasks,
    'done',
    [taskWithOpenSubtasks]
  );

  assert.strictEqual(validation.valid, false);
  assert.ok(validation.error.includes('uncompleted subtask(s) remain'));
  assert.ok(validation.error.includes('SUB-002'));
});

test('TASK-F03: BacklogStateMachine.validateTransition allows moving to done when all subtasks completed', () => {
  const taskWithDoneSubtasks = {
    id: 'TASK-11',
    title: 'Payment Integration',
    status: 'implemented',
    subtasks: [
      { id: 'SUB-001', title: 'Stripe webhook', completed: true },
      { id: 'SUB-002', title: 'Idempotency key', completed: true }
    ]
  };

  const validation = BacklogStateMachine.validateTransition(
    taskWithDoneSubtasks,
    'done',
    [taskWithDoneSubtasks]
  );

  assert.strictEqual(validation.valid, true);
});

test('TASK-F03: BacklogStateMachine.validateTransition allows moving to done with open subtasks if forced', () => {
  const taskWithOpenSubtasks = {
    id: 'TASK-12',
    title: 'Hotfix Task',
    status: 'in-progress',
    subtasks: [
      { id: 'SUB-001', title: 'Fix bug', completed: true },
      { id: 'SUB-002', title: 'Write extra documentation', completed: false }
    ]
  };

  const validation = BacklogStateMachine.validateTransition(
    taskWithOpenSubtasks,
    'done',
    [taskWithOpenSubtasks],
    { force: true }
  );

  assert.strictEqual(validation.valid, true);
});
