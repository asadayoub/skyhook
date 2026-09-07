import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  cmdInit, 
  cmdVersion, 
  cmdHelp, 
  cmdDashboard, 
  cmdSetup,
  cmdPlan
} from '../lib/handlers/general.js';

function setupTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-general-test-'));
  
  // Mock context that uses this tmpDir
  const state = {
    backlog: { epics: [], stories: [] },
    funcReqs: { requirements: [] },
    nfReqs: { requirements: [] },
    decisions: { decisions: [] }
  };

  const ctx = {
    state,
    skyhookDir: path.join(tmpDir, '.skyhook'),
    readBacklog: () => state.backlog,
    readFunctionalReqs: () => state.funcReqs,
    readNonFunctionalReqs: () => state.nfReqs,
    readDecisions: () => state.decisions,
    readStandards: () => ({ adoptions: [] })
  };
  
  // Mock process.cwd() for the duration of the test
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;
  
  return {
    ctx,
    tmpDir,
    cleanup: () => {
      process.cwd = originalCwd;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

test('cmdVersion returns version info', async () => {
  const result = await cmdVersion({}, {});
  assert.ok(result.version);
  assert.ok(result.protocol);
});

test('cmdHelp returns list of commands', async () => {
  const result = await cmdHelp({}, {});
  assert.ok(result.commands);
  assert.ok(Array.isArray(result.commands));
  assert.ok(result.commands.length > 10);
});

test('cmdDashboard status, start and stop', async () => {
  const http = await import('http');
  const originalCreateServer = http.default.createServer;
  
  // Mock createServer to return a dummy server
  let mockServer = null;
  http.default.createServer = () => {
    mockServer = {
      listen: (port, host, cb) => {
        if (cb) cb();
      },
      close: () => {
        mockServer = null;
      }
    };
    return mockServer;
  };
  
  try {
    let result = await cmdDashboard({}, { action: 'status' });
    assert.strictEqual(result.running, false);
    
    result = await cmdDashboard({}, { action: 'start' });
    assert.ok(result.message.includes('Dashboard started'));
    
    result = await cmdDashboard({}, { action: 'status' });
    assert.strictEqual(result.running, true);
    
    result = await cmdDashboard({}, { action: 'stop' });
    assert.ok(result.message.includes('Dashboard stopped'));
    
    result = await cmdDashboard({}, { action: 'status' });
    assert.strictEqual(result.running, false);
  } finally {
    http.default.createServer = originalCreateServer;
  }
});

test('cmdInit initializes a new skyhook project', async () => {
  const { ctx, tmpDir, cleanup } = setupTempDir();
  
  try {
    const result = await cmdInit(ctx, { name: 'Test Init Project' });
    
    assert.strictEqual(result.message, 'Skyhook initialized successfully!');
    assert.ok(result.projectId);
    
    const skyhookDir = path.join(tmpDir, '.skyhook');
    assert.ok(fs.existsSync(skyhookDir));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'project.yaml')));
    assert.ok(fs.existsSync(path.join(skyhookDir, 'backlog', 'epics.yaml')));
  } finally {
    cleanup();
  }
});

test('cmdInit rejects re-initialization without force', async () => {
  const { ctx, tmpDir, cleanup } = setupTempDir();
  
  try {
    await cmdInit(ctx, { name: 'Test Init Project' });
    const result2 = await cmdInit(ctx, { name: 'Test Init Project' });
    
    assert.ok(result2.error);
    assert.match(result2.error, /already exists/);
  } finally {
    cleanup();
  }
});

test('cmdPlan generates PROJECT_PLAN.md', async () => {
  const { ctx, tmpDir, cleanup } = setupTempDir();
  
  try {
    // First init the project
    await cmdInit(ctx, { name: 'Test Plan Project' });
    
    const result = await cmdPlan(ctx, {});
    
    assert.strictEqual(result.message, 'Project plan generated successfully');
    assert.ok(fs.existsSync(result.path));
    
    const content = fs.readFileSync(result.path, 'utf-8');
    assert.match(content, /Project Plan:/);
  } finally {
    cleanup();
  }
});

test('cmdSetup auto-configures agent harnesses', async () => {
  const { ctx, tmpDir, cleanup } = setupTempDir();
  
  try {
    const resultCopilot = await cmdSetup(ctx, { agent: 'copilot' });
    assert.ok(resultCopilot.success);
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));
    
    const resultClaude = await cmdSetup(ctx, { agent: 'claude' });
    assert.ok(resultClaude.success);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'commands')));
    
    const resultGemini = await cmdSetup(ctx, { agent: 'gemini' });
    assert.ok(resultGemini.success);
    assert.ok(fs.existsSync(path.join(tmpDir, '.gemini', 'functions', 'skyhook.js')));
    
  } finally {
    cleanup();
  }
});
