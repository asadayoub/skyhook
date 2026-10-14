import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { buildMcpServerConfig } from '../lib/harness/HarnessUtils.js';
import { CursorHarness } from '../lib/harness/plugins/CursorHarness.js';
import { CopilotHarness } from '../lib/harness/plugins/CopilotHarness.js';
import { WindsurfHarness } from '../lib/harness/plugins/WindsurfHarness.js';
import { CodexHarness } from '../lib/harness/plugins/CodexHarness.js';
import { AntigravityHarness } from '../lib/harness/plugins/AntigravityHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

describe('TASK-C02: Portable Cross-Machine Harness Configuration Tests', () => {
  it('buildMcpServerConfig returns ${workspaceFolder} paths for workspace with local skyhook CLI', () => {
    const config = buildMcpServerConfig(repoRoot, { portable: true });
    assert.strictEqual(config.command, 'node');
    assert.deepStrictEqual(config.args, [
      '${workspaceFolder}/skyhook/cli/skyhook-mcp.js',
      '--dir',
      '${workspaceFolder}'
    ]);
  });

  it('buildMcpServerConfig returns skyhook-mcp binary for external workspace without local CLI', () => {
    const tmpEmptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ext-'));
    try {
      const config = buildMcpServerConfig(tmpEmptyDir, { portable: true });
      assert.strictEqual(config.command, 'skyhook-mcp');
      assert.deepStrictEqual(config.args, ['--dir', '${workspaceFolder}']);
    } finally {
      fs.rmSync(tmpEmptyDir, { recursive: true, force: true });
    }
  });

  it('buildMcpServerConfig returns relative path when format: "relative" is requested', () => {
    const config = buildMcpServerConfig(repoRoot, { portable: true, format: 'relative' });
    assert.strictEqual(config.command, 'node');
    assert.deepStrictEqual(config.args, [
      './skyhook/cli/skyhook-mcp.js',
      '--dir',
      '.'
    ]);
  });

  it('buildMcpServerConfig returns absolute paths when portable: false is specified', () => {
    const config = buildMcpServerConfig(repoRoot, { portable: false });
    assert.strictEqual(config.command, 'node');
    assert.ok(path.isAbsolute(config.args[0]), 'Arg 0 must be absolute when portable is false');
    assert.ok(path.isAbsolute(config.args[2]), 'Arg 2 must be absolute when portable is false');
  });

  it('CursorHarness injects portable ${workspaceFolder} into .cursor/mcp.json', async () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cursor-'));
    try {
      // Mock local skyhook repo in workspace
      fs.mkdirSync(path.join(tmpWs, 'skyhook/cli'), { recursive: true });
      fs.writeFileSync(path.join(tmpWs, 'skyhook/cli/skyhook-mcp.js'), '#!/usr/bin/env node\n');

      const harness = new CursorHarness();
      await harness.inject(tmpWs, { portable: true });

      const mcpJson = JSON.parse(fs.readFileSync(path.join(tmpWs, '.cursor/mcp.json'), 'utf-8'));
      assert.ok(mcpJson.mcpServers.skyhook);
      assert.strictEqual(mcpJson.mcpServers.skyhook.command, 'node');
      assert.deepStrictEqual(mcpJson.mcpServers.skyhook.args, [
        '${workspaceFolder}/skyhook/cli/skyhook-mcp.js',
        '--dir',
        '${workspaceFolder}'
      ]);

      const rawContent = fs.readFileSync(path.join(tmpWs, '.cursor/mcp.json'), 'utf-8');
      assert.ok(!rawContent.includes(tmpWs), 'Should not contain hardcoded absolute path');
    } finally {
      fs.rmSync(tmpWs, { recursive: true, force: true });
    }
  });

  it('CopilotHarness injects portable ${workspaceFolder} into .vscode/mcp.json', async () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-copilot-'));
    try {
      fs.mkdirSync(path.join(tmpWs, 'skyhook/cli'), { recursive: true });
      fs.writeFileSync(path.join(tmpWs, 'skyhook/cli/skyhook-mcp.js'), '#!/usr/bin/env node\n');

      const harness = new CopilotHarness();
      await harness.inject(tmpWs, { portable: true });

      const mcpJson = JSON.parse(fs.readFileSync(path.join(tmpWs, '.vscode/mcp.json'), 'utf-8'));
      assert.ok(mcpJson.mcpServers.skyhook);
      assert.deepStrictEqual(mcpJson.mcpServers.skyhook.args, [
        '${workspaceFolder}/skyhook/cli/skyhook-mcp.js',
        '--dir',
        '${workspaceFolder}'
      ]);
    } finally {
      fs.rmSync(tmpWs, { recursive: true, force: true });
    }
  });

  it('WindsurfHarness injects portable ${workspaceFolder} into .codeium/windsurf/mcp_config.json', async () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-windsurf-'));
    try {
      fs.mkdirSync(path.join(tmpWs, 'skyhook/cli'), { recursive: true });
      fs.writeFileSync(path.join(tmpWs, 'skyhook/cli/skyhook-mcp.js'), '#!/usr/bin/env node\n');

      const harness = new WindsurfHarness();
      await harness.inject(tmpWs, { portable: true });

      const mcpJson = JSON.parse(fs.readFileSync(path.join(tmpWs, '.codeium/windsurf/mcp_config.json'), 'utf-8'));
      assert.ok(mcpJson.mcpServers.skyhook);
      assert.deepStrictEqual(mcpJson.mcpServers.skyhook.args, [
        '${workspaceFolder}/skyhook/cli/skyhook-mcp.js',
        '--dir',
        '${workspaceFolder}'
      ]);
    } finally {
      fs.rmSync(tmpWs, { recursive: true, force: true });
    }
  });

  it('CodexHarness injects portable configuration into .codex/mcp.json', async () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-codex-'));
    try {
      fs.mkdirSync(path.join(tmpWs, 'skyhook/cli'), { recursive: true });
      fs.writeFileSync(path.join(tmpWs, 'skyhook/cli/skyhook-mcp.js'), '#!/usr/bin/env node\n');

      const harness = new CodexHarness();
      await harness.inject(tmpWs, { portable: true });

      const mcpJson = JSON.parse(fs.readFileSync(path.join(tmpWs, '.codex/mcp.json'), 'utf-8'));
      assert.ok(mcpJson.mcpServers.skyhook);
      assert.deepStrictEqual(mcpJson.mcpServers.skyhook.args, [
        '${workspaceFolder}/skyhook/cli/skyhook-mcp.js',
        '--dir',
        '${workspaceFolder}'
      ]);
    } finally {
      fs.rmSync(tmpWs, { recursive: true, force: true });
    }
  });

  it('AntigravityHarness injects portable configuration into .agents/mcp_config.json', async () => {
    const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-antigravity-'));
    try {
      fs.mkdirSync(path.join(tmpWs, 'skyhook/cli'), { recursive: true });
      fs.writeFileSync(path.join(tmpWs, 'skyhook/cli/skyhook-mcp.js'), '#!/usr/bin/env node\n');

      const harness = new AntigravityHarness();
      await harness.inject(tmpWs, { portable: true });

      const mcpJson = JSON.parse(fs.readFileSync(path.join(tmpWs, '.agents/mcp_config.json'), 'utf-8'));
      assert.ok(mcpJson.mcpServers.skyhook);
      assert.deepStrictEqual(mcpJson.mcpServers.skyhook.args, [
        '${workspaceFolder}/skyhook/cli/skyhook-mcp.js',
        '--dir',
        '${workspaceFolder}'
      ]);
    } finally {
      fs.rmSync(tmpWs, { recursive: true, force: true });
    }
  });
});

