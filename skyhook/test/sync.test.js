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
  
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir);
  
  fs.writeFileSync(path.join(srcDir, 'auth.js'), `
    // @skyhook-implements REQ-AUTH-001
    function login() {}
    
    // @skyhook-implements DEC-001
    function useJwt() {}
  `);
  
  fs.writeFileSync(path.join(srcDir, 'utils.js'), `
    function helper() {}
  `);
  
  const reqsDir = path.join(skyhookDir, 'requirements');
  const backlogDir = path.join(skyhookDir, 'backlog');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  
  fs.mkdirSync(reqsDir);
  fs.mkdirSync(backlogDir);
  fs.mkdirSync(decisionsDir);
  
  fs.writeFileSync(path.join(reqsDir, 'functional.yaml'), `
requirements:
  - id: REQ-AUTH-001
    title: User Login
    status: implemented
  - id: REQ-AUTH-002
    title: User Logout
    status: implemented
`);

  fs.writeFileSync(path.join(reqsDir, 'non-functional.yaml'), `requirements: []`);

  fs.writeFileSync(path.join(backlogDir, 'epics.yaml'), `
epics: []
stories:
  - id: STORY-1
    title: Login API
    relatedRequirements: ["REQ-AUTH-001"]
`);

  fs.writeFileSync(path.join(decisionsDir, 'index.yaml'), `
decisions:
  - id: DEC-001
    title: Use JWT
    relatedRequirements: ["REQ-AUTH-001"]
`);

  // Mock context that uses this tmpDir
  const state = {};

  const ctx = {
    state,
    skyhookDir: path.join(tmpDir, '.skyhook'),
    readBacklog: () => state.backlog,
    readFunctionalReqs: () => state.funcReqs,
    readDecisions: () => state.decisions,
    readProjectYaml: () => ({}),
    readTechStack: () => ({})
  };
  
  // Mock process.cwd() for the duration of the test
  const originalCwd = process.cwd();
  process.chdir(tmpDir);
  
  return {
    ctx,
    cleanup: () => {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

test('cmdTrace traces a requirement ID', async () => {
  const { ctx, cleanup } = setupTempDir();
  
  try {
    const result = await cmdTrace(ctx, { id: 'REQ-AUTH-001' });
    
    assert.strictEqual(result.requirement.id, 'REQ-AUTH-001');
    assert.strictEqual(result.codeReferences.length, 1);
    assert.ok(result.codeReferences[0].file.endsWith('auth.js'));
    assert.strictEqual(result.stories.length, 1);
    assert.strictEqual(result.stories[0].id, 'STORY-1');
  } finally {
    cleanup();
  }
});

test('cmdTrace requires an ID', async () => {
  const { ctx, cleanup } = setupTempDir();
  try {
    const result = await cmdTrace(ctx, {});
    assert.ok(result.error);
    assert.match(result.error, /Missing required: id/);
  } finally {
    cleanup();
  }
});

test('cmdImpact analyzes impact of changing a requirement', async () => {
  const { ctx, cleanup } = setupTempDir();
  
  try {
    const result = await cmdImpact(ctx, { id: 'REQ-AUTH-001' });
    
    assert.ok(result.directImpact);
    assert.strictEqual(result.directImpact.codeFiles, 1);
    assert.strictEqual(result.directImpact.stories, 1);
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
