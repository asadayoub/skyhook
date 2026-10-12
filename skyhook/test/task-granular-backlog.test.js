import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SkyhookContext } from '../lib/context.js';
import { BacklogStorage } from '../lib/backlog/BacklogStorage.js';
import { BacklogMergeDriver } from '../lib/git/BacklogMergeDriver.js';
import { cmdBacklogMigrate } from '../lib/handlers/backlog.js';
import { GitHookManager } from '../lib/git/GitHookManager.js';
import { readYaml, writeYaml } from '../lib/utils.js';

function setupWorkspaceWithMonolithicBacklog() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-storage-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const backlogDir = path.join(skyhookDir, 'backlog');
  fs.mkdirSync(backlogDir, { recursive: true });

  const backlog = {
    schemaVersion: '1.0.0',
    metadata: { createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z', version: '0.1.0' },
    epics: [
      { id: 'EPIC-AUTH', title: 'Authentication', status: 'ready' }
    ],
    stories: [
      { id: 'STORY-AUTH-01', epicId: 'EPIC-AUTH', title: 'Login API', status: 'ready', priority: 'high', relatedRequirements: ['REQ-AUTH-01'] }
    ],
    tasks: [
      {
        id: 'TASK-AUTH-01',
        storyId: 'STORY-AUTH-01',
        title: 'JWT handler',
        status: 'ready',
        targetFiles: ['src/auth/jwt.js'],
        subtasks: [
          { id: 'SUB-1', title: 'Validate secret', completed: false }
        ]
      }
    ]
  };

  writeYaml(path.join(backlogDir, 'epics.yaml'), backlog);
  const ctx = new SkyhookContext(tmpDir);
  return { tmpDir, skyhookDir, backlogDir, ctx, backlog };
}

