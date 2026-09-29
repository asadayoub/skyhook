import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdSync } from '../lib/handlers/sync.js';
import { createSkyhookContext } from '../lib/context.js';
import { HarnessInjector } from '../lib/harness/HarnessInjector.js';
import { MARKER_START } from '../lib/harness/HarnessUtils.js';

test('Bidirectional Sync - cmdSync refreshes injected agent harness rules', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-harness-sync-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  const oldCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    // 1. Initialize workspace
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Sync Harness Project' });
    const ctx = createSkyhookContext(tmpDir);

    // 2. Inject Cursor harness
    const injector = new HarnessInjector();
    await injector.inject(tmpDir, { targets: ['cursor'] });

    const cursorRulesPath = path.join(tmpDir, '.cursorrules');
    assert.ok(fs.existsSync(cursorRulesPath));

    // Tamper with rules file (e.g. simulate outdated content inside markers)
    fs.writeFileSync(cursorRulesPath, `${MARKER_START}\n# Old outdated rules\n<!-- SKYHOOK_RULES_END -->\n`);

    // 3. Run cmdSync
    const syncRes = await cmdSync(ctx);
    assert.ok(syncRes.harnessSync);
    assert.strictEqual(syncRes.harnessSync.count, 1);
    assert.ok(syncRes.harnessSync.syncedHarnesses.includes('cursor'));

    // 4. Verify rules were refreshed with latest governance rules
    const refreshedRules = fs.readFileSync(cursorRulesPath, 'utf-8');
    assert.ok(refreshedRules.includes('Skyhook Project Intelligence & Governance Rules'));
    assert.ok(!refreshedRules.includes('# Old outdated rules'));
  } finally {
    process.chdir(oldCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
