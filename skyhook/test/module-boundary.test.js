import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ASTImportGraph } from '../lib/drift/ASTImportGraph.js';
import { ModuleBoundaryGuard } from '../lib/drift/ModuleBoundaryGuard.js';

test('ModuleBoundaryGuard: detects DDD layer violations and module encapsulation breaches', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-boundary-test-'));

  try {
    const srcDomain = path.join(tmpDir, 'src', 'domain');
    const srcApp = path.join(tmpDir, 'src', 'application');
    const srcInfra = path.join(tmpDir, 'src', 'infrastructure');
    const srcPres = path.join(tmpDir, 'src', 'presentation');
    const srcBilling = path.join(tmpDir, 'src', 'modules', 'billing');

    fs.mkdirSync(srcDomain, { recursive: true });
    fs.mkdirSync(srcApp, { recursive: true });
    fs.mkdirSync(srcInfra, { recursive: true });
    fs.mkdirSync(srcPres, { recursive: true });
    fs.mkdirSync(path.join(srcBilling, 'internal'), { recursive: true });

    // Domain entity
    fs.writeFileSync(path.join(srcDomain, 'Order.js'), 'export class Order {}');

    // Infrastructure repo
    fs.writeFileSync(path.join(srcInfra, 'OrderRepository.js'), `
      import { Order } from '../domain/Order.js';
      export class OrderRepository {}
    `);

    // Presentation controller ILLEGALLY importing infrastructure directly
    fs.writeFileSync(path.join(srcPres, 'OrderController.js'), `
      import { OrderRepository } from '../infrastructure/OrderRepository.js';
      export class OrderController {}
    `);

    // Module with public API and private internal file
    fs.writeFileSync(path.join(srcBilling, 'index.js'), "export { processPayment } from './internal/stripe.js';");
    fs.writeFileSync(path.join(srcBilling, 'internal', 'stripe.js'), "export function processPayment() {}");

    // Application service ILLEGALLY importing internal/stripe.js instead of index.js
    fs.writeFileSync(path.join(srcApp, 'CheckoutService.js'), `
      import { processPayment } from '../modules/billing/internal/stripe.js';
      export class CheckoutService {}
    `);

    const graph = new ASTImportGraph(tmpDir);
    await graph.build();

    const customConfig = {
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'application', pattern: 'src/application/**', allowedDependencies: ['domain'] },
        { name: 'infrastructure', pattern: 'src/infrastructure/**', allowedDependencies: ['domain', 'application'] },
        { name: 'presentation', pattern: 'src/presentation/**', allowedDependencies: ['domain', 'application'] }
      ],
      modules: [
        {
          name: 'billing',
          root: 'src/modules/billing',
          publicApi: 'src/modules/billing/index.js'
        }
      ],
      circularDependencies: { allowed: false }
    };

    const guard = new ModuleBoundaryGuard(tmpDir, customConfig);
    const result = guard.validate(graph);

    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.violations.length, 2);

    // 1. Layer violation check
    const layerViolation = result.violations.find(v => v.type === 'LAYER_VIOLATION');
    assert.ok(layerViolation);
    assert.strictEqual(layerViolation.fromLayer, 'presentation');
    assert.strictEqual(layerViolation.toLayer, 'infrastructure');
    assert.strictEqual(layerViolation.severity, 'critical');

    // 2. Encapsulation breach check
    const encapsViolation = result.violations.find(v => v.type === 'ENCAPSULATION_BREACH');
    assert.ok(encapsViolation);
    assert.strictEqual(encapsViolation.module, 'billing');
    assert.strictEqual(encapsViolation.importedFile, 'src/modules/billing/internal/stripe.js');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ModuleBoundaryGuard: auto-detects standard conventions when config is absent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-autodetect-test-'));

  try {
    const srcDomain = path.join(tmpDir, 'src', 'domain');
    const srcControllers = path.join(tmpDir, 'src', 'controllers');
    const srcInfra = path.join(tmpDir, 'src', 'infrastructure');

    fs.mkdirSync(srcDomain, { recursive: true });
    fs.mkdirSync(srcControllers, { recursive: true });
    fs.mkdirSync(srcInfra, { recursive: true });

    fs.writeFileSync(path.join(srcDomain, 'Entity.js'), 'export class Entity {}');
    fs.writeFileSync(path.join(srcInfra, 'Db.js'), 'export class Db {}');
    fs.writeFileSync(path.join(srcControllers, 'Api.js'), "import { Db } from '../infrastructure/Db.js';");

    const graph = new ASTImportGraph(tmpDir);
    await graph.build();

    const guard = new ModuleBoundaryGuard(tmpDir);
    const result = guard.validate(graph);

    assert.strictEqual(result.autoDetected, true);
    assert.strictEqual(result.passed, false);
    const layerV = result.violations.find(v => v.type === 'LAYER_VIOLATION');
    assert.ok(layerV);
    assert.strictEqual(layerV.fromLayer, 'presentation');
    assert.strictEqual(layerV.toLayer, 'infrastructure');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
