import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AgentDetector } from '../lib/harness/AgentDetector.js';
import { AgentHarnessRegistry } from '../lib/harness/AgentHarnessRegistry.js';

test('AgentDetector - Detects installed editors and agent signatures', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-detector-test-'));

  try {
    const detector = new AgentDetector();

    // 1. In empty directory, none of the workspace-specific targets should trigger
    const emptyScan = await detector.scan(tmpDir, { forceGlobalMcp: false });
    const wsDetectedIds = emptyScan.detectedAgents.map(a => a.id);

    // 2. Create Cursor workspace markers
    fs.mkdirSync(path.join(tmpDir, '.cursor'));
    fs.writeFileSync(path.join(tmpDir, '.cursorrules'), '# User rules\n');

    // 3. Create Windsurf markers
    fs.writeFileSync(path.join(tmpDir, '.windsurfrules'), '# Windsurf rules\n');

    // 4. Create Antigravity markers
    fs.mkdirSync(path.join(tmpDir, '.agents'));

    // 5. Scan again
    const scanResult = await detector.scan(tmpDir);
    const detectedIds = scanResult.detectedAgents.map(a => a.id);

    assert.ok(detectedIds.includes('cursor'), 'Should detect Cursor from .cursor / .cursorrules');
    assert.ok(detectedIds.includes('windsurf'), 'Should detect Windsurf from .windsurfrules');
    assert.ok(detectedIds.includes('antigravity'), 'Should detect Antigravity from .agents directory');

    // 6. Verify detection payload structure
    const cursorResult = scanResult.detectedAgents.find(a => a.id === 'cursor');
    assert.strictEqual(cursorResult.name, 'Cursor AI');
    assert.strictEqual(cursorResult.vendor, 'Anysphere');
    assert.ok(cursorResult.reasons.length >= 1);
    assert.ok(cursorResult.paths.length >= 1);

    assert.strictEqual(scanResult.totalRegistered, 7);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
