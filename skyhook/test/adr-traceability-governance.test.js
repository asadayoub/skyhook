import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseADRMarkdown } from '../lib/adr/ADRMarkdownParser.js';
import { SkyhookContext } from '../lib/context.js';
import { ADRSyncEngine } from '../lib/adr/ADRSyncEngine.js';
import { traceRequirement } from '../lib/tracer.js';
import { TraceabilityMatrix } from '../lib/plan/TraceabilityMatrix.js';
import { writeYaml } from '../lib/utils.js';

test('ADRMarkdownParser extracts requirement references across varied markdown formats', () => {
  const md = `# Decision: Authentication Architecture

**ID**: ADR-AUTH-001
**Status**: accepted
**Category**: security
**Date**: 2026-10-03

## Context
Deciding on security protocols.

## Decision
Adopt OAuth2 + JWT tokens.

## Related Requirements
- **REQ-AUTH-01**: User Login Flow (active)
- REQ-AUTH-02 - Session Management
- [REQ-AUTH-03](requirements/REQ-AUTH-03.md)
- **REQ-AUTH-04**
- Requirements: REQ-AUTH-05, REQ-AUTH-06

## Related Decisions
- **ADR-SEC-01**: Security Baseline
- ADR-SEC-02
`;

  const parsed = parseADRMarkdown(md);
  assert.ok(parsed, 'Markdown parsed successfully');
  assert.strictEqual(parsed.id, 'ADR-AUTH-001');

  // Verify all 6 requirements captured regardless of bullet syntax
  assert.ok(parsed.relatedRequirements.includes('REQ-AUTH-01'), 'Captured bold with colon');
  assert.ok(parsed.relatedRequirements.includes('REQ-AUTH-02'), 'Captured plain bullet');
  assert.ok(parsed.relatedRequirements.includes('REQ-AUTH-03'), 'Captured markdown link');
  assert.ok(parsed.relatedRequirements.includes('REQ-AUTH-04'), 'Captured bold without colon');
  assert.ok(parsed.relatedRequirements.includes('REQ-AUTH-05'), 'Captured token from list');
  assert.ok(parsed.relatedRequirements.includes('REQ-AUTH-06'), 'Captured second token from list');

  // Verify related decisions
  assert.ok(parsed.relatedDecisions.includes('ADR-SEC-01'));
  assert.ok(parsed.relatedDecisions.includes('ADR-SEC-02'));
});

test('SkyhookContext.writeDecision persists relatedRequirements into decisions/index.yaml', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-write-decision-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'decisions', 'records'), { recursive: true });

  const ctx = new SkyhookContext(skyhookDir);
  const id = ctx.writeDecision({
    id: 'ADR-STORE-001',
    title: 'Persistent Event Sourcing',
    decision: 'Use event store',
    context: 'Need high auditability',
    relatedRequirements: ['REQ-DATA-100', 'REQ-AUDIT-200'],
    relatedDecisions: ['ADR-CORE-001']
  });

  assert.strictEqual(id, 'ADR-STORE-001');

  const index = ctx.readDecisions();
  const entry = index.decisions.find(d => d.id === 'ADR-STORE-001');
  assert.ok(entry, 'Decision entry saved to index.yaml');
  assert.deepStrictEqual(entry.relatedRequirements, ['REQ-DATA-100', 'REQ-AUDIT-200'], 'relatedRequirements saved in index.yaml');
  assert.deepStrictEqual(entry.relatedDecisions, ['ADR-CORE-001'], 'relatedDecisions saved in index.yaml');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ADRSyncEngine bi-directionally syncs requirement references between markdown and index.yaml', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sync-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const recordsDir = path.join(skyhookDir, 'decisions', 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  // 1. Create a markdown record with requirement references written in it
  const mdContent = `# Decision: Rate Limiting Service

**ID**: ADR-RATE-001
**Status**: accepted
**Category**: architecture

## Context
High traffic DDoS prevention.

## Decision
Use Token Bucket via Redis.

## Related Requirements
- **REQ-RATE-01**: Rate limit per IP
- REQ-RATE-02
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-RATE-001.md'), mdContent, 'utf-8');

  // 2. Run sync on empty index
  const syncEngine = new ADRSyncEngine(skyhookDir);
  const syncResult = syncEngine.sync();

  assert.strictEqual(syncResult.addedToIndex, 1);

  const ctx = new SkyhookContext(skyhookDir);
  const index = ctx.readDecisions();
  const entry = index.decisions.find(d => d.id === 'ADR-RATE-001');

  assert.ok(entry, 'ADR added to index.yaml');
  assert.ok(entry.relatedRequirements.includes('REQ-RATE-01'), 'REQ-RATE-01 indexed from markdown');
  assert.ok(entry.relatedRequirements.includes('REQ-RATE-02'), 'REQ-RATE-02 indexed from markdown');

  // 3. Update markdown with an additional requirement
  const updatedMd = mdContent.replace('REQ-RATE-02', 'REQ-RATE-02\n- REQ-RATE-03');
  fs.writeFileSync(path.join(recordsDir, 'ADR-RATE-001.md'), updatedMd, 'utf-8');

  const updateResult = syncEngine.sync();
  assert.strictEqual(updateResult.updatedFromMarkdown, 1);

  const updatedIndex = ctx.readDecisions();
  const updatedEntry = updatedIndex.decisions.find(d => d.id === 'ADR-RATE-001');
  assert.ok(updatedEntry.relatedRequirements.includes('REQ-RATE-03'), 'REQ-RATE-03 updated in index.yaml');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('traceRequirement surfaces governing ADRs from index and auto-repairs missing index links from markdown', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-trace-adr-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions', 'records'), { recursive: true });

  // 1. Setup requirement
  writeYaml(path.join(skyhookDir, 'requirements', 'functional.yaml'), {
    requirements: [
      { id: 'REQ-SEC-001', title: 'Two-Factor Authentication', status: 'accepted', category: 'security' }
    ]
  });

  // 2. Setup story
  writeYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'), {
    epics: [{ id: 'EPIC-SEC', title: 'Security Hardening' }],
    stories: [
      { id: 'STORY-2FA-01', title: 'Implement TOTP QR Code', status: 'ready', relatedRequirements: ['REQ-SEC-001'] }
    ]
  });

  // 3. Setup decisions index where index.yaml has one decision
  writeYaml(path.join(skyhookDir, 'decisions', 'index.yaml'), {
    schemaVersion: '1.0.0',
    decisions: [
      {
        id: 'ADR-2FA-INDEX',
        title: 'Use TOTP Algorithms',
        status: 'accepted',
        category: 'security',
        relatedRequirements: ['REQ-SEC-001']
      },
      {
        id: 'ADR-2FA-UNINDEXED',
        title: 'Hardware Security Keys',
        status: 'accepted',
        category: 'security',
        relatedRequirements: [] // Notice: intentionally empty in index.yaml!
      }
    ]
  });

  // 4. Create markdown on disk for ADR-2FA-UNINDEXED with REQ-SEC-001 written inside the ADR
  const unindexedMd = `# Decision: Hardware Security Keys

