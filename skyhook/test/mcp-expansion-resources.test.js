import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MCPServer } from '../lib/harness/mcp/MCPServer.js';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdAddFeature, cmdUpdateStatus } from '../lib/handlers/backlog.js';
import { createSkyhookContext } from '../lib/context.js';

test('MCP Expansion Resources - Streaming Read Access to Project Intelligence', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-resources-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Initialize workspace with sample data
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'MCP Resources Test', profile: 'web-app' });
    const ctx = createSkyhookContext(tmpDir);

    // Add a feature and a blocked story
    const featureRes = await cmdAddFeature(ctx, {
      title: 'Auth Feature',
      stories: [
        { title: 'Step 1: DB Schema', priority: 'high' }
      ]
    });
    const s1 = featureRes.storyIds[0];
    await cmdUpdateStatus(ctx, { storyId: s1, status: 'ready' });

    // Add a dependent story that is blocked
    const feature2Res = await cmdAddFeature(ctx, {
      title: 'API Feature',
      stories: [
        { title: 'Step 2: API Route', priority: 'medium', dependsOn: [s1] }
      ]
    });

    const server = new MCPServer({ projectDir: tmpDir, context: ctx });

    // 2. Test resources/list
    const listRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/list'
    });
    assert.strictEqual(listRes.jsonrpc, '2.0');
    assert.strictEqual(listRes.id, 1);
    const uris = listRes.result.resources.map(r => r.uri);

    assert.ok(uris.length >= 11, `Expected at least 11 resources, found ${uris.length}`);
    assert.ok(uris.includes('skyhook://backlog'));
    assert.ok(uris.includes('skyhook://plan'));
    assert.ok(uris.includes('skyhook://decisions'));
    assert.ok(uris.includes('skyhook://boundaries'));
    assert.ok(uris.includes('skyhook://tech-stack'));
    assert.ok(uris.includes('skyhook://standards'));
    assert.ok(uris.includes('skyhook://blockers'));
    assert.ok(uris.includes('skyhook://drift-scorecard'));
    assert.ok(uris.includes('skyhook://dark-matter'));
    assert.ok(uris.includes('skyhook://profile'));
    assert.ok(uris.includes('skyhook://trace-graph'));

    // Helper to read resource
    let reqId = 100;
    const readResource = async (uri) => {
      reqId++;
      const res = await server.handleRequest({
        jsonrpc: '2.0',
        id: reqId,
        method: 'resources/read',
        params: { uri }
      });
      assert.strictEqual(res.jsonrpc, '2.0');
      assert.strictEqual(res.id, reqId);
      assert.ok(res.result && res.result.contents && res.result.contents[0], `Expected contents for ${uri}`);
      return res.result.contents[0];
    };

    // 3. Read and verify skyhook://standards
    const stdRes = await readResource('skyhook://standards');
    assert.strictEqual(stdRes.mimeType, 'application/json');
    const stdData = JSON.parse(stdRes.text);
    assert.ok(stdData.count > 0);
    assert.ok(Array.isArray(stdData.standards));

    // 4. Read and verify skyhook://blockers
    const blockersRes = await readResource('skyhook://blockers');
    assert.strictEqual(blockersRes.mimeType, 'application/json');
    const blockersData = JSON.parse(blockersRes.text);
    assert.ok(Array.isArray(blockersData.blockers));

    // 5. Read and verify skyhook://profile
    const profileRes = await readResource('skyhook://profile');
    assert.strictEqual(profileRes.mimeType, 'application/json');
    const profileData = JSON.parse(profileRes.text);
    assert.ok(profileData.project);
    assert.ok(profileData.profile);

    // 6. Read and verify skyhook://drift-scorecard
    const driftRes = await readResource('skyhook://drift-scorecard');
    assert.strictEqual(driftRes.mimeType, 'application/json');
    const driftData = JSON.parse(driftRes.text);
    assert.ok(driftData.healthScore !== undefined || driftData.error);

    // 7. Read and verify skyhook://dark-matter
    const darkMatterRes = await readResource('skyhook://dark-matter');
    assert.strictEqual(darkMatterRes.mimeType, 'application/json');
    const dmData = JSON.parse(darkMatterRes.text);
    assert.ok(dmData.summary || dmData.error !== undefined);

    // 8. Read and verify skyhook://trace-graph
    const graphRes = await readResource('skyhook://trace-graph');
    assert.strictEqual(graphRes.mimeType, 'text/markdown');
    assert.ok(graphRes.text.includes('```mermaid') || graphRes.text.includes('Trace Graph'));

    // 9. Read and verify baseline resources
    const backlogRes = await readResource('skyhook://backlog');
    assert.strictEqual(backlogRes.mimeType, 'application/yaml');
    assert.ok(backlogRes.text.includes('schemaVersion'));

    const planRes = await readResource('skyhook://plan');
    assert.strictEqual(planRes.mimeType, 'text/markdown');

    const decisionsRes = await readResource('skyhook://decisions');
    assert.strictEqual(decisionsRes.mimeType, 'application/yaml');

    const techStackRes = await readResource('skyhook://tech-stack');
    assert.strictEqual(techStackRes.mimeType, 'application/yaml');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
