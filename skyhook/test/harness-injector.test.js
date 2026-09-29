import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { HarnessInjector } from '../lib/harness/HarnessInjector.js';
import { MARKER_START, MARKER_END } from '../lib/harness/HarnessUtils.js';

test('HarnessInjector - Atomic Injection, Safe JSON Merging, and Clean Rollback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-injector-test-'));

  try {
    const injector = new HarnessInjector();

    // 1. Setup pre-existing user configurations
    const cursorDir = path.join(tmpDir, '.cursor');
    fs.mkdirSync(cursorDir, { recursive: true });

    const mcpJsonPath = path.join(cursorDir, 'mcp.json');
    fs.writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'user-database-mcp': {
          command: 'docker',
          args: ['run', '-i', 'db-mcp']
        }
      }
    }, null, 2));

    const cursorRulesPath = path.join(tmpDir, '.cursorrules');
    fs.writeFileSync(cursorRulesPath, '# User Custom Instructions\nAlways use tabs.\n');

    // 2. Test dry-run: should not write to filesystem
    const dryRunResult = await injector.inject(tmpDir, {
      targets: ['cursor'],
      dryRun: true
    });
    assert.strictEqual(dryRunResult.dryRun, true);
    assert.strictEqual(dryRunResult.injected.length, 1);
    const mcpBefore = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    assert.strictEqual(mcpBefore.mcpServers.skyhook, undefined, 'Dry run should not alter files');

    // 3. Perform real injection
    const injectResult = await injector.inject(tmpDir, {
      targets: ['cursor']
    });
    assert.strictEqual(injectResult.success, true);
    assert.strictEqual(injectResult.injected.length, 1);

    // Verify non-destructive JSON merge
    const mcpAfter = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    assert.ok(mcpAfter.mcpServers['user-database-mcp'], 'Preserves pre-existing user MCP server');
    assert.ok(mcpAfter.mcpServers.skyhook, 'Adds skyhook MCP server');
    assert.strictEqual(mcpAfter.mcpServers.skyhook.command, 'node');

    // Verify marker block in .cursorrules preserves custom content
    const rulesAfter = fs.readFileSync(cursorRulesPath, 'utf-8');
    assert.ok(rulesAfter.includes('Always use tabs.'), 'Preserves existing user rules');
    assert.ok(rulesAfter.includes(MARKER_START), 'Includes Skyhook rules start marker');
    assert.ok(rulesAfter.includes(MARKER_END), 'Includes Skyhook rules end marker');

    // 4. Verify idempotent injection (doesn't duplicate markers)
    await injector.inject(tmpDir, { targets: ['cursor'] });
    const rulesTwice = fs.readFileSync(cursorRulesPath, 'utf-8');
    const startCount = (rulesTwice.match(new RegExp(MARKER_START, 'g')) || []).length;
    assert.strictEqual(startCount, 1, 'Markers should never duplicate on re-injection');

    // 5. Verify status reporting
    const statusReport = await injector.status(tmpDir);
    const cursorStatus = statusReport.harnesses.find(h => h.id === 'cursor');
    assert.strictEqual(cursorStatus.status, 'injected');

    // 6. Verify manifest file created
    const manifest = injector.readManifest(tmpDir);
    assert.ok(manifest.injectedHarnesses.cursor, 'Manifest records cursor injection');

    // 7. Test uninstallation / rollback
    const removeResult = await injector.remove(tmpDir, { targets: ['cursor'] });
    assert.strictEqual(removeResult.success, true);

    const mcpPostRemove = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    assert.strictEqual(mcpPostRemove.mcpServers.skyhook, undefined, 'Removes skyhook MCP server');
    assert.ok(mcpPostRemove.mcpServers['user-database-mcp'], 'Leaves user-database-mcp intact');

    const rulesPostRemove = fs.readFileSync(cursorRulesPath, 'utf-8');
    assert.ok(!rulesPostRemove.includes(MARKER_START), 'Removes start marker');
    assert.ok(!rulesPostRemove.includes(MARKER_END), 'Removes end marker');
    assert.ok(rulesPostRemove.includes('Always use tabs.'), 'Leaves user instructions intact');

    // Verify status returns to not_injected
    const statusPostRemove = await injector.status(tmpDir);
    const cursorPostStatus = statusPostRemove.harnesses.find(h => h.id === 'cursor');
    assert.strictEqual(cursorPostStatus.status, 'not_injected');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
