import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';
import { cmdInit } from '../lib/handlers/general.js';

test('DashboardRPCHandler CRUD Operations - Epics, ADRs & Requirements', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-rpc-crud-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // Initialize project
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'CRUD Project' });

    // 1. Epic CRUD
    const createdEpicRes = await DashboardRPCHandler.createEpic(skyhookDir, {
      title: 'Payment Integration',
      goal: 'Enable Stripe and PayPal checkouts',
      priority: 'high'
    });
    assert.strictEqual(createdEpicRes.success, true);
    assert.ok(createdEpicRes.epic.id.startsWith('EPIC-'));
    assert.strictEqual(createdEpicRes.epic.title, 'Payment Integration');

    const epicId = createdEpicRes.epic.id;

    // Update Epic
    const updatedEpicRes = await DashboardRPCHandler.updateEpic(skyhookDir, epicId, {
      title: 'Global Payment Infrastructure',
      priority: 'critical'
    });
    assert.strictEqual(updatedEpicRes.success, true);
    assert.strictEqual(updatedEpicRes.epic.title, 'Global Payment Infrastructure');
    assert.strictEqual(updatedEpicRes.epic.priority, 'critical');

    // Delete Epic
    const deleteEpicRes = await DashboardRPCHandler.deleteEpic(skyhookDir, epicId);
    assert.strictEqual(deleteEpicRes.success, true);
    assert.strictEqual(deleteEpicRes.epicId, epicId);

    // Delete non-existent Epic should throw
    await assert.rejects(async () => {
      await DashboardRPCHandler.deleteEpic(skyhookDir, 'EPIC-NON-EXISTENT');
    }, /not found/i);

    // 2. ADR CRUD
    const createdADRRes = DashboardRPCHandler.createADR(skyhookDir, {
      title: 'Use PostgreSQL for Primary Data Store',
      status: 'accepted',
      category: 'Database',
      context: 'Relational integrity is required for transactions.',
      decision: 'Adopt PostgreSQL with Prisma ORM.',
      consequences: {
        positive: ['Strong ACID guarantees', 'Prisma type safety'],
        negative: ['Requires migration management']
      },
      relatedRequirements: ['REQ-DATA-001']
    });
    assert.strictEqual(createdADRRes.success, true);
    assert.ok(createdADRRes.adr.id.startsWith('ADR-'));
    assert.ok(fs.existsSync(createdADRRes.filePath));

    const adrId = createdADRRes.adr.id;

    // Update ADR
    const updatedADRRes = DashboardRPCHandler.updateADR(skyhookDir, adrId, {
      title: 'Use Managed PostgreSQL on AWS Aurora',
      status: 'accepted'
    });
    assert.strictEqual(updatedADRRes.success, true);
    assert.strictEqual(updatedADRRes.adr.title, 'Use Managed PostgreSQL on AWS Aurora');

    // Delete ADR
    const deleteADRRes = DashboardRPCHandler.deleteADR(skyhookDir, adrId);
    assert.strictEqual(deleteADRRes.success, true);
    assert.strictEqual(deleteADRRes.adrId, adrId);
    assert.strictEqual(fs.existsSync(createdADRRes.filePath), false);

    // 3. Requirement CRUD (Functional, Non-Functional, Constraints)
    // Functional
    const createReqRes = DashboardRPCHandler.createRequirement(skyhookDir, 'functional', {
      statement: 'System must process refunds within 3 business days',
      priority: 'high'
    });
    assert.strictEqual(createReqRes.success, true);
    assert.ok(createReqRes.requirement.id.startsWith('REQ-'));
    const reqId = createReqRes.requirement.id;

    const updateReqRes = DashboardRPCHandler.updateRequirement(skyhookDir, 'functional', reqId, {
      statement: 'System must process refunds immediately via API'
    });
    assert.strictEqual(updateReqRes.success, true);
    assert.strictEqual(updateReqRes.requirement.statement, 'System must process refunds immediately via API');

    const deleteReqRes = DashboardRPCHandler.deleteRequirement(skyhookDir, 'functional', reqId);
    assert.strictEqual(deleteReqRes.success, true);
    assert.strictEqual(deleteReqRes.reqId, reqId);

    // Non-Functional
    const createNfrRes = DashboardRPCHandler.createRequirement(skyhookDir, 'nonFunctional', {
      statement: 'API p95 latency must be under 150ms'
    });
    assert.strictEqual(createNfrRes.success, true);
    assert.ok(createNfrRes.requirement.id.startsWith('NFR-'));

    // Constraints
    const createConRes = DashboardRPCHandler.createRequirement(skyhookDir, 'constraints', {
      statement: 'Node.js LTS runtime >= 20.x'
    });
    assert.strictEqual(createConRes.success, true);
    assert.ok(createConRes.requirement.id.startsWith('CON-'));

    // 4. Security & Path Traversal Guard
    assert.throws(() => {
      DashboardRPCHandler.getFileContent('../../../../../etc/passwd', [tmpDir]);
    }, /Access forbidden/i);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SkyhookServer HTTP Endpoints - Projects, Actions & Security Controls', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-server-test-'));
  await cmdInit({ skyhookDir: path.join(tmpDir, '.skyhook'), projectDir: tmpDir }, { name: 'Server Test Project' });

  // Create sample dummy file in project
  fs.writeFileSync(path.join(tmpDir, 'test-file.txt'), 'Skyhook Server Security Check');

  const server = new SkyhookServer({
    port: 39120,
    workspaceDir: tmpDir
  });

  await server.start();
  const baseUrl = `http://127.0.0.1:${server.currentPort}`;

  try {
    // 1. GET /api/projects
    const projRes = await fetch(`${baseUrl}/api/projects`);
    assert.strictEqual(projRes.status, 200);
    const projJson = await projRes.json();
    assert.ok(Array.isArray(projJson.projects));

    // 2. POST /api/projects/add (valid directory)
    const addRes = await fetch(`${baseUrl}/api/projects/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tmpDir })
    });
    assert.strictEqual(addRes.status, 200);
    const addJson = await addRes.json();
    assert.strictEqual(addJson.success, true);
    assert.ok(addJson.project);

    // 3. POST /api/projects/add (invalid directory)
    const invalidDir = path.join(tmpDir, 'does-not-exist');
    const invalidRes = await fetch(`${baseUrl}/api/projects/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: invalidDir })
    });
    assert.strictEqual(invalidRes.status, 400);

    // 4. GET /api/file (Valid path within workspace)
    const validFileRes = await fetch(`${baseUrl}/api/file?path=test-file.txt&projectDir=${encodeURIComponent(tmpDir)}`);
    assert.strictEqual(validFileRes.status, 200);
    const validFileJson = await validFileRes.json();
    assert.strictEqual(validFileJson.content, 'Skyhook Server Security Check');

    // 5. GET /api/file (Security Directory Traversal Guard)
    const traversalRes = await fetch(`${baseUrl}/api/file?path=../../../../../../etc/passwd&projectDir=${encodeURIComponent(tmpDir)}`);
    assert.strictEqual(traversalRes.status, 403);
    const traversalJson = await traversalRes.json();
    assert.ok(traversalJson.error.includes('Access forbidden'));

    // 6. POST /api/action/reindex-symbols
    const reindexRes = await fetch(`${baseUrl}/api/action/reindex-symbols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: tmpDir })
    });
    assert.strictEqual(reindexRes.status, 200);
    const reindexJson = await reindexRes.json();
    assert.strictEqual(reindexJson.success, true);

    // 7. POST /api/action/draft-adr-drift
    const draftAdrRes = await fetch(`${baseUrl}/api/action/draft-adr-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectDir: tmpDir,
        driftItem: {
          category: 'Technology',
          name: 'Redis',
          details: 'Discovered Redis client usage in codebase'
        }
      })
    });
    assert.strictEqual(draftAdrRes.status, 200);
    const draftAdrJson = await draftAdrRes.json();
    assert.ok(draftAdrJson.decisionId);
    assert.strictEqual(draftAdrJson.status, 'draft');

  } finally {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
