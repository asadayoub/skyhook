import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { HarnessInjector } from '../lib/harness/HarnessInjector.js';
import { MARKER_START, MARKER_END } from '../lib/harness/HarnessUtils.js';

test('Agent Harness Matrix - Full Lifecycle across all 8 supported harnesses', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-matrix-test-'));
  const injector = new HarnessInjector();

  try {
    const harnesses = injector.registry.list();
    assert.strictEqual(harnesses.length, 8, 'Must register exactly 8 agent harnesses');

    for (const harness of harnesses) {
      const harnessDir = path.join(tmpDir, harness.id);
      fs.mkdirSync(harnessDir, { recursive: true });

      // Options for harnesses with global config paths
      const customConfigPath = path.join(harnessDir, 'desktop_config.json');
      const customMcpPath = path.join(harnessDir, 'cline_mcp.json');
      const options = {
        configPath: customConfigPath,
        mcpSettingsPath: customMcpPath
      };

      // 1. Initial status - should not be injected
      const statusBefore = await harness.status(harnessDir, options);
      assert.strictEqual(statusBefore.status, 'not_injected', `${harness.name} initial status`);

      // 2. Pre-seed existing user configuration
      const targets = harness.getTargetPaths(harnessDir, options);
      for (const t of targets) {
        fs.mkdirSync(path.dirname(t), { recursive: true });
        if (t.endsWith('.json')) {
          fs.writeFileSync(t, JSON.stringify({
            mcpServers: {
              'user-existing-tool': { command: 'echo', args: ['hello'] }
            },
            'github.copilot.chat.mcpServers': {
              'user-existing-tool': { command: 'echo', args: ['hello'] }
            }
          }, null, 2));
        } else if (t.endsWith('.md') || t.endsWith('rules')) {
          fs.writeFileSync(t, '# Custom User Prompt Guidelines\nAlways use 2 spaces.\n');
        }
      }

      // 3. Dry run injection via HarnessInjector
      const dryRunRes = await injector.inject(harnessDir, {
        targets: [harness.id],
        dryRun: true,
        ...options
      });
      assert.strictEqual(dryRunRes.dryRun, true, `${harness.name} dry-run flag`);
      assert.strictEqual(dryRunRes.injected.length, 1);

      // Verify files not altered by dry-run
      for (const t of targets) {
        if (fs.existsSync(t)) {
          const content = fs.readFileSync(t, 'utf-8');
          assert.ok(!content.includes(MARKER_START), `${harness.name} dry-run shouldn't write markers`);
        }
      }

      // 4. Live injection via HarnessInjector
      const injectRes = await injector.inject(harnessDir, {
        targets: [harness.id],
        ...options
      });
      assert.strictEqual(injectRes.success, true, `${harness.name} inject success`);
      assert.strictEqual(injectRes.injected.length, 1);

      // 5. Verify status is now injected
      const statusAfter = await harness.status(harnessDir, options);
      assert.strictEqual(statusAfter.status, 'injected', `${harness.name} injected status`);

      // 6. Verify non-destructive merge: user rules preserved & user MCP server preserved
      for (const t of targets) {
        if (!fs.existsSync(t)) continue;
        const content = fs.readFileSync(t, 'utf-8');
        if (t.endsWith('.json')) {
          const parsed = JSON.parse(content);
          const servers = t.includes('settings.json')
            ? (parsed['github.copilot.chat.mcpServers'] || parsed.mcpServers || {})
            : (parsed.mcpServers || parsed['github.copilot.chat.mcpServers'] || {});
          assert.ok(servers['user-existing-tool'], `${harness.name} must preserve user MCP server`);
          assert.ok(servers.skyhook, `${harness.name} must register skyhook MCP server in ${path.basename(t)}`);
        } else if (t.endsWith('.md') || t.endsWith('rules')) {
          assert.ok(content.includes('Always use 2 spaces.'), `${harness.name} must preserve user custom rules`);
          assert.ok(content.includes(MARKER_START), `${harness.name} must contain Skyhook start marker`);
          assert.ok(content.includes(MARKER_END), `${harness.name} must contain Skyhook end marker`);
        }
      }

      // 7. Remove harness configuration via HarnessInjector
      const removeRes = await injector.remove(harnessDir, {
        targets: [harness.id],
        ...options
      });
      assert.strictEqual(removeRes.success, true, `${harness.name} remove success`);

      // 8. Verify status is back to not_injected
      const statusRemoved = await harness.status(harnessDir, options);
      assert.strictEqual(statusRemoved.status, 'not_injected', `${harness.name} status after removal`);

      // 9. Verify pre-existing user content was restored and only skyhook removed
      for (const t of targets) {
        if (fs.existsSync(t)) {
          const content = fs.readFileSync(t, 'utf-8');
          if (t.endsWith('.json')) {
            const parsed = JSON.parse(content);
            const servers = t.includes('settings.json')
              ? (parsed['github.copilot.chat.mcpServers'] || parsed.mcpServers || {})
              : (parsed.mcpServers || parsed['github.copilot.chat.mcpServers'] || {});
            assert.ok(servers['user-existing-tool'], `${harness.name} user tool preserved after removal`);
            assert.strictEqual(servers.skyhook, undefined, `${harness.name} skyhook removed from json`);
          } else if (t.endsWith('.md') || t.endsWith('rules')) {
            assert.ok(content.includes('Always use 2 spaces.'), `${harness.name} user rules preserved after removal`);
            assert.ok(!content.includes(MARKER_START), `${harness.name} markers removed`);
          }
        }
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
