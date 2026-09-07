import test from 'node:test';
import assert from 'node:assert';
import { cmdRecordDecision, cmdDecide } from '../lib/handlers/adr.js';

import fs from 'fs';
import path from 'path';
import os from 'os';

function createMockContext(tmpDir) {
  const state = {
    decisions: { decisions: [] },
    project: { name: 'Test Project', profile: 'web-app' },
    profile: {
      id: 'web-app',
      name: 'Web App',
      techStack: { technologies: [{ name: 'React', category: 'frontend' }] }
    },
    techStack: { technologies: [] }
  };

  return {
    state,
    skyhookDir: tmpDir || '/mock/dir',
    readDecisions: () => state.decisions,
    writeDecision: (data) => {
      const id = 'ADR-1';
      state.decisions.decisions.push({ id, ...data });
      return id;
    },
    readProjectYaml: () => state.project,
    readProfile: (name) => state.profile,
    readTechStack: () => state.techStack
  };
}

test('cmdRecordDecision requires title, decision, and context', async () => {
  const ctx = createMockContext();
  
  let result = await cmdRecordDecision(ctx, { title: 'T' });
  assert.ok(result.error);
  
  result = await cmdRecordDecision(ctx, { title: 'T', decision: 'D' });
  assert.ok(result.error);
  
  result = await cmdRecordDecision(ctx, { title: 'T', decision: 'D', context: 'C' });
  assert.ok(!result.error);
});

test('cmdRecordDecision creates an ADR and writes decision', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-adr-test-'));
  const ctx = createMockContext(tmpDir);
  
  try {
    const args = {
      title: 'Use React',
      decision: 'We will use React for the frontend.',
      context: 'We need a robust UI library.',
      status: 'proposed'
    };
    
    const result = await cmdRecordDecision(ctx, args);
    
    assert.strictEqual(result.decisionId, 'ADR-1');
    
    assert.strictEqual(ctx.state.decisions.decisions.length, 1);
    const decision = ctx.state.decisions.decisions[0];
    assert.strictEqual(decision.title, 'Use React');
    assert.strictEqual(decision.status, 'proposed');
    
    // Check if file was created
    assert.ok(fs.existsSync(path.join(tmpDir, 'decisions', 'records', 'ADR-1.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdDecide is an alias for cmdRecordDecision', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-adr-test-alias-'));
  const ctx = createMockContext(tmpDir);
  
  try {
    const args = {
      title: 'Use TypeScript',
      decision: 'We will use TypeScript.',
      context: 'Type safety is important.'
    };
    
    const result = await cmdDecide(ctx, args);
    assert.strictEqual(result.decisionId, 'ADR-1');
    assert.strictEqual(ctx.state.decisions.decisions.length, 1);
    assert.strictEqual(ctx.state.decisions.decisions[0].title, 'Use TypeScript');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
