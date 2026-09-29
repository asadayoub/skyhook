import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { C4ArchitectureGenerator } from '../lib/drift/C4ArchitectureGenerator.js';
import { ASTImportGraph } from '../lib/drift/ASTImportGraph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'c4_architecture_test');

describe('C4ArchitectureGenerator', () => {
  before(() => {
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'services'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'repositories'), { recursive: true });

    // package.json with express, pg, redis, stripe
    fs.writeFileSync(path.join(FIXTURES_DIR, 'package.json'), JSON.stringify({
      name: 'mock-c4-service',
      dependencies: {
        'express': '^4.18.2',
        'pg': '^8.11.3',
        'redis': '^4.6.10',
        'stripe': '^14.1.0'
      }
    }, null, 2));

    // Controller importing Service
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'controllers', 'orderController.js'), `
      import { OrderService } from '../services/orderService.js';
      export class OrderController {
        constructor() { this.service = new OrderService(); }
      }
    `);

    // Service importing Repository
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'services', 'orderService.js'), `
      import { OrderRepository } from '../repositories/orderRepository.js';
      export class OrderService {
        constructor() { this.repo = new OrderRepository(); }
      }
    `);

    // Repository
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'repositories', 'orderRepository.js'), `
      export class OrderRepository {
        async save(order) { return true; }
      }
    `);
  });

  after(() => {
    if (fs.existsSync(FIXTURES_DIR)) {
      fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  test('infers containers, components, and relationships accurately', async () => {
    const graph = new ASTImportGraph(FIXTURES_DIR);
    await graph.build();

    const c4Gen = new C4ArchitectureGenerator(FIXTURES_DIR, graph);
    const inferred = await c4Gen.inferArchitecture();

    // Check containers
    const containerIds = inferred.containers.map(c => c.id);
    assert.ok(containerIds.includes('api_service'), 'Should infer API service container');
    assert.ok(containerIds.includes('database'), 'Should infer Database container from pg dependency');
    assert.ok(containerIds.includes('cache_queue'), 'Should infer Cache container from redis dependency');
    assert.ok(containerIds.includes('stripe'), 'Should infer Stripe external SaaS container');

    // Check components
    const compNames = inferred.components.map(c => c.name);
    assert.ok(compNames.includes('orderController'), 'Should detect orderController component');
    assert.ok(compNames.includes('orderService'), 'Should detect orderService component');
    assert.ok(compNames.includes('orderRepository'), 'Should detect orderRepository component');

    // Check component relationships
    assert.ok(inferred.componentRelationships.length >= 2, 'Should detect component call chains');
  });

  test('generates valid Mermaid C4Container and C4Component diagrams', async () => {
    const graph = new ASTImportGraph(FIXTURES_DIR);
    await graph.build();

    const c4Gen = new C4ArchitectureGenerator(FIXTURES_DIR, graph);
    const inferred = await c4Gen.inferArchitecture();

    const containerMermaid = c4Gen.toMermaidContainerDiagram(inferred);
    assert.match(containerMermaid, /^C4Container/m, 'Must start with C4Container');
    assert.match(containerMermaid, /Container\(api_service/m, 'Must declare api_service');
    assert.match(containerMermaid, /ContainerDb\(database/m, 'Must declare database');
    assert.match(containerMermaid, /ContainerDb\(cache_queue/m, 'Must declare cache');
    assert.match(containerMermaid, /System_Ext\(stripe/m, 'Must declare external Stripe');
    assert.match(containerMermaid, /Rel\(api_service, database/m, 'Must declare API to DB relationship');

    const componentMermaid = c4Gen.toMermaidComponentDiagram(inferred, 'API Backend Service');
    assert.match(componentMermaid, /^C4Component/m, 'Must start with C4Component');
    assert.match(componentMermaid, /Container_Boundary\(b1, "API Backend Service"\)/m, 'Must define boundary');
    assert.match(componentMermaid, /Component\(comp_orderController/m, 'Must include orderController component');
  });

  test('diffs inferred architecture against target specification', async () => {
    const graph = new ASTImportGraph(FIXTURES_DIR);
    await graph.build();

    const c4Gen = new C4ArchitectureGenerator(FIXTURES_DIR, graph);
    const inferred = await c4Gen.inferArchitecture();

    // Target does NOT have redis or stripe, and expects a missing message broker
    const targetSpec = {
      containers: [
        { id: 'api_service', name: 'API Backend Service' },
        { id: 'database', name: 'Database' },
        { id: 'event_bus', name: 'Apache Kafka Event Bus', technology: 'Kafka' }
      ],
      relationships: [
        { from: 'api_service', to: 'database' }
      ]
    };

    const diff = c4Gen.diffWithTarget(inferred, targetSpec);

    assert.strictEqual(diff.match, false, 'Should detect divergence from target');
    assert.ok(diff.addedContainers.some(c => c.id === 'cache_queue'), 'Should flag undeclared redis container');
    assert.ok(diff.addedContainers.some(c => c.id === 'stripe'), 'Should flag undeclared stripe container');
    assert.ok(diff.missingContainers.some(c => c.id === 'event_bus'), 'Should flag missing kafka event bus');
    assert.ok(diff.unauthorizedConnections.length > 0, 'Should flag connections not in target');
    assert.ok(diff.healthScore < 100, 'Health score should reflect architectural drift');
  });
});
