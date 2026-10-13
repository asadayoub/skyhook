import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSkyhookContext } from '../lib/context.js';
import { writeYaml } from '../lib/utils.js';

function setupTempProject(initialEpics = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-dag-cycle-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  const projectData = {
    schemaVersion: '1.0.0',
    id: 'dag-test-project',
    name: 'DAG Cycle Test',
    profile: 'web-app'
  };
  writeYaml(path.join(skyhookDir, 'project.yaml'), projectData);

  const epicsData = {
    epics: initialEpics.epics || [{ id: 'EPIC-1', title: 'Main Epic' }],
    stories: initialEpics.stories || [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'Main Story' }],
    tasks: initialEpics.tasks || []
  };
  writeYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'), epicsData);

  const ctx = createSkyhookContext(tmpDir);
  return { ctx, tmpDir, skyhookDir };
}

test('TASK-F04: addTask rejects self-dependency cycle', () => {
  const { ctx, tmpDir } = setupTempProject();

  assert.throws(() => {
    ctx.addTask({
      id: 'TASK-SELF',
      parentId: 'STORY-1',
      title: 'Self-dependent task',
      dependsOn: ['TASK-SELF']
    });
  }, /introduces circular dependency cycle/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F04: addStory rejects self-dependency cycle', () => {
  const { ctx, tmpDir } = setupTempProject();

  assert.throws(() => {
    ctx.addStory({
      id: 'STORY-SELF',
      epicId: 'EPIC-1',
      title: 'Self-dependent story',
      dependsOn: ['STORY-SELF']
    });
  }, /introduces circular dependency cycle/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F04: addTask and updateTask reject 2-node circular dependencies', () => {
  const { ctx, tmpDir } = setupTempProject();

  // Add Task 1
  const t1 = ctx.addTask({
    id: 'TASK-1',
    parentId: 'STORY-1',
    title: 'First Task'
  });
  assert.strictEqual(t1.id, 'TASK-1');

  // Add Task 2 depending on Task 1 (valid linear DAG)
  const t2 = ctx.addTask({
    id: 'TASK-2',
    parentId: 'STORY-1',
    title: 'Second Task',
    dependsOn: ['TASK-1']
  });
  assert.strictEqual(t2.id, 'TASK-2');

  // Attempt to update Task 1 to depend on Task 2 (would create TASK-1 -> TASK-2 -> TASK-1)
  assert.throws(() => {
    ctx.updateTask('TASK-1', {
      dependsOn: ['TASK-2']
    });
  }, /introduces circular dependency cycle: TASK-1 -> TASK-2 -> TASK-1/);

  // Verify backlog on disk was not corrupted
  const backlog = ctx.readBacklog();
  const task1 = backlog.tasks.find(t => t.id === 'TASK-1');
  assert.deepStrictEqual(task1.dependsOn, []);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F04: updateStory rejects multi-node circular dependency cycle', () => {
  const { ctx, tmpDir } = setupTempProject();

  ctx.addStory({ id: 'STORY-A', epicId: 'EPIC-1', title: 'Story A' });
  ctx.addStory({ id: 'STORY-B', epicId: 'EPIC-1', title: 'Story B', dependsOn: ['STORY-A'] });
  ctx.addStory({ id: 'STORY-C', epicId: 'EPIC-1', title: 'Story C', dependsOn: ['STORY-B'] });

  // Updating STORY-A to depend on STORY-C introduces A -> C -> B -> A cycle
  assert.throws(() => {
    ctx.updateStory('STORY-A', {
      dependsOn: ['STORY-C']
    });
  }, /introduces circular dependency cycle/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F04: cross-hierarchy cycle between story and task is rejected', () => {
  const { ctx, tmpDir } = setupTempProject();

  ctx.addStory({ id: 'STORY-AUTH', epicId: 'EPIC-1', title: 'Auth Story' });
  ctx.addTask({
    id: 'TASK-TOKEN',
    parentId: 'STORY-AUTH',
    title: 'Token Task',
    dependsOn: ['STORY-AUTH']
  });

  // Attempt to update STORY-AUTH to depend on TASK-TOKEN
  assert.throws(() => {
    ctx.updateStory('STORY-AUTH', {
      dependsOn: ['TASK-TOKEN']
    });
  }, /introduces circular dependency cycle/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TASK-F04: valid complex DAG persists without false positive cycles', () => {
  const { ctx, tmpDir } = setupTempProject();

  // Diamond dependency pattern:
  //      T1
  //     /  \
  //    T2   T3
  //     \  /
  //      T4
  ctx.addTask({ id: 'TASK-D1', parentId: 'STORY-1', title: 'Diamond Root' });
  ctx.addTask({ id: 'TASK-D2', parentId: 'STORY-1', title: 'Diamond Branch A', dependsOn: ['TASK-D1'] });
  ctx.addTask({ id: 'TASK-D3', parentId: 'STORY-1', title: 'Diamond Branch B', dependsOn: ['TASK-D1'] });
  const t4 = ctx.addTask({
    id: 'TASK-D4',
    parentId: 'STORY-1',
    title: 'Diamond Join',
    dependsOn: ['TASK-D2', 'TASK-D3']
  });

  assert.strictEqual(t4.id, 'TASK-D4');
  assert.deepStrictEqual(t4.dependsOn, ['TASK-D2', 'TASK-D3']);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

