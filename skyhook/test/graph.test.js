import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdGraph } from '../lib/handlers/sync.js';
import { stringifyYaml } from '../lib/yaml.js';

test('cmdGraph generates a correct Mermaid Markdown file', async () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-graph-test-'));
  const skyhookDir = path.join(testDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });

  // Mock requirements
  const functional = {
    requirements: [
      { id: 'REQ-001', title: 'Login System', status: 'implemented' }
    ]
  };
  stringifyYaml(path.join(skyhookDir, 'requirements', 'functional.yaml'), functional);

  // Mock a JS file with a mapped and unmapped symbol
  fs.writeFileSync(path.join(testDir, 'auth.js'), `
    // @skyhook-implements REQ-001
    class AuthService {}

    function legacyHelper() {}
  `);

  // We have to mock the SkyhookContext because cmdGraph needs it to read functional reqs
  const mockCtx = {
    skyhookDir,
    readFunctionalReqs: () => functional,
    readNonFunctionalReqs: () => ({ requirements: [] })
  };

  try {
    // We need to run cmdGraph from within testDir so indexCodebase scans the right path
    const originalCwd = process.cwd();
    process.chdir(testDir);
    
    try {
      const result = await cmdGraph(mockCtx, {});
      assert.strictEqual(result.message, 'Mermaid graph generated successfully.');
      
      const mdPath = path.join(skyhookDir, 'trace-graph.md');
      assert.ok(fs.existsSync(mdPath), 'Graph file should be created');
      
      const content = fs.readFileSync(mdPath, 'utf-8');
      
      // Verify basic syntax
      assert.ok(content.startsWith('\`\`\`mermaid'), 'Starts with mermaid block');
      assert.ok(content.includes('graph TD'), 'Uses TD layout');
      
      // Verify Requirement node
      assert.ok(content.includes('REQ-001["REQ-001: Login System"]:::requirement'), 'Contains requirement node');
      
      // Verify File node
      assert.ok(content.includes('["auth.js"]:::file'), 'Contains file node');
      
      // Verify Symbols
      assert.ok(content.includes('["class AuthService"]:::traced'), 'Contains traced symbol node');
      assert.ok(content.includes('["function legacyHelper"]:::untraced'), 'Contains untraced symbol node');
      
      // Verify relationships
      assert.ok(content.includes('REQ-001 -->'), 'Requirement links to symbol');
      
    } finally {
      process.chdir(originalCwd);
    }
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