test('TASK-F13: BacklogStorage modular directory layout read/write roundtrip', async () => {
  const { tmpDir, skyhookDir, ctx } = setupWorkspaceWithMonolithicBacklog();

  try {
    assert.strictEqual(ctx.isModularBacklog(), false);

    // Write modular backlog
    const modularData = {
      epics: [{ id: 'EPIC-BILL', title: 'Billing Epic', status: 'ready' }],
      stories: [{ id: 'STORY-BILL-01', epicId: 'EPIC-BILL', title: 'Stripe Integration', status: 'ready' }],
      tasks: [{ id: 'TASK-BILL-01', storyId: 'STORY-BILL-01', title: 'Webhook handler', status: 'ready', subtasks: [] }]
    };
    BacklogStorage.writeModularBacklog(skyhookDir, modularData);

    assert.strictEqual(ctx.isModularBacklog(), true);
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'epics', 'EPIC-BILL.yaml')));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'stories', 'STORY-BILL-01.yaml')));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'tasks', 'TASK-BILL-01.yaml')));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'metadata.yaml')));

    // Read through context
    const loaded = ctx.readBacklog();
    assert.strictEqual(loaded.epics.length, 1);
    assert.strictEqual(loaded.epics[0].id, 'EPIC-BILL');
    assert.strictEqual(loaded.stories[0].id, 'STORY-BILL-01');
    assert.strictEqual(loaded.tasks[0].id, 'TASK-BILL-01');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F13: cmdBacklogMigrate converts monolithic epics.yaml to modular directory layout', async () => {
  const { tmpDir, skyhookDir, ctx } = setupWorkspaceWithMonolithicBacklog();

  try {
    const res = await cmdBacklogMigrate(ctx, { format: 'modular' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.format, 'modular');
    assert.strictEqual(res.counts.epics, 1);
    assert.strictEqual(res.counts.stories, 1);
    assert.strictEqual(res.counts.tasks, 1);

    assert.strictEqual(ctx.isModularBacklog(), true);
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'epics', 'EPIC-AUTH.yaml')));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'stories', 'STORY-AUTH-01.yaml')));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'tasks', 'TASK-AUTH-01.yaml')));

    const loaded = ctx.readBacklog();
    assert.strictEqual(loaded.epics[0].id, 'EPIC-AUTH');
    assert.strictEqual(loaded.stories[0].id, 'STORY-AUTH-01');
    assert.strictEqual(loaded.tasks[0].id, 'TASK-AUTH-01');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F13: cmdBacklogMigrate converts modular layout back to monolithic epics.yaml cleanly', async () => {
  const { tmpDir, skyhookDir, ctx } = setupWorkspaceWithMonolithicBacklog();

  try {
    // 1. Migrate to modular
    await cmdBacklogMigrate(ctx, { format: 'modular' });
    assert.strictEqual(ctx.isModularBacklog(), true);

    // 2. Add an item while modular
    const modular = ctx.readBacklog();
    modular.tasks.push({ id: 'TASK-AUTH-02', storyId: 'STORY-AUTH-01', title: 'Refresh token', status: 'ready', subtasks: [] });
    ctx.writeBacklog(modular);

    // 3. Migrate back to monolithic
    const res = await cmdBacklogMigrate(ctx, { format: 'monolithic' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.format, 'monolithic');
    assert.strictEqual(res.counts.tasks, 2);

    assert.strictEqual(ctx.isModularBacklog(), false);
    assert.strictEqual(fs.existsSync(path.join(skyhookDir, 'backlog', 'epics')), false);

    const loaded = ctx.readBacklog();
    assert.strictEqual(loaded.tasks.length, 2);
    assert.ok(loaded.tasks.some(t => t.id === 'TASK-AUTH-02'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F13: BacklogMergeDriver 3-way merge handles concurrent additions & status changes conflict-free', () => {
  const base = {
    epics: [{ id: 'EPIC-1', title: 'Base Epic', status: 'ready' }],
    stories: [{ id: 'STORY-1', title: 'Base Story', status: 'ready' }],
    tasks: [{ id: 'TASK-1', title: 'Base Task', status: 'ready', subtasks: [{ id: 'SUB-1', title: 'Subtask 1', completed: false }] }]
  };

  // Branch A adds STORY-2 and advances TASK-1 to in-progress
  const our = {
    epics: [{ id: 'EPIC-1', title: 'Base Epic', status: 'ready' }],
    stories: [
      { id: 'STORY-1', title: 'Base Story', status: 'ready' },
      { id: 'STORY-2', title: 'Branch A Story', status: 'ready' }
    ],
    tasks: [
      {
        id: 'TASK-1',
        title: 'Base Task',
        status: 'in-progress',
        updatedAt: '2026-10-12T10:00:00Z',
        subtasks: [{ id: 'SUB-1', title: 'Subtask 1', completed: false }]
      }
    ]
  };

  // Branch B adds STORY-3 and adds SUB-2 to TASK-1
  const their = {
    epics: [{ id: 'EPIC-1', title: 'Base Epic', status: 'ready' }],
    stories: [
      { id: 'STORY-1', title: 'Base Story', status: 'ready' },
      { id: 'STORY-3', title: 'Branch B Story', status: 'ready' }
    ],
    tasks: [
      {
        id: 'TASK-1',
        title: 'Base Task',
        status: 'ready',
        updatedAt: '2026-10-12T09:00:00Z',
        subtasks: [
          { id: 'SUB-1', title: 'Subtask 1', completed: false },
          { id: 'SUB-2', title: 'Subtask 2 (Branch B)', completed: true }
        ]
      }
    ]
  };

  const merged = BacklogMergeDriver.mergeBacklogs(base, our, their);

  // Both stories should be present
  assert.strictEqual(merged.stories.length, 3);
  assert.ok(merged.stories.some(s => s.id === 'STORY-1'));
  assert.ok(merged.stories.some(s => s.id === 'STORY-2'));
  assert.ok(merged.stories.some(s => s.id === 'STORY-3'));

  // Task-1 should have in-progress status from our branch
  const mergedTask = merged.tasks.find(t => t.id === 'TASK-1');
  assert.ok(mergedTask);
  assert.strictEqual(mergedTask.status, 'in-progress');

  // Task-1 should have both subtasks from our and their branch
  assert.strictEqual(mergedTask.subtasks.length, 2);
  assert.ok(mergedTask.subtasks.some(s => s.id === 'SUB-1'));
  const sub2 = mergedTask.subtasks.find(s => s.id === 'SUB-2');
  assert.ok(sub2);
  assert.strictEqual(sub2.completed, true);
});

test('TASK-F13: GitHookManager installs merge driver into .gitattributes and config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-git-merge-test-'));
  const gitDir = path.join(tmpDir, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');

  try {
    const manager = new GitHookManager(tmpDir);
    const installRes = manager.install();
    assert.strictEqual(installRes.success, true);
    assert.ok(installRes.installed.includes('merge-driver'));

    const status = manager.getStatus();
    assert.strictEqual(status.mergeDriverInstalled, true);

    const gitattributes = fs.readFileSync(path.join(tmpDir, '.gitattributes'), 'utf-8');
    assert.ok(gitattributes.includes('.skyhook/backlog/epics.yaml merge=skyhook'));

    const config = fs.readFileSync(path.join(gitDir, 'config'), 'utf-8');
    assert.ok(config.includes('[merge "skyhook"]'));

    // Uninstall
    const uninstallRes = manager.uninstall();
    assert.strictEqual(uninstallRes.success, true);
    assert.strictEqual(manager.getStatus().mergeDriverInstalled, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
