import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  cmdReviewADR,
  cmdSupersedeADR,
  cmdADRDAG,
  cmdCompilePolicies,
  cmdInterceptADR
} from '../lib/handlers/adr.js';
import { writeYaml, readYaml } from '../lib/utils.js';

function setupMockCLIEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-adr-cli-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  const recordsDir = path.join(decisionsDir, 'records');

  fs.mkdirSync(recordsDir, { recursive: true });

  const initialIndex = {
    schemaVersion: '1.0.0',
    decisions: [
      {
        id: 'ADR-001',
        title: 'Monolith DB Architecture',
        status: 'accepted',
        category: 'database'
      },
      {
        id: 'ADR-002',
        title: 'Microservices DB Separation',
        status: 'draft',
        category: 'database'
      }
    ]
  };

  writeYaml(path.join(decisionsDir, 'index.yaml'), initialIndex);

  const adr1 = `# Decision: Monolith DB Architecture

**ID**: ADR-001
**Status**: accepted
**Category**: database

## Context
Monolith db context.

## Decision
Keep all tables in one DB.
`;

  const adr2 = `# Decision: Microservices DB Separation

**ID**: ADR-002
**Status**: draft
**Category**: database

## Context
Microservices migration.

## Decision
Separate databases per service.
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-001.md'), adr1, 'utf-8');
  fs.writeFileSync(path.join(recordsDir, 'ADR-002.md'), adr2, 'utf-8');

  const ctx = {
    skyhookDir,
    projectDir: tmpDir,
    readDecisions: () => readYaml(path.join(decisionsDir, 'index.yaml'))
  };

  return { tmpDir, skyhookDir, decisionsDir, recordsDir, ctx };
}

test('cmdReviewADR transitions ADR to under-review', async () => {
  const { tmpDir, ctx } = setupMockCLIEnv();

  try {
    const res = await cmdReviewADR(ctx, { id: 'ADR-002' });
    assert.strictEqual(res.newStatus, 'under-review');
    assert.ok(res.message.includes('under-review'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdSupersedeADR supersedes old ADR with new ADR', async () => {
  const { tmpDir, ctx, recordsDir } = setupMockCLIEnv();

  try {
    // Transition ADR-002 to accepted first
    await cmdReviewADR(ctx, { id: 'ADR-002' });
    const { ADRSupersessionEngine } = await import('../lib/adr/ADRSupersessionEngine.js');
    const engine = new ADRSupersessionEngine(ctx.skyhookDir);
    engine.transitionStatus('ADR-002', 'accepted');

    const res = await cmdSupersedeADR(ctx, { oldId: 'ADR-001', newId: 'ADR-002' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.oldId, 'ADR-001');
    assert.strictEqual(res.newId, 'ADR-002');

    const oldContent = fs.readFileSync(path.join(recordsDir, 'ADR-001.md'), 'utf-8');
    assert.ok(oldContent.includes('SUPERSEDED on'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdADRDAG produces valid Mermaid diagram', async () => {
  const { tmpDir, ctx } = setupMockCLIEnv();

  try {
    const res = await cmdADRDAG(ctx, {});
    assert.ok(res.mermaid.startsWith('flowchart LR'));
    assert.ok(res.mermaid.includes('node_ADR_001'));
    assert.ok(res.mermaid.includes('node_ADR_002'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdCompilePolicies compiles active boundary rules', async () => {
  const { tmpDir, ctx } = setupMockCLIEnv();

  try {
    const res = await cmdCompilePolicies(ctx, {});
    assert.strictEqual(res.success, true);
    assert.ok(fs.existsSync(res.boundariesPath));
    assert.ok(fs.existsSync(res.eslintPath));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdInterceptADR scans and creates drafts for new packages', async () => {
  const { tmpDir, ctx } = setupMockCLIEnv();

  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: {
        'drizzle-orm': '^0.29.0'
      }
    }), 'utf-8');

    const res = await cmdInterceptADR(ctx, {});
    assert.strictEqual(res.count, 1);
    assert.strictEqual(res.drafts[0].intercepted, true);
    assert.ok(res.drafts[0].title.includes('Drizzle ORM'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
