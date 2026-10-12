import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRPolicyGuard } from '../lib/adr/ADRPolicyGuard.js';
import { cmdVerifyADR } from '../lib/handlers/adr.js';

test('ADRPolicyGuard returns status no_policies and evaluated false when zero policies exist', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-policy-empty-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  try {
    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const result = await guard.verifyPolicies([]);

    assert.strictEqual(result.status, 'no_policies');
    assert.strictEqual(result.evaluated, false);
    assert.strictEqual(result.policiesCount, 0);
    assert.strictEqual(result.filesScanned, 0);
    assert.strictEqual(result.passed, true); // backwards compatibility
    assert.ok(result.message.includes('No active ADR enforcement policies configured'));
    assert.ok(result.message.includes('Architectural policy coverage was not evaluated'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRPolicyGuard returns status passed and evaluated true when codebase complies with active policies', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-policy-pass-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Clean source file
  fs.writeFileSync(path.join(srcDir, 'client.js'), `
export async function getHealth() {
  return fetch('/health');
}
`, 'utf-8');

  const decisions = [
    {
      id: 'ADR-001',
      title: 'Ban Axios',
      status: 'accepted',
      enforcement: {
        rules: [
          { prohibitedImports: ['axios'] }
        ]
      }
    }
  ];

  try {
    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const result = await guard.verifyPolicies(decisions);

    assert.strictEqual(result.status, 'passed');
    assert.strictEqual(result.evaluated, true);
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.policiesCount, 1);
    assert.strictEqual(result.violations.length, 0);
    assert.ok(result.message.includes('Architectural policies verified: 1 active rule(s) checked'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRPolicyGuard returns status failed and evaluated true when violations exist', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-policy-fail-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Violating source file
  fs.writeFileSync(path.join(srcDir, 'badClient.js'), `
import axios from 'axios';
export function request() { return axios.get('/data'); }
`, 'utf-8');

  const decisions = [
    {
      id: 'ADR-001',
      title: 'Ban Axios',
      status: 'accepted',
      enforcement: {
        rules: [
          {
            prohibitedImports: ['axios'],
            violationMessage: 'Direct Axios usage is forbidden.'
          }
        ]
      }
    }
  ];

  try {
    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const result = await guard.verifyPolicies(decisions);

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.evaluated, true);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.policiesCount, 1);
    assert.strictEqual(result.violations.length, 1);
    assert.ok(result.message.includes('Architectural policy verification failed: 1 violation(s) detected'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdVerifyADR returns status no_policies when no decisions configured', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-verify-cmd-rigor-'));
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
    assert.strictEqual(res.passed, true);
    assert.ok(res.message.includes('No active ADR enforcement policies configured'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
