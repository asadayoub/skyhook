import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { traceRequirement, generateCoverageHeatmap, indexCodebase } from '../lib/tracer.js';

async function runTests() {
  console.log('--- AST Tracer Tests ---');
  
  const testDir = fs.mkdtempSync(path.join(process.cwd(), 'skyhook-ast-test-'));
  const skyhookDir = path.join(testDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });
  
  // Setup functional requirements
  fs.writeFileSync(path.join(skyhookDir, 'requirements', 'functional.yaml'), `
requirements:
  - id: REQ-001
    title: Auth System
    status: implemented
  - id: REQ-002
    title: Unimplemented Feature
    status: in-progress
  `);

  // Setup a test JS file with a class and a function
  fs.writeFileSync(path.join(testDir, 'auth.js'), `
    // @skyhook-implements REQ-001
    class AuthService {
      login() {}
    }

    // No annotations here
    function legacyHelper() {
      return true;
    }
    
    // @skyhook-implements REQ-001
    const arrowFunc = () => {};
  `);

  try {
    // 1. Test symbol extraction (indexCodebase)
    const allSymbols = await indexCodebase(testDir);
    assert.strictEqual(allSymbols.length, 4, 'Should find 4 significant symbols (Class, Method, Function, Arrow)');
    
    const legacy = allSymbols.find(s => s.symbolName === 'legacyHelper');
    assert.strictEqual(legacy.traced, false, 'legacyHelper should not be traced');
    
    const authService = allSymbols.find(s => s.symbolName === 'AuthService');
    assert.strictEqual(authService.traced, true, 'AuthService should be traced');
    assert.strictEqual(authService.requirementId, 'REQ-001', 'AuthService maps to REQ-001');

    // 2. Test traceRequirement
    const trace = await traceRequirement(testDir, 'REQ-001');
    assert.strictEqual(trace.codeReferences.length, 2, 'REQ-001 should have 2 code refs');
    assert.strictEqual(trace.codeReferences[0].symbolName, 'AuthService', 'Should extract class name');

    // 3. Test Coverage Heatmap
    const coverage = await generateCoverageHeatmap(testDir);
    assert.strictEqual(coverage.summary.totalSymbols, 4, 'Total 4');
    assert.strictEqual(coverage.summary.tracedSymbols, 2, 'Traced 2');
    assert.strictEqual(coverage.summary.untracedSymbols, 2, 'Untraced 2');
    
    assert.strictEqual(coverage.darkMatter.length, 1, '1 file in dark matter');
    assert.strictEqual(coverage.darkMatter[0].untracedCount, 2, 'auth.js has 2 untraced symbols');
    
    console.log('✅ AST Tracer tests passed');
  } catch (e) {
    console.error('❌ AST Tracer tests failed:', e);
    process.exitCode = 1;
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runTests();
