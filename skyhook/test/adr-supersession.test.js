import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRSupersessionEngine, ADR_STATUSES } from '../lib/adr/ADRSupersessionEngine.js';
import { readYaml, writeYaml } from '../lib/utils.js';

function setupMockSkyhookDecisions() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-adr-super-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  const recordsDir = path.join(decisionsDir, 'records');

  fs.mkdirSync(recordsDir, { recursive: true });

  const initialIndex = {
    schemaVersion: '1.0.0',
    decisions: [
      {
        id: 'ADR-001',
        title: 'REST Architecture',
        status: 'accepted',
        category: 'api',
        createdAt: '2026-09-01'
      },
      {
        id: 'ADR-002',
        title: 'GraphQL Gateway',
        status: 'draft',
        category: 'api',
        createdAt: '2026-09-15'
      }
    ]
  };

  writeYaml(path.join(decisionsDir, 'index.yaml'), initialIndex);

  const adr1 = `# Decision: REST Architecture

**ID**: ADR-001
**Status**: accepted
**Category**: api

## Context
Initial REST architecture context.

## Decision
Adopt standard REST conventions.
`;

  const adr2 = `# Decision: GraphQL Gateway

**ID**: ADR-002
**Status**: draft
**Category**: api

## Context
High client roundtrips.

## Decision
Migrate to unified GraphQL gateway.
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-001.md'), adr1, 'utf-8');
  fs.writeFileSync(path.join(recordsDir, 'ADR-002.md'), adr2, 'utf-8');

  return { tmpDir, skyhookDir, decisionsDir, recordsDir };
}

test('ADRSupersessionEngine validates state transitions', () => {
  const { tmpDir, skyhookDir } = setupMockSkyhookDecisions();

  try {
    const engine = new ADRSupersessionEngine(skyhookDir);

    // draft -> under-review
    const res1 = engine.transitionStatus('ADR-002', 'under-review');
    assert.strictEqual(res1.newStatus, 'under-review');

    // under-review -> accepted
    const res2 = engine.transitionStatus('ADR-002', 'accepted');
    assert.strictEqual(res2.newStatus, 'accepted');

    // illegal transition: accepted -> draft (without force)
    assert.throws(() => {
      engine.transitionStatus('ADR-002', 'draft');
    }, /Illegal ADR status transition/);

    // with force: accepted -> draft
    const res3 = engine.transitionStatus('ADR-002', 'draft', { force: true });
    assert.strictEqual(res3.newStatus, 'draft');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRSupersessionEngine executes supersession cascade with warning banner and index update', () => {
  const { tmpDir, skyhookDir, recordsDir, decisionsDir } = setupMockSkyhookDecisions();

  try {
    const engine = new ADRSupersessionEngine(skyhookDir);

    // First transition ADR-002 to accepted
    engine.transitionStatus('ADR-002', 'accepted');

    // Supersede ADR-001 with ADR-002
    const result = engine.supersede('ADR-001', 'ADR-002');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.oldId, 'ADR-001');
    assert.strictEqual(result.newId, 'ADR-002');

    // Verify index.yaml updates
    const index = readYaml(path.join(decisionsDir, 'index.yaml'));
    const oldEntry = index.decisions.find(d => d.id === 'ADR-001');
    const newEntry = index.decisions.find(d => d.id === 'ADR-002');

    assert.strictEqual(oldEntry.status, 'superseded');
    assert.strictEqual(oldEntry.supersededBy, 'ADR-002');
    assert.strictEqual(newEntry.supersedes, 'ADR-001');

    // Verify markdown files
    const oldContent = fs.readFileSync(path.join(recordsDir, 'ADR-001.md'), 'utf-8');
    const newContent = fs.readFileSync(path.join(recordsDir, 'ADR-002.md'), 'utf-8');

    // Old file has warning banner and superseded status
    assert.match(oldContent, /> \[!WARNING\]/);
    assert.match(oldContent, /SUPERSEDED on/);
    assert.match(oldContent, /\*\*Status\*\*:\s*superseded/);
    assert.match(oldContent, /\*\*Superseded By\*\*:\s*\[GraphQL Gateway\]\(ADR-002\.md\)/);

    // New file has supersedes reference
    assert.match(newContent, /\*\*Supersedes\*\*:\s*\[REST Architecture\]\(ADR-001\.md\)/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRSupersessionEngine generates Mermaid Decision Lineage DAG', () => {
  const { tmpDir, skyhookDir } = setupMockSkyhookDecisions();

  try {
    const engine = new ADRSupersessionEngine(skyhookDir);
    engine.transitionStatus('ADR-002', 'accepted');
    engine.supersede('ADR-001', 'ADR-002');

    const dag = engine.generateMermaidDAG();

    assert.ok(dag.startsWith('flowchart LR'));
    assert.match(dag, /node_ADR_001\["REST Architecture<br\/><b>\[SUPERSEDED\]<\/b>"\]/);
    assert.match(dag, /node_ADR_002\["GraphQL Gateway<br\/><b>\[ACCEPTED\]<\/b>"\]/);
    assert.match(dag, /node_ADR_001 ==>\|"Superseded By"\| node_ADR_002/);
    assert.match(dag, /class node_ADR_001 superseded;/);
    assert.match(dag, /class node_ADR_002 accepted;/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
