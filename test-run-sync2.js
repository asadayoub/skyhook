import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sync-test-'));

async function run() {
  const { cmdTrace } = await import('./skyhook/lib/handlers/sync.js');
  
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir);
  fs.writeFileSync(path.join(srcDir, 'auth.js'), 'function login() {}');
  
  const state = { backlog: { epics: [], stories: [] }, funcReqs: { requirements: [] }, decisions: { decisions: [] } };
  const ctx = {
    state,
    skyhookDir: path.join(tmpDir, '.skyhook'),
    readBacklog: () => state.backlog,
    readFunctionalReqs: () => state.funcReqs,
    readDecisions: () => state.decisions,
    readProjectYaml: () => ({}),
    readTechStack: () => ({})
  };
  
  const originalCwd = process.cwd();
  process.chdir(tmpDir);
  
  console.log("Calling cmdTrace...");
  const result = await cmdTrace(ctx, { id: 'REQ-AUTH-001' });
  console.log("cmdTrace finished", !!result);
  
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

run().catch(console.error);
