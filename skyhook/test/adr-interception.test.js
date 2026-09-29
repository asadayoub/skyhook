import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRInterceptionDaemon, KNOWN_ARCHITECTURAL_PACKAGES } from '../lib/adr/ADRInterceptionDaemon.js';
import { readYaml } from '../lib/utils.js';

function setupMockWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-interception-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  const recordsDir = path.join(decisionsDir, 'records');

  fs.mkdirSync(recordsDir, { recursive: true });

  const initialIndex = {
    schemaVersion: '1.0.0',
    decisions: []
  };
  fs.writeFileSync(path.join(decisionsDir, 'index.yaml'), JSON.stringify(initialIndex), 'utf-8');

  return { tmpDir, skyhookDir, decisionsDir, recordsDir };
}

test('ADRInterceptionDaemon detects architectural package additions', () => {
  const { tmpDir, skyhookDir } = setupMockWorkspace();

  try {
    const daemon = new ADRInterceptionDaemon(skyhookDir, tmpDir);

    const cached = {
      'lodash': '^4.17.21'
    };

    const current = {
      'lodash': '^4.17.21',
      'prisma': '^5.10.0',
      'fastify': '^4.26.0',
      'random-util': '1.0.0'
    };

    const detected = daemon.detectArchitecturalPackageChanges(current, cached);
    assert.strictEqual(detected.length, 2);
    assert.ok(detected.some(d => d.package === 'prisma'));
    assert.ok(detected.some(d => d.package === 'fastify'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRInterceptionDaemon synthesizes draft ADR for detected package installation', () => {
  const { tmpDir, skyhookDir, recordsDir, decisionsDir } = setupMockWorkspace();

  try {
    const daemon = new ADRInterceptionDaemon(skyhookDir, tmpDir);

    const result = daemon.synthesizeDraftADR({
      type: 'package_added',
      package: 'prisma',
      version: '^5.10.0',
      meta: KNOWN_ARCHITECTURAL_PACKAGES['prisma']
    });

    assert.strictEqual(result.intercepted, true);
    assert.strictEqual(result.eventType, 'package_added');
    assert.strictEqual(result.draftId, 'ADR-001');

    // Verify markdown record exists
    const recordFile = path.join(recordsDir, 'ADR-001.md');
    assert.ok(fs.existsSync(recordFile));

    const content = fs.readFileSync(recordFile, 'utf-8');
    assert.ok(content.includes('# Decision: Adoption of Prisma ORM'));
    assert.ok(content.includes('**Status**: draft'));
    assert.ok(content.includes('**Author**: Proactive Interceptor (Skyhook)'));
    assert.ok(content.includes('## Architecture Mutation (Before vs After)'));

    // Verify index.yaml entry
    const index = readYaml(path.join(decisionsDir, 'index.yaml'));
    assert.strictEqual(index.decisions.length, 1);
    assert.strictEqual(index.decisions[0].id, 'ADR-001');
    assert.strictEqual(index.decisions[0].status, 'draft');
    assert.strictEqual(index.decisions[0].autoSynthesized, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRInterceptionDaemon scan detects package and migration additions end-to-end', () => {
  const { tmpDir, skyhookDir, decisionsDir, recordsDir } = setupMockWorkspace();

  try {
    // 1. Initial workspace with package.json
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: {
        'fastify': '^4.26.0'
      }
    }), 'utf-8');

    // 2. Initial migration dir with a file
    const prismaDir = path.join(tmpDir, 'prisma', 'migrations');
    fs.mkdirSync(prismaDir, { recursive: true });
    fs.writeFileSync(path.join(prismaDir, '20260901_init.sql'), '-- init', 'utf-8');

    const daemon = new ADRInterceptionDaemon(skyhookDir, tmpDir);

    // Initial scan populates snapshot and creates initial draft ADRs
    const firstScan = daemon.scan();
    assert.strictEqual(firstScan.length, 2); // 1 package, 1 migration

    // Second scan with no changes returns empty array
    const secondScan = daemon.scan();
    assert.strictEqual(secondScan.length, 0);

    // Add new migration
    fs.writeFileSync(path.join(prismaDir, '20260929_add_users.sql'), '-- add users', 'utf-8');

    const thirdScan = daemon.scan();
    assert.strictEqual(thirdScan.length, 1);
    assert.strictEqual(thirdScan[0].eventType, 'migration_added');
    assert.ok(thirdScan[0].title.includes('20260929_add_users.sql'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
