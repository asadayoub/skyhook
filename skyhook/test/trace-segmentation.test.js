import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  traceRequirement, 
  isContractSymbol, 
  isTestSymbol, 
  partitionSymbols 
} from '../lib/tracer.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { registerCoreTools } from '../lib/harness/mcp/tools/coreTools.js';
import { formatResult } from '../cli/skyhook.js';

test('isContractSymbol, isTestSymbol, and partitionSymbols correctly classify symbols', () => {
  const contractSym1 = {
    file: 'specs/openapi.yaml',
    symbolName: 'POST /api/login',
    symbolType: 'contract-endpoint',
    metadata: { artifactKind: 'derived-contract', specType: 'openapi' }
  };

  const contractSym2 = {
    file: 'proto/auth.proto',
    symbolName: 'rpc Login',
    symbolType: 'contract-rpc',
    metadata: { artifactKind: 'derived-contract', specType: 'protobuf' }
  };

  const testSym1 = {
    file: 'test/auth.test.js',
    symbolName: 'testLogin',
    symbolType: 'function'
  };

  const testSym2 = {
    file: 'src/__tests__/validator.spec.ts',
    symbolName: 'validateEmail',
    symbolType: 'function'
  };

  const sourceSym1 = {
    file: 'src/services/AuthService.js',
    symbolName: 'AuthService',
    symbolType: 'class'
  };

  const sourceSym2 = {
    file: 'src/controllers/login.js',
    symbolName: 'handleLogin',
    symbolType: 'function'
  };

  assert.strictEqual(isContractSymbol(contractSym1), true, 'OpenAPI endpoint should be a contract symbol');
  assert.strictEqual(isContractSymbol(contractSym2), true, 'Protobuf RPC should be a contract symbol');
  assert.strictEqual(isContractSymbol(testSym1), false, 'Test file symbol should not be a contract symbol');
  assert.strictEqual(isContractSymbol(sourceSym1), false, 'Source symbol should not be a contract symbol');

  assert.strictEqual(isTestSymbol(testSym1), true, 'test/auth.test.js should be classified as test symbol');
  assert.strictEqual(isTestSymbol(testSym2), true, 'src/__tests__/validator.spec.ts should be classified as test symbol');
  assert.strictEqual(isTestSymbol(sourceSym1), false, 'src/services/AuthService.js should not be a test symbol');
  assert.strictEqual(isTestSymbol(contractSym1), false, 'OpenAPI endpoint should not be classified as a test symbol');

  const partitioned = partitionSymbols([contractSym1, contractSym2, testSym1, testSym2, sourceSym1, sourceSym2]);
  assert.strictEqual(partitioned.contractSymbols.length, 2, 'Should partition 2 contract symbols');
  assert.strictEqual(partitioned.testSymbols.length, 2, 'Should partition 2 test symbols');
  assert.strictEqual(partitioned.sourceSymbols.length, 2, 'Should partition 2 source symbols');
});

test('traceRequirement segments code references into source, test, and contract buckets', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-trace-seg-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });

  fs.writeFileSync(
    path.join(skyhookDir, 'requirements', 'functional.yaml'),
    `requirements:
  - id: REQ-AUTH-001
    title: User Authentication
    description: Support token authentication and user verification
`
  );

  // 1. Create source file
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'authService.js'),
    `// @skyhook-implements REQ-AUTH-001
export class AuthService {
  login(token) {
    return true;
  }
}
`
  );

  // 2. Create OpenAPI contract spec
  const specsDir = path.join(tmpDir, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(
    path.join(specsDir, 'openapi.yaml'),
    `openapi: 3.0.0
info:
  title: Auth API
  version: 1.0.0
paths:
  /api/v1/auth/login:
    post:
      summary: Authenticate user @implements REQ-AUTH-001
      responses:
        '200':
          description: OK
`
  );

  // 3. Create test file
  const testDir = path.join(tmpDir, 'test');
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDir, 'auth.test.js'),
    `// @skyhook-implements REQ-AUTH-001
export function testAuthService() {
  return true;
}
`
  );

  try {
    const trace = await traceRequirement(tmpDir, 'REQ-AUTH-001');

    assert.strictEqual(trace.requirementId, 'REQ-AUTH-001');
    assert.strictEqual(trace.requirement.title, 'User Authentication');

    // Union array preserved
    assert.strictEqual(trace.codeReferences.length, 3, 'codeReferences should contain union of all 3 symbols');
    assert.strictEqual(trace.files.length, 3, 'files should contain 3 unique files');

    // Partitioned arrays
    assert.strictEqual(trace.sourceSymbols.length, 1, 'sourceSymbols should have 1 entry');
    assert.strictEqual(trace.sourceSymbols[0].symbolName, 'AuthService');
    assert.strictEqual(trace.sourceSymbols[0].file, 'src/authService.js');

    assert.strictEqual(trace.contractSymbols.length, 1, 'contractSymbols should have 1 entry');
    assert.strictEqual(trace.contractSymbols[0].symbolName, 'POST /api/v1/auth/login');
    assert.strictEqual(trace.contractSymbols[0].file, 'specs/openapi.yaml');

    assert.strictEqual(trace.testSymbols.length, 1, 'testSymbols should have 1 entry');
    assert.strictEqual(trace.testSymbols[0].symbolName, 'testAuthService');
    assert.strictEqual(trace.testSymbols[0].file, 'test/auth.test.js');

    // MCP integration check
    const mcpRegistry = new MCPToolRegistry();
    registerCoreTools(mcpRegistry);
    const traceTool = mcpRegistry.get('skyhook_trace_requirement');
    assert.ok(traceTool, 'skyhook_trace_requirement should be registered');

    const mcpResult = await traceTool.execute({ id: 'REQ-AUTH-001' }, { projectDir: tmpDir });
    assert.strictEqual(mcpResult.isError, undefined);
    const mcpPayload = JSON.parse(mcpResult.content[0].text);
    assert.strictEqual(mcpPayload.sourceSymbols.length, 1);
    assert.strictEqual(mcpPayload.contractSymbols.length, 1);
    assert.strictEqual(mcpPayload.testSymbols.length, 1);
    assert.strictEqual(mcpPayload.codeReferences.length, 3);

    // CLI formatResult smoke check
    assert.doesNotThrow(() => {
      formatResult(trace);
    }, 'formatResult should format segmented trace without error');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('traceRequirement handles requirement with only source symbols cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-trace-source-only-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });

  fs.writeFileSync(
    path.join(skyhookDir, 'requirements', 'functional.yaml'),
    `requirements:
  - id: REQ-SRC-001
    title: Internal Computation
`
  );

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'compute.js'),
    `// @skyhook-implements REQ-SRC-001
export function calculateHash() {
  return 'abc';
}
`
  );

  try {
    const trace = await traceRequirement(tmpDir, 'REQ-SRC-001');
    assert.strictEqual(trace.sourceSymbols.length, 1);
    assert.strictEqual(trace.contractSymbols.length, 0);
    assert.strictEqual(trace.testSymbols.length, 0);
    assert.strictEqual(trace.codeReferences.length, 1);
    assert.strictEqual(trace.sourceSymbols[0].symbolName, 'calculateHash');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
