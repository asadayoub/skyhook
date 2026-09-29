import test from 'node:test';
import assert from 'node:assert';
import { generateComparativeDiagram, inferArchitecturalDiff } from '../lib/adr/ADRComparativeDiagramGenerator.js';
import { generateADR } from '../lib/adr-generator.js';

test('inferArchitecturalDiff detects REST to GraphQL transition', () => {
  const diff = inferArchitecturalDiff({
    title: 'Migrate REST to GraphQL Gateway',
    decision: 'Replace legacy REST endpoints with unified GraphQL Gateway'
  });

  assert.strictEqual(diff.removed.includes('rest_api'), true);
  assert.strictEqual(diff.added.includes('new_gateway'), true);
  assert.strictEqual(diff.modified.includes('service'), true);
});

test('inferArchitecturalDiff respects explicit diff in decisionData', () => {
  const explicitDiff = {
    added: ['Kafka Broker'],
    removed: ['RabbitMQ Cluster'],
    modified: ['Order Service'],
    unchanged: ['PostgreSQL']
  };

  const diff = inferArchitecturalDiff({
    title: 'Switch Message Broker',
    diff: explicitDiff
  });

  assert.strictEqual(diff.added.length, 1);
  assert.strictEqual(diff.removed.length, 1);
  assert.strictEqual(diff.modified.length, 1);
  assert.strictEqual(diff.before.some(c => c.name === 'RabbitMQ Cluster' && c.status === 'removed'), true);
  assert.strictEqual(diff.after.some(c => c.name === 'Kafka Broker' && c.status === 'added'), true);
});

test('generateComparativeDiagram produces dual-subgraph Mermaid chart with diff classes', () => {
  const mermaid = generateComparativeDiagram({
    title: 'Adopt Prisma ORM with PostgreSQL',
    decision: 'Migrate SQLite direct queries to Prisma with Postgres'
  });

  assert.ok(mermaid.startsWith('```mermaid'));
  assert.ok(mermaid.includes('subgraph SubgraphBefore'));
  assert.ok(mermaid.includes('subgraph SubgraphAfter'));
  assert.ok(mermaid.includes('classDef diffRemoved'));
  assert.ok(mermaid.includes('classDef diffAdded'));
  assert.ok(mermaid.includes('classDef diffModified'));
  assert.ok(mermaid.includes('classDef diffUnchanged'));
  assert.ok(mermaid.endsWith('```'));
});

test('generateADR integrates Architecture Mutation section when comparativeDiagram requested', () => {
  const adr = generateADR({
    title: 'Adopt Clerk Authentication',
    decision: 'Replace stateful session cookies with Clerk Auth and JWT tokens',
    comparativeDiagram: true
  }, {
    projectType: 'Web App',
    profile: 'web-app',
    techStack: { technologies: [] }
  });

  assert.ok(adr.includes('## Architecture Mutation (Before vs After)'));
  assert.ok(adr.includes('subgraph SubgraphBefore'));
  assert.ok(adr.includes('subgraph SubgraphAfter'));
  assert.ok(adr.includes('classDef diffAdded'));
});
