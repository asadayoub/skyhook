import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdInit } from '../lib/handlers/general.js';
import {
  cmdHarnessDetect,
  cmdHarnessInject,
  cmdHarnessStatus,
  cmdHarnessRemove
} from '../lib/handlers/harness.js';
import { createSkyhookContext } from '../lib/context.js';

test('Harness CLI Handlers - detect, inject, status, remove', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-harness-cli-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'CLI Harness Test' });
    const ctx = createSkyhookContext(tmpDir);

    // 1. Detect before anything is configured
    const detectBefore = await cmdHarnessDetect(ctx, { json: true });
    assert.strictEqual(detectBefore.totalRegistered, 8);

    // 2. Inject Cursor harness in dry-run mode
    const dryRunResult = await cmdHarnessInject(ctx, {
      target: 'cursor',
      dryRun: true,
      json: true
    });
    assert.strictEqual(dryRunResult.dryRun, true);
    assert.strictEqual(dryRunResult.injected.length, 1);
    assert.ok(!fs.existsSync(path.join(tmpDir, '.cursorrules')));

    // 3. Real injection
    const injectResult = await cmdHarnessInject(ctx, {
      target: 'cursor',
      json: true
    });
    assert.strictEqual(injectResult.success, true);
    assert.strictEqual(injectResult.injected.length, 1);
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursorrules')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor/mcp.json')));

    // 4. Status
    const statusResult = await cmdHarnessStatus(ctx, { json: true });
    assert.strictEqual(statusResult.injectedCount, 1);
    const cursorStatus = statusResult.harnesses.find(h => h.id === 'cursor');
    assert.strictEqual(cursorStatus.status, 'injected');

    // 5. Remove
    const removeResult = await cmdHarnessRemove(ctx, {
      target: 'cursor',
      json: true
    });
    assert.strictEqual(removeResult.success, true);
    assert.strictEqual(removeResult.removed.length, 1);

    // Post-remove status
    const postStatus = await cmdHarnessStatus(ctx, { json: true });
    assert.strictEqual(postStatus.injectedCount, 0);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
