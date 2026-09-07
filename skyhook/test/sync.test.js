import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdSync, cmdTrace, cmdImpact, cmdUntraced } from '../lib/handlers/sync.js';

function setupTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sync-test-'));
  
  // Create some dummy code files with skyhook-implements tags
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir);
  
  fs.writeFileSync(path.join(srcDir, 'auth.js'), `
    // @skyhook-implements REQ-AUTH-001
    function login() {}
    
    // @skyhook-implements DEC-001
    function useJwt() {}
  `);
  
  fs.writeFileSync(path.join(srcDir, 'utils.js'), `
    function helper() {}
  `);
  
  // Mock context that uses this tmpDir
  const state = {
    backlog: {
      epics: [],
      stories: [
        { id: 'STORY-1', title: 'Login API', references: ['REQ-AUTH-001'] }
      ]
    },
    funcReqs: {
      requirements: [
        { id: 'REQ-AUTH-001', title: 'User Login' },
        { id: 'REQ-AUTH-002', title: 'User Logout' } // Untraced
      ]
    },
    decisions: {
      decisions: [
        { id: 'DEC-001', title: 'Use JWT' }
      ]
    }
  };

  const ctx = {
    state,
    skyhookDir: path.join(tmpDir, '.skyhook'),
    readBacklog: () => state.backlog,
    readFunctionalReqs: () => state.funcReqs,
    readDecisions: () => state.decisions
  };
  
  // Mock process.cwd() for the duration of the test
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;
  
  return {
    ctx,
    cleanup: () => {
      process.cwd = originalCwd;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

test('cmdSync finds code vs docs drift', async () => {
  const { ctx, cleanup } = setupTempDir();
  
  try {
    const result = await cmdSync(ctx, {});
    
    // Auth-001 should be implemented
    assert.strictEqual(result.implementedRequirements.includes('REQ-AUTH-001'), true);
    
    // Auth-002 should NOT be implemented
    assert.strictEqual(result.implementedRequirements.includes('REQ-AUTH-002'), false);
    
    // Should find the DEC-001 reference
    assert.ok(result.totalCodeReferences > 0);
  } finally {
    cleanup();
  }
});

test('cmdTrace traces a requirement ID', async () => {
  const { ctx, cleanup } = setupTempDir();
  
  try {
    const result = await cmdTrace(ctx, { id: 'REQ-AUTH-001' });
    
    assert.strictEqual(result.requirement.id, 'REQ-AUTH-001');
    assert.strictEqual(result.traceability.codeReferences.length, 1);
    assert.ok(result.traceability.codeReferences[0].file.endsWith('auth.js'));
    assert.strictEqual(result.traceability.relatedStories.length, 1);
    assert.strictEqual(result.traceability.relatedStories[0].id, 'STORY-1');
  } finally {
    cleanup();
  }
});

test('cmdTrace requires an ID', async () => {
  const { ctx, cleanup } = setupTempDir();
  try {
    const result = await cmdTrace(ctx, {});
    assert.ok(result.error);
    assert.match(result.error, /Missing requirement id/);
  } finally {
    cleanup();
  }
});

test('cmdImpact analyzes impact of changing a requirement', async () => {
  const { ctx, cleanup } = setupTempDir();
  
  try {
    const result = await cmdImpact(ctx, { id: 'REQ-AUTH-001' });
    
    assert.ok(result.impact);
    assert.strictEqual(result.impact.codeFilesCount, 1);
    assert.strictEqual(result.impact.storiesCount, 1);
  } finally {
    cleanup();
  }
});

test('cmdUntraced finds requirements with no code references', async () => {
  const { ctx, cleanup } = setupTempDir();
  
  try {
    const result = await cmdUntraced(ctx, {});
    
    // REQ-AUTH-002 is untraced
    assert.strictEqual(result.untraced.length, 1);
    assert.strictEqual(result.untraced[0].id, 'REQ-AUTH-002');
  } finally {
    cleanup();
  }
});
