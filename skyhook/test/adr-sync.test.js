import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRSyncEngine } from '../lib/adr/ADRSyncEngine.js';
import { cmdSyncADR } from '../lib/handlers/adr.js';
import { readYaml, writeYaml } from '../lib/utils.js';

function setupMockSkyhookDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sync-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  const recordsDir = path.join(decisionsDir, 'records');

  fs.mkdirSync(recordsDir, { recursive: true });

  const initialIndex = {
    schemaVersion: '1.0.0',
    decisions: [
      {
        id: 'ADR-001',
        title: 'Initial Architecture',
        status: 'proposed',
        category: 'architecture',
        createdAt: '2026-09-08'
      }
    ]
  };

  writeYaml(path.join(decisionsDir, 'index.yaml'), initialIndex);

  // Write initial ADR markdown
  const adrMd = `# Decision: Initial Architecture

**ID**: ADR-001
**Status**: proposed
**Category**: architecture

## Context
Initial setup context.

## Decision
Initial decision.
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-001.md'), adrMd, 'utf-8');

  return { tmpDir, skyhookDir, recordsDir, decisionsDir };
}

test('ADRSyncEngine propagates markdown status edit to index.yaml', () => {
  const { tmpDir, skyhookDir, recordsDir, decisionsDir } = setupMockSkyhookDir();

  try {
    const engine = new ADRSyncEngine(skyhookDir);

    // 1. Manually edit markdown on disk to change status to 'accepted'
    const mdPath = path.join(recordsDir, 'ADR-001.md');
    let content = fs.readFileSync(mdPath, 'utf-8');
    content = content.replace('**Status**: proposed', '**Status**: accepted');
    fs.writeFileSync(mdPath, content, 'utf-8');

    // 2. Run sync
    const result = engine.sync({ skyhookDir });

    assert.strictEqual(result.updatedFromMarkdown, 1);

    // 3. Verify index.yaml has updated status
    const updatedIndex = readYaml(path.join(decisionsDir, 'index.yaml'));
    assert.strictEqual(updatedIndex.decisions[0].status, 'accepted');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRSyncEngine indexes newly added markdown file on disk', () => {
  const { tmpDir, skyhookDir, recordsDir, decisionsDir } = setupMockSkyhookDir();

  try {
    const engine = new ADRSyncEngine(skyhookDir);

    // Write a new ADR file directly into records/
    const newMd = `# Decision: Adopt TypeScript

**ID**: ADR-002
**Status**: accepted
**Category**: technology

## Context
Need type safety.

## Decision
Use TypeScript for everything.
`;
    fs.writeFileSync(path.join(recordsDir, 'ADR-002.md'), newMd, 'utf-8');

    // Run sync
    const result = engine.sync({ skyhookDir });

    assert.strictEqual(result.addedToIndex, 1);

    const updatedIndex = readYaml(path.join(decisionsDir, 'index.yaml'));
    assert.strictEqual(updatedIndex.decisions.length, 2);
    const found = updatedIndex.decisions.find(d => d.id === 'ADR-002');
    assert.ok(found);
    assert.strictEqual(found.title, 'Adopt TypeScript');
    assert.strictEqual(found.status, 'accepted');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRSyncEngine generates missing markdown file for index entry', () => {
  const { tmpDir, skyhookDir, recordsDir, decisionsDir } = setupMockSkyhookDir();

  try {
    const engine = new ADRSyncEngine(skyhookDir);

    // Add entry in index.yaml without creating the file
    const indexData = readYaml(path.join(decisionsDir, 'index.yaml'));
    indexData.decisions.push({
      id: 'ADR-003',
      title: 'Use Redis Caching',
      status: 'accepted',
      category: 'technology'
    });
    writeYaml(path.join(decisionsDir, 'index.yaml'), indexData);

    const mockCtx = {
      skyhookDir,
      readProjectYaml: () => ({ name: 'Test' }),
      readProfile: () => ({ id: 'web-app', name: 'Web' }),
      readTechStack: () => ({ technologies: [] })
    };

    const result = engine.sync(mockCtx);

    assert.strictEqual(result.createdMarkdown, 1);
    assert.ok(fs.existsSync(path.join(recordsDir, 'ADR-003.md')));
    const content = fs.readFileSync(path.join(recordsDir, 'ADR-003.md'), 'utf-8');
    assert.ok(content.includes('Use Redis Caching'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdSyncADR handler operates correctly on mock context', async () => {
  const { tmpDir, skyhookDir } = setupMockSkyhookDir();

  try {
    const mockCtx = {
      skyhookDir,
      readProjectYaml: () => ({ name: 'Test' }),
      readProfile: () => ({ id: 'web-app', name: 'Web' }),
      readTechStack: () => ({ technologies: [] })
    };

    const res = await cmdSyncADR(mockCtx);
    assert.ok(!res.error);
    assert.strictEqual(typeof res.totalDecisions, 'number');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
