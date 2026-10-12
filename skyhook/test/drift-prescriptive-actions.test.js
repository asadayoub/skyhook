import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DriftAggregator } from '../lib/drift/DriftAggregator.js';
import { createSkyhookContext } from '../lib/context.js';
import { cmdDrift } from '../lib/handlers/sync.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { registerCoreTools } from '../lib/harness/mcp/tools/coreTools.js';

test('generatePrescribedActions produces concrete MCP actions for package drift, boundary breaches, cycles, and semantic rules', () => {
  const aggregator = new DriftAggregator({ projectDir: process.cwd() });

  const violations = [
    {
      type: 'PACKAGE_DRIFT',
      orm: 'prisma',
      category: 'Database',
      message: "Detected undeclared ORM 'prisma'"
    },
    {
      type: 'LAYER_VIOLATION',
      file: 'src/controllers/orderController.js',
      line: 14,
      fromLayer: 'presentation',
      toLayer: 'infrastructure',
      message: 'Presentation layer must not import directly from infrastructure'
    },
    {
      type: 'SEMANTIC_ERROR',
      ruleId: 'no-direct-env-access',
      file: 'src/services/paymentService.js',
      line: 35,
      severity: 'error',
      suggestion: 'Use typed config module instead of process.env'
    },
    {
      type: 'ADR_POLICY_VIOLATION',
      adrId: 'ADR-003',
      file: 'src/legacy/auth.js',
      line: 8,
      message: 'Forbidden import of bcrypt disallowed by ADR-003'
    }
  ];

  const circularCycles = [
    ['src/modules/order.js', 'src/modules/customer.js', 'src/modules/order.js']
  ];

  const actions = aggregator.generatePrescribedActions(violations, circularCycles);

  // 1. Check circular dependency action
  const cycleAction = actions.find(a => a.type === 'circular_dependency');
  assert.ok(cycleAction, 'Should have circular dependency action');
  assert.strictEqual(cycleAction.mcpTool, 'skyhook_create_task');
  assert.strictEqual(cycleAction.priority, 'critical');
  assert.ok(cycleAction.arguments.title.includes('Break circular dependency cycle'));

  // 2. Check package drift actions
  const adoptAction = actions.find(a => a.type === 'package_drift' && a.mcpTool === 'skyhook_adopt_drift');
  assert.ok(adoptAction, 'Should have skyhook_adopt_drift action');
  assert.deepStrictEqual(adoptAction.arguments.technologies, [{ name: 'prisma', category: 'Database' }]);

  const draftAdrAction = actions.find(a => a.type === 'package_drift' && a.mcpTool === 'skyhook_draft_adr');
  assert.ok(draftAdrAction, 'Should have skyhook_draft_adr action');
  assert.strictEqual(draftAdrAction.arguments.title, 'Adopt prisma for Database');

  // 3. Check boundary layer violation actions
  const layerTaskAction = actions.find(a => a.type === 'boundary_violation' && a.mcpTool === 'skyhook_create_task');
  assert.ok(layerTaskAction, 'Should have decouple task action');
  assert.strictEqual(layerTaskAction.targetFile, 'src/controllers/orderController.js');
  assert.strictEqual(layerTaskAction.line, 14);

  const layerAdrAction = actions.find(a => a.type === 'boundary_violation' && a.mcpTool === 'skyhook_record_decision');
  assert.ok(layerAdrAction, 'Should have exception ADR action');
  assert.strictEqual(layerAdrAction.arguments.status, 'accepted');

  // 4. Check semantic violation action
  const semanticAction = actions.find(a => a.type === 'semantic_violation');
  assert.ok(semanticAction, 'Should have semantic fix task action');
  assert.strictEqual(semanticAction.mcpTool, 'skyhook_create_task');
  assert.ok(semanticAction.arguments.title.includes('no-direct-env-access'));

  // 5. Check ADR policy violation action
  const adrPolicyAction = actions.find(a => a.type === 'adr_policy_violation');
  assert.ok(adrPolicyAction, 'Should have ADR policy fix action');
  assert.strictEqual(adrPolicyAction.mcpTool, 'skyhook_create_task');
  assert.ok(adrPolicyAction.arguments.title.includes('ADR-003'));
});

test('DriftAggregator end-to-end: computes prescribedActions on project with boundary violation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-prescribed-e2e-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'src', 'controllers'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'src', 'infrastructure'), { recursive: true });

  fs.writeFileSync(path.join(skyhookDir, 'tech-stack.yaml'), `
schemaVersion: 1.0.0
technologies:
  - name: Node.js
    category: runtime
`);

  fs.writeFileSync(path.join(skyhookDir, 'decisions', 'index.yaml'), `
schemaVersion: 1.0.0
decisions: []
`);

  // Controller importing infrastructure directly
  fs.writeFileSync(path.join(tmpDir, 'src', 'controllers', 'orderController.js'), `
    import { RawDbConnection } from '../infrastructure/db.js';
    export class OrderController {
      handle() {
        return new RawDbConnection().run();
      }
    }
  `);

  fs.writeFileSync(path.join(tmpDir, 'src', 'infrastructure', 'db.js'), `
    export class RawDbConnection {
      run() { return true; }
    }
  `);

  const ctx = createSkyhookContext(tmpDir);

  try {
    const aggregator = new DriftAggregator(ctx);
    const scorecard = await aggregator.analyze();

    assert.ok(Array.isArray(scorecard.prescribedActions), 'Scorecard must include prescribedActions array');
    assert.ok(scorecard.prescribedActions.length >= 2, 'Should have at least refactor task and exception ADR');
    assert.strictEqual(scorecard.summary.prescribedActionsCount, scorecard.prescribedActions.length);

    const refactorTask = scorecard.prescribedActions.find(a => a.mcpTool === 'skyhook_create_task');
    assert.ok(refactorTask, 'Should prescribe skyhook_create_task');
    assert.ok(refactorTask.arguments.title.includes('orderController.js'));

    const exceptionAdr = scorecard.prescribedActions.find(a => a.mcpTool === 'skyhook_record_decision');
    assert.ok(exceptionAdr, 'Should prescribe skyhook_record_decision');
    assert.ok(exceptionAdr.arguments.title.includes('orderController.js'));

    // Test MCP tool integration
    const mcpRegistry = new MCPToolRegistry();
    registerCoreTools(mcpRegistry);
    const driftTool = mcpRegistry.get('skyhook_check_drift');
    assert.ok(driftTool, 'skyhook_check_drift must be registered');

    const mcpRes = await driftTool.execute({}, ctx);
    assert.strictEqual(mcpRes.isError, undefined);
    const mcpPayload = JSON.parse(mcpRes.content[0].text);
    assert.ok(Array.isArray(mcpPayload.prescribedActions));
    assert.ok(mcpPayload.prescribedActions.length >= 2);

    // Test cmdDrift CLI handler execution
    const cliRes = await cmdDrift(ctx, {});
    assert.ok(cliRes.prescribedActions.length >= 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
