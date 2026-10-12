import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdVerifyADR } from '../lib/handlers/adr.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';

test('cmdVerifyADR includes actionable remediation when policies are unconfigured', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-adr-fmt-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const mockCtx = {
    skyhookDir,
    readDecisions: () => ({ decisions: [] })
  };

  try {
    const res = await cmdVerifyADR(mockCtx);
    assert.strictEqual(res.status, 'no_policies');
    assert.strictEqual(res.evaluated, false);
    assert.ok(res.message.includes('No active ADR enforcement policies configured'));
    assert.ok(res.remediation);
    assert.ok(res.remediation.includes('Enforcement: rules:'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP skyhook_verify_policies returns unambiguous status and remediation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-pol-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const mockCtx = {
    skyhookDir,
    readDecisions: () => ({ decisions: [] })
  };

  const registry = MCPToolRegistry.createDefault();

  try {
    const res = await registry.execute('skyhook_verify_policies', {}, mockCtx);
    assert.strictEqual(res.isError, undefined);
    assert.ok(res.content && res.content[0] && res.content[0].text);

    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.status, 'no_policies');
    assert.strictEqual(payload.evaluated, false);
    assert.strictEqual(payload.policiesCount, 0);
    assert.ok(payload.remediation);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
