import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdAddFeature } from '../lib/handlers/backlog.js';
import { createSkyhookContext } from '../lib/context.js';

test('Dashboard API: serves projects, project state, and secure files', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-dash-api-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  let server;
  try {
    // Initialize mock workspace
    await cmdInit({ skyhookDir }, { name: 'Dashboard Test Workspace' });
    const ctx = createSkyhookContext(tmpDir);
    await cmdAddFeature(ctx, {
      title: 'Realtime Radar',
      stories: [
        { title: 'WebSocket Stream', storyPoints: 5, acceptanceCriteria: ['Streams <5ms'] }
      ]
    });

    server = new SkyhookServer({ port: 31520, workspaceDir: tmpDir });
    const { port, url } = await server.start();

    // 1. GET /api/projects
    const projRes = await fetch(`${url}/api/projects`);
    assert.strictEqual(projRes.status, 200);
    const projData = await projRes.json();
    assert.ok(Array.isArray(projData.projects));
    const workspaceProj = projData.projects.find(p => p.isCurrentWorkspace);
    assert.ok(workspaceProj);
    assert.strictEqual(workspaceProj.name, 'Dashboard Test Workspace');

    // 2. GET /api/project
    const dataRes = await fetch(`${url}/api/project?id=${workspaceProj.id}`);
    assert.strictEqual(dataRes.status, 200);
    const data = await dataRes.json();
    assert.strictEqual(data.project.name, 'Dashboard Test Workspace');
    assert.strictEqual(data.backlog.epics.length, 1);
    assert.strictEqual(data.backlog.stories.length, 1);
    assert.ok(data.capacity);
    assert.strictEqual(data.capacity.remainingPoints, 5);

    // 3. GET /api/file (valid path)
    const validFilePath = path.join(skyhookDir, 'project.yaml');
    const fileRes = await fetch(`${url}/api/file?path=${encodeURIComponent(validFilePath)}`);
    assert.strictEqual(fileRes.status, 200);
    const fileData = await fileRes.json();
    assert.strictEqual(fileData.isDirectory, false);
    assert.ok(fileData.content.includes('Dashboard Test Workspace'));
    assert.ok(fileData.totalLines > 0);

    // 4. GET /api/file (directory traversal attack protection)
    const forbiddenPath = path.resolve(tmpDir, '..', '..', '..', 'etc', 'passwd');
    const attackRes = await fetch(`${url}/api/file?path=${encodeURIComponent(forbiddenPath)}`);
    assert.strictEqual(attackRes.status, 500); // Throws access forbidden
    const attackData = await attackRes.json();
    assert.ok(attackData.error.includes('Access forbidden'));

    // 5. Static Asset Serving (SPA HTML, CSS, JS)
    const indexRes = await fetch(`${url}/`);
    assert.strictEqual(indexRes.status, 200);
    assert.ok(indexRes.headers.get('content-type').includes('text/html'));
    const indexText = await indexRes.text();
    assert.ok(indexText.includes('SKYHOOK // ARCHITECTURE RADAR'));

    const cssRes = await fetch(`${url}/cyber.css`);
    assert.strictEqual(cssRes.status, 200);
    assert.ok(cssRes.headers.get('content-type').includes('text/css'));
    const cssText = await cssRes.text();
    assert.ok(cssText.includes('--neon-cyan'));

    const jsRes = await fetch(`${url}/app.js`);
    assert.strictEqual(jsRes.status, 200);
    assert.ok(jsRes.headers.get('content-type').includes('application/javascript'));
    const jsText = await jsRes.text();
    assert.ok(jsText.includes('initWebSocket'));

    await server.stop();
  } finally {
    if (server) {
      try { await server.stop(); } catch (_) {}
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
