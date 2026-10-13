import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSkyhookContext } from '../lib/context.js';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdDrift } from '../lib/handlers/sync.js';
import { DriftAutoFixer } from '../lib/drift/DriftAutoFixer.js';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';

function createTempDir(prefix = 'skyhook-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('TASK-F08: cmdInit generates architecture-boundaries.yaml tailored to profile', async () => {
  const tmpDirWebApp = createTempDir('skyhook-init-webapp-');
  const tmpDirApi = createTempDir('skyhook-init-api-');
  const tmpDirLib = createTempDir('skyhook-init-lib-');

  try {
    // 1. Web-app profile
    await cmdInit({ projectDir: tmpDirWebApp }, { name: 'WebAppProject', profile: 'web-app' });
    const webAppBoundaries = path.join(tmpDirWebApp, '.skyhook', 'architecture-boundaries.yaml');
    assert.ok(fs.existsSync(webAppBoundaries));
    const webAppContent = fs.readFileSync(webAppBoundaries, 'utf-8');
    assert.ok(webAppContent.includes('presentation'));
    assert.ok(webAppContent.includes('application'));
    assert.ok(webAppContent.includes('domain'));
    assert.ok(webAppContent.includes('infrastructure'));

    // 2. Api-service profile
    await cmdInit({ projectDir: tmpDirApi }, { name: 'ApiProject', profile: 'api-service' });
    const apiBoundaries = path.join(tmpDirApi, '.skyhook', 'architecture-boundaries.yaml');
    assert.ok(fs.existsSync(apiBoundaries));
    const apiContent = fs.readFileSync(apiBoundaries, 'utf-8');
    assert.ok(apiContent.includes('api'));
    assert.ok(apiContent.includes('services'));
    assert.ok(apiContent.includes('domain'));
    assert.ok(apiContent.includes('db'));

    // 3. Library profile
    await cmdInit({ projectDir: tmpDirLib }, { name: 'LibProject', profile: 'library' });
    const libBoundaries = path.join(tmpDirLib, '.skyhook', 'architecture-boundaries.yaml');
    assert.ok(fs.existsSync(libBoundaries));
    const libContent = fs.readFileSync(libBoundaries, 'utf-8');
    assert.ok(libContent.includes('public-api'));
    assert.ok(libContent.includes('core'));
    assert.ok(libContent.includes('internal'));
  } finally {
    fs.rmSync(tmpDirWebApp, { recursive: true, force: true });
    fs.rmSync(tmpDirApi, { recursive: true, force: true });
    fs.rmSync(tmpDirLib, { recursive: true, force: true });
  }
});

test('TASK-F08: DriftAutoFixer.enqueueRemediationTasks creates epic and actionable backlog tasks', async () => {
  const tmpDir = createTempDir('skyhook-enqueue-');

  try {
    await cmdInit({ projectDir: tmpDir }, { name: 'EnqueueProject' });
    const ctx = createSkyhookContext(tmpDir);

    const violations = [
      {
        type: 'LAYER_VIOLATION',
        file: 'src/presentation/UserController.js',
        from: 'src/presentation/UserController.js',
        to: 'src/infrastructure/UserRepository.js',
        message: 'Presentation layer directly imports Infrastructure repository.'
      },
      {
        type: 'CIRCULAR_DEPENDENCY',
        cycle: ['src/services/AuthService.js', 'src/services/TokenService.js', 'src/services/AuthService.js']
      }
    ];

    const result = DriftAutoFixer.enqueueRemediationTasks(ctx, violations);

    assert.strictEqual(result.enqueuedCount, 2);
    assert.strictEqual(result.skippedCount, 0);
    assert.strictEqual(result.epicId, 'EPIC-ARCH-REMEDIATION');

    // Verify backlog contains epic and tasks
    const backlog = ctx.readBacklog();
    const epic = backlog.epics.find(e => e.id === 'EPIC-ARCH-REMEDIATION');
    assert.ok(epic);
    assert.strictEqual(epic.title, 'Architecture Remediation');

    const tasks = backlog.tasks.filter(t => t.parentId === 'EPIC-ARCH-REMEDIATION');
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].type, 'refactor');
    assert.strictEqual(tasks[0].priority, 'high');
    assert.ok(tasks[0].targetFiles.includes('src/presentation/UserController.js'));

    // Second run should be idempotent
    const secondResult = DriftAutoFixer.enqueueRemediationTasks(ctx, violations);
    assert.strictEqual(secondResult.enqueuedCount, 0);
    assert.strictEqual(secondResult.skippedCount, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F08: cmdDrift with --enqueue enqueues tasks into backlog', async () => {
  const tmpDir = createTempDir('skyhook-driftenqueue-');

  try {
    await cmdInit({ projectDir: tmpDir }, { name: 'DriftEnqueueProject', profile: 'web-app' });
    const srcDir = path.join(tmpDir, 'src');
    const compDir = path.join(srcDir, 'components');
    const infraDir = path.join(srcDir, 'infrastructure');
    fs.mkdirSync(compDir, { recursive: true });
    fs.mkdirSync(infraDir, { recursive: true });

    // Boundary violation: component directly importing infrastructure
    fs.writeFileSync(path.join(infraDir, 'db.js'), 'export const db = {};', 'utf-8');
    fs.writeFileSync(path.join(compDir, 'UserWidget.js'), `import { db } from '../infrastructure/db.js';`, 'utf-8');

    const ctx = createSkyhookContext(tmpDir);
    const scorecard = await cmdDrift(ctx, { enqueue: true });

    assert.ok(scorecard.enqueued);
    assert.ok(scorecard.enqueued.enqueuedCount >= 1);

    const backlog = ctx.readBacklog();
    const enqueuedTasks = backlog.tasks.filter(t => t.parentId === 'EPIC-ARCH-REMEDIATION');
    assert.ok(enqueuedTasks.length >= 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F08: DashboardRPCHandler.adoptDrift supports enqueueTasks option', async () => {
  const tmpDir = createTempDir('skyhook-rpc-adopt-');

  try {
    await cmdInit({ projectDir: tmpDir }, { name: 'RpcAdoptProject', profile: 'web-app' });
    const skyhookDir = path.join(tmpDir, '.skyhook');

    // Create a boundary violation
    const srcDir = path.join(tmpDir, 'src');
    const compDir = path.join(srcDir, 'components');
    const infraDir = path.join(srcDir, 'infrastructure');
    fs.mkdirSync(compDir, { recursive: true });
    fs.mkdirSync(infraDir, { recursive: true });

    fs.writeFileSync(path.join(infraDir, 'repo.js'), 'export const repo = {};', 'utf-8');
    fs.writeFileSync(path.join(compDir, 'Header.js'), `import { repo } from '../infrastructure/repo.js';`, 'utf-8');

    const result = await DashboardRPCHandler.adoptDrift(
      skyhookDir,
      [{ name: 'sqlite3', category: 'Database' }],
      { enqueueTasks: true }
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.enqueueResult);
    assert.ok(result.enqueueResult.enqueuedCount >= 1);

    // Verify tech stack updated
    const ctx = createSkyhookContext(tmpDir);
    const techStack = ctx.readTechStack();
    assert.ok(techStack.technologies.some(t => t.name === 'sqlite3'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

