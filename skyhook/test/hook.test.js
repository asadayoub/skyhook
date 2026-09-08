import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { GitHookManager, HOOK_MARKER } from '../lib/git/GitHookManager.js';
import { cmdHookInstall, cmdHookUninstall, cmdHookStatus } from '../lib/handlers/hook.js';

function setupMockGitRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-hook-test-'));
  const gitDir = path.join(tmpDir, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  return { tmpDir, gitDir };
}

test('GitHookManager installs executable pre-commit hook in .git repository', () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const manager = new GitHookManager(tmpDir);
    assert.strictEqual(manager.isGitRepo(), true);
    assert.strictEqual(manager.getStatus().hookInstalled, false);

    const installRes = manager.install();
    assert.strictEqual(installRes.success, true);
    assert.ok(fs.existsSync(installRes.hookPath));

    const content = fs.readFileSync(installRes.hookPath, 'utf-8');
    assert.ok(content.includes(HOOK_MARKER));
    assert.ok(content.includes('skyhook adr verify'));

    // Status check
    const status = manager.getStatus();
    assert.strictEqual(status.hookInstalled, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitHookManager handles idempotent re-installation without duplicating script', () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const manager = new GitHookManager(tmpDir);
    manager.install();

    // Re-install
    const secondInstall = manager.install();
    assert.strictEqual(secondInstall.success, true);
    assert.ok(secondInstall.message.includes('already installed'));

    const content = fs.readFileSync(secondInstall.hookPath, 'utf-8');
    const matches = content.split(HOOK_MARKER).length - 1;
    assert.strictEqual(matches, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitHookManager uninstalls pre-commit hook cleanly', () => {
  const { tmpDir } = setupMockGitRepo();

  try {
    const manager = new GitHookManager(tmpDir);
    manager.install();
    assert.strictEqual(manager.getStatus().hookInstalled, true);

    const unres = manager.uninstall();
    assert.strictEqual(unres.success, true);
    assert.strictEqual(manager.getStatus().hookInstalled, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitHookManager returns error if not a git repository', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-not-git-'));

  try {
    const manager = new GitHookManager(tmpDir);
    const res = manager.install();
    assert.ok(res.error);
    assert.strictEqual(manager.isGitRepo(), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
