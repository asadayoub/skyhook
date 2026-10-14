import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { cmdSetup } from '../lib/handlers/general.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

describe('TASK-C05: Legacy Command Decoupling & Release Workflow Tests', () => {
  it('cmdSetup for claude generates commands invoking skyhook-cmd without dead paths', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-setup-claude-'));
    const origCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const res = await cmdSetup(null, { agent: 'claude' });
      assert.strictEqual(res.success, true);
      assert.ok(res.files.length > 0);

      const cmdFile = path.join(tmpDir, '.claude/commands/skyhook-listCurrentFeatures.md');
      assert.ok(fs.existsSync(cmdFile), 'Should generate command markdown file');

      const content = fs.readFileSync(cmdFile, 'utf-8');
      assert.ok(!content.includes('skill/commands/index.js'), 'Must NOT reference nonexistent skill/commands/index.js');
      assert.ok(content.includes('skyhook-cmd'), 'Must reference skyhook-cmd binary');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cmdSetup for gemini generates functions calling skyhook-cmd without dead paths', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-setup-gemini-'));
    const origCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const res = await cmdSetup(null, { agent: 'gemini' });
      assert.strictEqual(res.success, true);

      const funcFile = path.join(tmpDir, '.gemini/functions/skyhook.js');
      assert.ok(fs.existsSync(funcFile), 'Should generate Gemini functions file');

      const content = fs.readFileSync(funcFile, 'utf-8');
      assert.ok(!content.includes('skill/commands/index.js'), 'Must NOT reference nonexistent skill/commands/index.js');
      assert.ok(content.includes('skyhook-cmd'), 'Must reference skyhook-cmd CLI');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cmdSetup routes registered harness agents through HarnessInjector', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-setup-cursor-'));
    const origCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const res = await cmdSetup(null, { agent: 'cursor' });
      assert.strictEqual(res.success, true);
      assert.ok(fs.existsSync(path.join(tmpDir, '.cursor/mcp.json')), 'Should inject .cursor/mcp.json');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('release.yml workflow runs verification tests and does not target stale skill folder', () => {
    const releasePath = path.join(repoRoot, '.github/workflows/release.yml');
    assert.ok(fs.existsSync(releasePath), 'release.yml must exist');
    const content = fs.readFileSync(releasePath, 'utf-8');

    assert.ok(!content.includes('cd skyhook/skill'), 'release.yml should not target stale skyhook/skill');
    assert.ok(content.includes('npm test') || content.includes('npm run test'), 'release.yml must run tests before release');
    assert.ok(content.includes('skyhook/'), 'release.yml must package complete skyhook application');
  });
});

