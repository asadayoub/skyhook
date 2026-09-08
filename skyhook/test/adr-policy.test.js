import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRPolicyGuard } from '../lib/adr/ADRPolicyGuard.js';
import { cmdVerifyADR } from '../lib/handlers/adr.js';

test('ADRPolicyGuard detects prohibited imports in source files', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-policy-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  // Create a source file importing prohibited library 'axios'
  const sourceCode = `
import axios from 'axios';

export async function fetchUser(id) {
  return axios.get('/api/users/' + id);
}
`;
  fs.writeFileSync(path.join(srcDir, 'userClient.js'), sourceCode, 'utf-8');

  // Define decision with enforcement rule
  const decisions = [
    {
      id: 'ADR-010',
      title: 'Adopt Native Fetch and Deprecate Axios',
      status: 'accepted',
      enforcement: {
        rules: [
          {
            prohibitedImports: ['axios'],
            violationMessage: 'Axios is prohibited by ADR-010. Use native fetch.'
          }
        ]
      }
    }
  ];

  try {
    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const result = await guard.verifyPolicies(decisions);

    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.violations.length, 1);
    assert.strictEqual(result.violations[0].adrId, 'ADR-010');
    assert.ok(result.violations[0].message.includes('Axios is prohibited'));
    assert.ok(result.violations[0].file.includes('userClient.js'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRPolicyGuard passes when source files comply with policies', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-policy-clean-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const sourceCode = `
export async function fetchUser(id) {
  const res = await fetch('/api/users/' + id);
  return res.json();
}
`;
  fs.writeFileSync(path.join(srcDir, 'cleanClient.js'), sourceCode, 'utf-8');

  const decisions = [
    {
      id: 'ADR-010',
      title: 'Adopt Native Fetch',
      status: 'accepted',
      enforcement: {
        rules: [
          {
            prohibitedImports: ['axios']
          }
        ]
      }
    }
  ];

  try {
    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const result = await guard.verifyPolicies(decisions);

    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.violations.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdVerifyADR returns pass status when no violations exist', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-verify-cmd-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const mockCtx = {
    skyhookDir,
    readDecisions: () => ({ decisions: [] })
  };

  try {
    const res = await cmdVerifyADR(mockCtx);
    assert.strictEqual(res.passed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
