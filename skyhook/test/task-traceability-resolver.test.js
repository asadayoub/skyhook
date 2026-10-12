import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  indexCodebase,
  traceRequirement,
  generateCoverageHeatmap,
  mapRequirementToFile
} from '../lib/tracer.js';
import { cmdTrace } from '../lib/handlers/sync.js';
import { createSkyhookContext } from '../lib/context.js';

function setupTraceabilityRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-trace-tiers-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });

  fs.writeFileSync(path.join(skyhookDir, 'requirements', 'functional.yaml'), `
schemaVersion: "1.0.0"
requirements:
  - id: REQ-AUTH-01
    title: User Authentication
    status: implemented
  - id: REQ-BILL-02
    title: Billing & Invoicing
    status: implemented
  - id: REQ-PAY-03
    title: Payment Gateway
    status: in-progress
`, 'utf-8');

  // Source files
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(path.join(srcDir, 'auth'), { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'billing'), { recursive: true });
  fs.mkdirSync(path.join(srcDir, 'payments'), { recursive: true });

  // 1. File with explicit comment (Tier 1)
  fs.writeFileSync(path.join(srcDir, 'auth', 'login.js'), `
// @skyhook-implements REQ-AUTH-01
export class LoginService {
  authenticate(user, pass) { return true; }
}
`, 'utf-8');

  // 2. Clean file without any inline comments (will be mapped via Tier 2 manifest)
  fs.writeFileSync(path.join(srcDir, 'billing', 'invoice.js'), `
export class InvoiceGenerator {
  generate(orderId) { return { orderId, amount: 100 }; }
}
`, 'utf-8');

  // 3. Clean file without comments (will be mapped via Tier 3 backlog evidence)
  fs.writeFileSync(path.join(srcDir, 'payments', 'gateway.js'), `
export class StripeGateway {
  charge(card, amount) { return { success: true }; }
}
`, 'utf-8');

  return { tmpDir, skyhookDir, srcDir };
}

test('TASK-F09: Tier 1 explicit in-code annotations are resolved with confidence 1.0', async () => {
  const { tmpDir } = setupTraceabilityRepo();

  try {
    const symbols = await indexCodebase(tmpDir);
    const loginSym = symbols.find(s => s.symbolName === 'LoginService');

    assert.ok(loginSym);
    assert.strictEqual(loginSym.traced, true);
    assert.strictEqual(loginSym.requirementId, 'REQ-AUTH-01');
    assert.strictEqual(loginSym.traceabilityTier, 1);
    assert.strictEqual(loginSym.traceabilityConfidence, 1.0);
    assert.strictEqual(loginSym.tierLabel, 'in-code-annotation');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F09: Tier 2 external manifest resolves unannotated source files without touching code', async () => {
  const { tmpDir, skyhookDir } = setupTraceabilityRepo();

  try {
    // Write external manifest mapping REQ-BILL-02 to invoice.js
    fs.writeFileSync(path.join(skyhookDir, 'traceability.yaml'), `
schemaVersion: "1.0.0"
mappings:
  - requirementId: REQ-BILL-02
    files:
      - src/billing/invoice.js
`, 'utf-8');

    const symbols = await indexCodebase(tmpDir);
    const invoiceSym = symbols.find(s => s.symbolName === 'InvoiceGenerator');

    assert.ok(invoiceSym);
    assert.strictEqual(invoiceSym.traced, true);
    assert.strictEqual(invoiceSym.requirementId, 'REQ-BILL-02');
    assert.strictEqual(invoiceSym.traceabilityTier, 2);
    assert.strictEqual(invoiceSym.traceabilityConfidence, 0.9);
    assert.strictEqual(invoiceSym.tierLabel, 'external-manifest');

    // traceRequirement finds the Tier 2 reference
    const trace = await traceRequirement(tmpDir, 'REQ-BILL-02');
    assert.ok(trace.codeReferences.length >= 1);
    assert.strictEqual(trace.codeReferences[0].symbolName, 'InvoiceGenerator');
    assert.strictEqual(trace.codeReferences[0].traceabilityTier, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F09: Tier 3 backlog task and story evidence resolves file references', async () => {
  const { tmpDir, skyhookDir } = setupTraceabilityRepo();

  try {
    // Setup backlog linking REQ-PAY-03 to gateway.js
    fs.writeFileSync(path.join(skyhookDir, 'backlog', 'epics.yaml'), `
schemaVersion: "1.0.0"
epics:
  - id: EPIC-01
    title: Payments
stories:
  - id: STORY-01
    epicId: EPIC-01
    title: Integrate Stripe
    relatedRequirements:
      - REQ-PAY-03
tasks:
  - id: TASK-001
    parentId: STORY-01
    title: Build Gateway
    targetFiles:
      - src/payments/gateway.js
`, 'utf-8');

    const symbols = await indexCodebase(tmpDir);
    const stripeSym = symbols.find(s => s.symbolName === 'StripeGateway');

    assert.ok(stripeSym);
    assert.strictEqual(stripeSym.traced, true);
    assert.strictEqual(stripeSym.requirementId, 'REQ-PAY-03');
    assert.strictEqual(stripeSym.traceabilityTier, 3);
    assert.strictEqual(stripeSym.traceabilityConfidence, 0.75);
    assert.strictEqual(stripeSym.tierLabel, 'backlog-evidence');

    // traceRequirement finds the Tier 3 reference
    const trace = await traceRequirement(tmpDir, 'REQ-PAY-03');
    assert.ok(trace.codeReferences.length >= 1);
    assert.strictEqual(trace.codeReferences[0].symbolName, 'StripeGateway');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F09: Multi-tier traceability drastically increases dark matter coverage', async () => {
  const { tmpDir, skyhookDir } = setupTraceabilityRepo();

  try {
    // 1. Initial coverage with only Tier 1:
    const initialCoverage = await generateCoverageHeatmap(tmpDir);

    // 2. Add Tier 2 manifest and Tier 3 backlog
    fs.writeFileSync(path.join(skyhookDir, 'traceability.yaml'), `
schemaVersion: "1.0.0"
mappings:
  - requirementId: REQ-BILL-02
    files:
      - src/billing/invoice.js
`, 'utf-8');

    fs.writeFileSync(path.join(skyhookDir, 'backlog', 'epics.yaml'), `
schemaVersion: "1.0.0"
stories:
  - id: STORY-01
    title: Payments
    relatedRequirements: [REQ-PAY-03]
tasks:
  - id: TASK-001
    parentId: STORY-01
    title: Gateway
    targetFiles: [src/payments/gateway.js]
`, 'utf-8');

    const finalCoverage = await generateCoverageHeatmap(tmpDir);

    assert.ok(finalCoverage.summary.tracedSymbols > initialCoverage.summary.tracedSymbols);
    assert.ok(finalCoverage.summary.overallCoverage > initialCoverage.summary.overallCoverage);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F09: mapRequirementToFile and cmdTrace --map append declarative mappings', async () => {
  const { tmpDir, skyhookDir } = setupTraceabilityRepo();

  try {
    const ctx = createSkyhookContext(tmpDir);

    const mapRes = await cmdTrace(ctx, {
      map: 'REQ-BILL-02',
      file: 'src/billing/invoice.js',
      quiet: true
    });

    assert.strictEqual(mapRes.success, true);
    assert.ok(fs.existsSync(path.join(skyhookDir, 'traceability.yaml')));

    // Verify trace immediately finds the mapped symbol
    const trace = await traceRequirement(tmpDir, 'REQ-BILL-02');
    assert.ok(trace.codeReferences.some(c => c.symbolName === 'InvoiceGenerator'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

