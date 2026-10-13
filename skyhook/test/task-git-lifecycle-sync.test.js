import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  GitHookManager,
  PRE_COMMIT_MARKER,
  POST_CHECKOUT_MARKER,
  POST_COMMIT_MARKER
} from '../lib/git/GitHookManager.js';
import { GitLifecycleSync } from '../lib/backlog/GitLifecycleSync.js';
import { cmdSync } from '../lib/handlers/sync.js';
import { cmdHookInstall, cmdHookUninstall, cmdHookStatus } from '../lib/handlers/hook.js';

function setupMockGitRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-git-sync-test-'));
  const gitDir = path.join(tmpDir, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  return { tmpDir, gitDir };
}

test('TASK-F05: GitHookManager installs pre-commit, post-checkout, and post-commit hooks', () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const manager = new GitHookManager(tmpDir);
    assert.strictEqual(manager.isGitRepo(), true);

    const initialStatus = manager.getStatus();
    assert.strictEqual(initialStatus.hookInstalled, false);
    assert.strictEqual(initialStatus.hooks.preCommit, false);
    assert.strictEqual(initialStatus.hooks.postCheckout, false);
    assert.strictEqual(initialStatus.hooks.postCommit, false);

    const installRes = manager.install();
    assert.strictEqual(installRes.success, true);
    assert.ok(installRes.installed.includes('pre-commit'));
    assert.ok(installRes.installed.includes('post-checkout'));
    assert.ok(installRes.installed.includes('post-commit'));

    // Verify file existence and contents
    assert.ok(fs.existsSync(manager.preCommitPath));
    assert.ok(fs.existsSync(manager.postCheckoutPath));
    assert.ok(fs.existsSync(manager.postCommitPath));

    const preContent = fs.readFileSync(manager.preCommitPath, 'utf-8');
    assert.ok(preContent.includes(PRE_COMMIT_MARKER));
    assert.ok(preContent.includes('skyhook adr verify'));

    const checkoutContent = fs.readFileSync(manager.postCheckoutPath, 'utf-8');
    assert.ok(checkoutContent.includes(POST_CHECKOUT_MARKER));
    assert.ok(checkoutContent.includes('skyhook sync --branch'));

    const commitContent = fs.readFileSync(manager.postCommitPath, 'utf-8');
    assert.ok(commitContent.includes(POST_COMMIT_MARKER));
    assert.ok(commitContent.includes('skyhook sync --commit-message'));

    // Status check
    const status = manager.getStatus();
    assert.strictEqual(status.hookInstalled, true);
    assert.strictEqual(status.hooks.preCommit, true);
    assert.strictEqual(status.hooks.postCheckout, true);
    assert.strictEqual(status.hooks.postCommit, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F05: GitHookManager re-installation is idempotent', () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const manager = new GitHookManager(tmpDir);
    manager.install();

    const secondInstall = manager.install();
    assert.strictEqual(secondInstall.success, true);
    assert.ok(secondInstall.message.includes('already installed'));

    // Verify scripts are not duplicated
    const checkoutContent = fs.readFileSync(manager.postCheckoutPath, 'utf-8');
    const matches = checkoutContent.split(POST_CHECKOUT_MARKER).length - 1;
    assert.strictEqual(matches, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F05: GitHookManager uninstalls all hooks cleanly', () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const manager = new GitHookManager(tmpDir);
    manager.install();
    assert.strictEqual(manager.getStatus().hookInstalled, true);

    const uninstallRes = manager.uninstall();
    assert.strictEqual(uninstallRes.success, true);
    assert.strictEqual(manager.getStatus().hookInstalled, false);
    assert.strictEqual(manager.getStatus().hooks.preCommit, false);
    assert.strictEqual(manager.getStatus().hooks.postCheckout, false);
    assert.strictEqual(manager.getStatus().hooks.postCommit, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F05: GitLifecycleSync records commitHash and evidence for completed work items', () => {
  const tasks = [
    { id: 'TASK-101', title: 'Implement Auth Service', status: 'in-progress' }
  ];
  const stories = [
    { id: 'STORY-202', title: 'User Profiles', status: 'in-progress' }
  ];

  const updateCalls = [];
  const mockCtx = {
    readBacklog: () => ({ tasks, stories }),
    updateTaskStatus: (id, status, meta) => {
      updateCalls.push({ id, status, meta, type: 'task' });
      return true;
    },
    updateStoryStatus: (id, status, meta) => {
      updateCalls.push({ id, status, meta, type: 'story' });
      return true;
    }
  };

  const syncRes = GitLifecycleSync.sync(mockCtx, {
    commitMessage: 'fix(auth): fix token validation closes #TASK-101 and fixes #STORY-202',
    commitHash: 'a1b2c3d4e5f67890'
  });

  assert.strictEqual(syncRes.synced, true);
  assert.strictEqual(syncRes.actions.length, 2);

  const taskCall = updateCalls.find(c => c.id === 'TASK-101');
  assert.ok(taskCall);
  assert.strictEqual(taskCall.status, 'in-review');
  assert.strictEqual(taskCall.meta.commitHash, 'a1b2c3d4e5f67890');
  assert.deepStrictEqual(taskCall.meta.evidence, {
    type: 'git-commit',
    commitHash: 'a1b2c3d4e5f67890',
    commitMessage: 'fix(auth): fix token validation closes #TASK-101 and fixes #STORY-202'
  });

  const storyCall = updateCalls.find(c => c.id === 'STORY-202');
  assert.ok(storyCall);
  assert.strictEqual(storyCall.status, 'in-review');
  assert.strictEqual(storyCall.meta.commitHash, 'a1b2c3d4e5f67890');
});

test('TASK-F05: cmdSync handles branch and commit lifecycle flags with fast exit', async () => {
  const tasks = [
    { id: 'TASK-303', title: 'Dashboard Widget', status: 'ready' },
    { id: 'TASK-304', title: 'Payment Gateway', status: 'in-progress' }
  ];

  const statusTransitions = [];
  const mockCtx = {
    readBacklog: () => ({ tasks, stories: [] }),
    updateTaskStatus: (id, status, meta) => {
      statusTransitions.push({ id, status, meta });
      return true;
    }
  };

  // 1. Branch checkout
  const branchRes = await cmdSync(mockCtx, {
    branch: 'feat/TASK-303-widget',
    quiet: true
  });
  assert.strictEqual(branchRes.synced, true);
  assert.strictEqual(branchRes.actions[0].workId, 'TASK-303');
  assert.strictEqual(branchRes.actions[0].transition, 'ready -> in-progress');

  // 2. Commit close with hash
  const commitRes = await cmdSync(mockCtx, {
    commitMessage: 'feat: finished widget closes #TASK-304',
    commitHash: '987654fedcba',
    quiet: true
  });
  assert.strictEqual(commitRes.synced, true);
  assert.strictEqual(commitRes.actions[0].workId, 'TASK-304');
  assert.strictEqual(commitRes.actions[0].transition, 'in-progress -> in-review');
  assert.strictEqual(commitRes.actions[0].commitHash, '987654fedcba');
});

test('TASK-F05: cmdHookInstall, cmdHookStatus, and cmdHookUninstall handlers work seamlessly', async () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const mockCtx = { projectDir: tmpDir };

    const status1 = await cmdHookStatus(mockCtx, {});
    assert.strictEqual(status1.hookInstalled, false);

    const installRes = await cmdHookInstall(mockCtx, {});
    assert.strictEqual(installRes.success, true);

    const status2 = await cmdHookStatus(mockCtx, {});
    assert.strictEqual(status2.hookInstalled, true);
    assert.strictEqual(status2.hooks.preCommit, true);
    assert.strictEqual(status2.hooks.postCheckout, true);
    assert.strictEqual(status2.hooks.postCommit, true);

    const uninstallRes = await cmdHookUninstall(mockCtx, {});
    assert.strictEqual(uninstallRes.success, true);

    const status3 = await cmdHookStatus(mockCtx, {});
    assert.strictEqual(status3.hookInstalled, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

