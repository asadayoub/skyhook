import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CodexHarness } from '../lib/harness/plugins/CodexHarness.js';
import { HarnessInjector } from '../lib/harness/HarnessInjector.js';
import { MARKER_START, MARKER_END } from '../lib/harness/HarnessUtils.js';

test('CodexHarness - Lifecycle, Detection, Atomic Injection, and Safe Removal', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-codex-harness-test-'));

  try {
    const harness = new CodexHarness();
    assert.strictEqual(harness.id, 'codex');
    assert.strictEqual(harness.name, 'OpenAI Codex');
    assert.strictEqual(harness.vendor, 'OpenAI');

    // 1. Detection in empty directory
    const emptyDetect = await harness.detect(tmpDir);
    assert.strictEqual(emptyDetect.detected, false);

    // 2. Detection with .codex directory
    const codexDir = path.join(tmpDir, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const dirDetect = await harness.detect(tmpDir);
    assert.strictEqual(dirDetect.detected, true);
    assert.ok(dirDetect.reasons.some(r => r.includes('.codex directory')));

    // 3. Pre-seed existing user configuration
    const mcpJsonPath = path.join(codexDir, 'mcp.json');
    fs.writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'user-custom-tool': {
          command: 'python',
          args: ['run_tool.py']
        }
      }
    }, null, 2));

    const agentsMdPath = path.join(codexDir, 'agents.md');
    fs.writeFileSync(agentsMdPath, '# Custom Codex User Instructions\nAlways format with Prettier.\n');

    const rootAgentsMdPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(rootAgentsMdPath, '# Root AGENTS.md\nProject rules here.\n');

    // 4. Initial status - should be not_injected
    const statusBefore = await harness.status(tmpDir);
    assert.strictEqual(statusBefore.status, 'not_injected');

    // 5. Test dry-run via HarnessInjector
    const injector = new HarnessInjector();
    const dryRunRes = await injector.inject(tmpDir, {
      targets: ['codex'],
      dryRun: true
    });
    assert.strictEqual(dryRunRes.dryRun, true);
    assert.strictEqual(dryRunRes.injected.length, 1);
    const mcpBefore = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    assert.strictEqual(mcpBefore.mcpServers.skyhook, undefined, 'Dry run must not write skyhook');

    // 6. Test real injection
    const injectRes = await injector.inject(tmpDir, {
      targets: ['codex']
    });
    assert.strictEqual(injectRes.success, true);
    assert.strictEqual(injectRes.injected.length, 1);

    // Verify non-destructive JSON merge
    const mcpAfter = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    assert.ok(mcpAfter.mcpServers['user-custom-tool'], 'Must preserve user pre-existing tool');
    assert.ok(mcpAfter.mcpServers.skyhook, 'Must inject skyhook MCP server');
    assert.strictEqual(mcpAfter.mcpServers.skyhook.command, 'node');
    assert.ok(mcpAfter.mcpServers.skyhook.args.includes(tmpDir));

    // Verify marker block injection into .codex/agents.md
    const codexAgentsAfter = fs.readFileSync(agentsMdPath, 'utf-8');
    assert.ok(codexAgentsAfter.includes('Always format with Prettier.'), 'Preserves user prompt');
    assert.ok(codexAgentsAfter.includes(MARKER_START));
    assert.ok(codexAgentsAfter.includes(MARKER_END));
    assert.ok(codexAgentsAfter.includes('skyhook_get_next_task'));

    // Verify marker block injection into root AGENTS.md
    const rootAgentsAfter = fs.readFileSync(rootAgentsMdPath, 'utf-8');
    assert.ok(rootAgentsAfter.includes('# Root AGENTS.md'));
    assert.ok(rootAgentsAfter.includes(MARKER_START));

    // 7. Verify status transitions to injected
    const statusAfter = await harness.status(tmpDir);
    assert.strictEqual(statusAfter.status, 'injected');

    // 8. Test removal / rollback
    const removeRes = await harness.remove(tmpDir);
    assert.strictEqual(removeRes.success, true);

    const mcpCleaned = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    assert.strictEqual(mcpCleaned.mcpServers.skyhook, undefined, 'Skyhook server must be removed');
    assert.ok(mcpCleaned.mcpServers['user-custom-tool'], 'User custom tool must remain intact');

    const codexAgentsCleaned = fs.readFileSync(agentsMdPath, 'utf-8');
    assert.ok(!codexAgentsCleaned.includes(MARKER_START), 'Marker block must be cleanly removed');
    assert.ok(codexAgentsCleaned.includes('Always format with Prettier.'), 'User custom prompt must remain');

    const rootAgentsCleaned = fs.readFileSync(rootAgentsMdPath, 'utf-8');
    assert.ok(!rootAgentsCleaned.includes(MARKER_START));
    assert.ok(rootAgentsCleaned.includes('# Root AGENTS.md'));

    const statusFinal = await harness.status(tmpDir);
    assert.strictEqual(statusFinal.status, 'not_injected');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
