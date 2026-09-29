import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';
import { writeYaml } from '../lib/utils.js';

function setupMockWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-server-adr-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  const recordsDir = path.join(decisionsDir, 'records');

  fs.mkdirSync(recordsDir, { recursive: true });

  const projectYaml = {
    id: 'test-project',
    name: 'Test Project',
    profile: 'web-app'
  };
  writeYaml(path.join(skyhookDir, 'project.yaml'), projectYaml);

  const initialIndex = {
    schemaVersion: '1.0.0',
    decisions: [
      {
        id: 'ADR-001',
        title: 'Legacy Monolith',
        status: 'accepted',
        category: 'architecture'
      },
      {
        id: 'ADR-002',
        title: 'Event-Driven Services',
        status: 'draft',
        category: 'architecture'
      }
    ]
  };
  writeYaml(path.join(decisionsDir, 'index.yaml'), initialIndex);

  const adr1 = `# Decision: Legacy Monolith

**ID**: ADR-001
**Status**: accepted
**Category**: architecture

## Context
Monolith architecture context.

## Decision
Keep monolith setup.
`;

  const adr2 = `# Decision: Event-Driven Services

**ID**: ADR-002
**Status**: draft
**Category**: architecture

## Context
Decouple services.

## Decision
Adopt Kafka event streams.
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-001.md'), adr1, 'utf-8');
  fs.writeFileSync(path.join(recordsDir, 'ADR-002.md'), adr2, 'utf-8');

  return { tmpDir, skyhookDir, decisionsDir, recordsDir };
}

function makeRequest(port, pathname, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resData) });
        } catch {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('SkyhookServer ADR REST API endpoints operate cleanly', async () => {
  const { tmpDir, skyhookDir } = setupMockWorkspace();
  const server = new SkyhookServer({ workspaceDir: tmpDir, port: 34150 });

  try {
    const { port } = await server.start();

    // 1. GET /api/adr/dag
    const dagRes = await makeRequest(port, '/api/adr/dag');
    assert.strictEqual(dagRes.status, 200);
    assert.strictEqual(dagRes.data.success, true);
    assert.ok(dagRes.data.mermaid.includes('flowchart LR'));
    assert.ok(dagRes.data.mermaid.includes('node_ADR_001'));

    // 2. GET /api/adr/diff?id=ADR-002
    const diffRes = await makeRequest(port, '/api/adr/diff?id=ADR-002');
    assert.strictEqual(diffRes.status, 200);
    assert.strictEqual(diffRes.data.success, true);
    assert.ok(diffRes.data.mermaid.includes('flowchart LR'));
    assert.ok(diffRes.data.mermaid.includes('SubgraphBefore'));
    assert.ok(diffRes.data.mermaid.includes('SubgraphAfter'));

    // 3. POST /api/action/transition-adr
    const transRes = await makeRequest(port, '/api/action/transition-adr', 'POST', {
      decisionId: 'ADR-002',
      targetStatus: 'under-review'
    });
    assert.strictEqual(transRes.status, 200);
    assert.strictEqual(transRes.data.newStatus, 'under-review');

    // 4. Accept ADR-002 and supersede ADR-001
    await makeRequest(port, '/api/action/transition-adr', 'POST', {
      decisionId: 'ADR-002',
      targetStatus: 'accepted'
    });

    const superRes = await makeRequest(port, '/api/action/supersede-adr', 'POST', {
      oldId: 'ADR-001',
      newId: 'ADR-002'
    });
    assert.strictEqual(superRes.status, 200);
    assert.strictEqual(superRes.data.success, true);
    assert.strictEqual(superRes.data.oldId, 'ADR-001');
    assert.strictEqual(superRes.data.newId, 'ADR-002');

    // 5. POST /api/action/compile-policies
    const compRes = await makeRequest(port, '/api/action/compile-policies', 'POST', {});
    assert.strictEqual(compRes.status, 200);
    assert.strictEqual(compRes.data.success, true);
    assert.ok(compRes.data.boundariesPath);

    // 6. POST /api/action/intercept-adr
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'zustand': '^4.5.0' }
    }), 'utf-8');

    const interceptRes = await makeRequest(port, '/api/action/intercept-adr', 'POST', {});
    assert.strictEqual(interceptRes.status, 200);
    assert.strictEqual(interceptRes.data.success, true);
    assert.strictEqual(interceptRes.data.count, 1);
    assert.ok(interceptRes.data.drafts[0].title.includes('Zustand'));
  } finally {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
