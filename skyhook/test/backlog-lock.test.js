import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BacklogLock } from '../lib/backlog/BacklogLock.js';

function createTempSkyhookDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-lock-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });
  return { tmpDir, skyhookDir };
}

test('BacklogLock acquires and releases lock cleanly', async () => {
  const { tmpDir, skyhookDir } = createTempSkyhookDir();
  try {
    const lock = new BacklogLock(skyhookDir);
    const acquired = await lock.acquire(2000);
    assert.strictEqual(acquired, true);
    assert.ok(fs.existsSync(lock.lockPath));

    lock.release();
    assert.strictEqual(fs.existsSync(lock.lockPath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('BacklogLock withLock executes callback and releases lock', async () => {
  const { tmpDir, skyhookDir } = createTempSkyhookDir();
  try {
    let executed = false;
    await BacklogLock.withLock(skyhookDir, async () => {
      executed = true;
      const lockFile = path.join(skyhookDir, 'backlog', '.lock');
      assert.ok(fs.existsSync(lockFile));
    });

    assert.strictEqual(executed, true);
    const lockFile = path.join(skyhookDir, 'backlog', '.lock');
    assert.strictEqual(fs.existsSync(lockFile), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('BacklogLock withLockSync executes synchronously and releases lock', () => {
  const { tmpDir, skyhookDir } = createTempSkyhookDir();
  try {
    let executed = false;
    BacklogLock.withLockSync(skyhookDir, () => {
      executed = true;
      const lockFile = path.join(skyhookDir, 'backlog', '.lock');
      assert.ok(fs.existsSync(lockFile));
    });

    assert.strictEqual(executed, true);
    const lockFile = path.join(skyhookDir, 'backlog', '.lock');
    assert.strictEqual(fs.existsSync(lockFile), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('BacklogLock detects and breaks stale locks', async () => {
  const { tmpDir, skyhookDir } = createTempSkyhookDir();
  try {
    const backlogDir = path.join(skyhookDir, 'backlog');
    fs.mkdirSync(backlogDir, { recursive: true });
    const lockPath = path.join(backlogDir, '.lock');

    // Create intentionally expired lock
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 99999,
      createdAt: Date.now() - 30000,
      expiresAt: Date.now() - 10000
    }), 'utf-8');

    const lock = new BacklogLock(skyhookDir, { ttlMs: 5000 });
    const acquired = await lock.acquire(2000);
    assert.strictEqual(acquired, true);

    lock.release();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