**ID**: ADR-2FA-UNINDEXED
**Status**: accepted
**Category**: security

## Context
FIDO2 WebAuthn support.

## Decision
Support YubiKey and WebAuthn.

## Related Requirements
- **REQ-SEC-001**: Two-Factor Authentication
`;
  fs.writeFileSync(path.join(skyhookDir, 'decisions', 'records', 'ADR-2FA-UNINDEXED.md'), unindexedMd, 'utf-8');

  // 5. Run traceRequirement for REQ-SEC-001
  const trace = await traceRequirement(tmpDir, 'REQ-SEC-001');

  assert.ok(!trace.error, 'trace executed without error');
  assert.strictEqual(trace.requirementId, 'REQ-SEC-001');

  // Verify story surfaced
  assert.strictEqual(trace.stories.length, 1);
  assert.strictEqual(trace.stories[0].id, 'STORY-2FA-01');

  // Verify BOTH decisions surfaced:
  // 1. The one declared in index.yaml
  // 2. The one written in the ADR markdown on disk that was missing from index.yaml
  assert.strictEqual(trace.decisions.length, 2, 'Both governing ADRs surfaced');
  const decisionIds = trace.decisions.map(d => d.id);
  assert.ok(decisionIds.includes('ADR-2FA-INDEX'));
  assert.ok(decisionIds.includes('ADR-2FA-UNINDEXED'));

  // 6. Verify auto-repair of index.yaml occurred
  const ctx = new SkyhookContext(skyhookDir);
  const repairedIndex = ctx.readDecisions();
  const repairedEntry = repairedIndex.decisions.find(d => d.id === 'ADR-2FA-UNINDEXED');
  assert.ok(repairedEntry.relatedRequirements.includes('REQ-SEC-001'), 'Auto-repair updated index.yaml');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('TraceabilityMatrix includes ADRs linked via relatedRequirements', () => {
  const matrixMd = TraceabilityMatrix.generate({
    functionalReqs: {
      requirements: [{ id: 'REQ-101', title: 'Payment Processing', category: 'billing' }]
    },
    backlog: {
      stories: [{ id: 'STORY-PAY-1', status: 'done', relatedRequirements: ['REQ-101'] }]
    },
    decisions: {
      decisions: [{ id: 'ADR-STRIPE-01', relatedRequirements: ['REQ-101'] }]
    },
    symbols: []
  });

  assert.ok(matrixMd.includes('REQ-101'));
  assert.ok(matrixMd.includes('STORY-PAY-1 (done)'));
  assert.ok(matrixMd.includes('ADR-STRIPE-01'), 'Traceability matrix contains linked ADR');
});
