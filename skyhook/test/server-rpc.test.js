import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WebSocket } from 'ws';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdAddFeature } from '../lib/handlers/backlog.js';
import { createSkyhookContext } from '../lib/context.js';
import { TaskLeaseManager } from '../lib/backlog/TaskLeaseManager.js';

test('Server RPC Actions: update-status, release-lease, adopt-drift, recompile-plan, open-editor', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-rpc-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Initialize workspace with an epic and story
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'RPC Test Workspace' });
    const ctx = createSkyhookContext(tmpDir);
    const addResult = await cmdAddFeature(ctx, {
      title: 'Action Pipeline',
      stories: [
        { title: 'Interactive Board', storyPoints: 8, acceptanceCriteria: ['Fast updates'] }
      ]
    });
    const storyId = addResult.storyIds[0];

    // Assign lease to agent
    const backlog = ctx.readBacklog();
    const story = backlog.stories.find(s => s.id === storyId);
    TaskLeaseManager.acquireLease(story, 'agent-007', 3600);
    ctx.writeBacklog(backlog);

    // 2. Start SkyhookServer
    const server = new SkyhookServer({ port: 31530, workspaceDir: tmpDir });
    const { port, url } = await server.start();

    // 3. Connect a WebSocket client to verify push broadcasts
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const receivedEvents = [];
    ws.on('message', (msg) => {
      try {
        receivedEvents.push(JSON.parse(msg.toString()));
      } catch {
        // ignore
      }
    });

    await new Promise((resolve) => ws.on('open', resolve));

    // Test 1: POST /api/action/release-lease
    const releaseRes = await fetch(`${url}/api/action/release-lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skyhookDir, storyId, force: true })
    });
    assert.strictEqual(releaseRes.status, 200);
    const releaseData = await releaseRes.json();
    assert.strictEqual(releaseData.success, true);
    assert.strictEqual(releaseData.storyId, storyId);

    // Verify lease released on disk
    const updatedBacklog = ctx.readBacklog();
    const updatedStory = updatedBacklog.stories.find(s => s.id === storyId);
    assert.strictEqual(updatedStory.lease, undefined);

    // Test 2: POST /api/action/update-status
    const updateRes = await fetch(`${url}/api/action/update-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skyhookDir,
        storyId,
        status: 'ready',
        metadata: { actor: 'dashboard-tester' }
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.success, true);
    assert.strictEqual(updateData.status, 'ready');

    // Test 3: POST /api/action/adopt-drift
    const adoptRes = await fetch(`${url}/api/action/adopt-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skyhookDir,
        technologies: [
          { name: 'Redis', category: 'cache', rationale: 'Adopted from dashboard' }
        ]
      })
    });
    assert.strictEqual(adoptRes.status, 200);
    const adoptData = await adoptRes.json();
    assert.strictEqual(adoptData.success, true);

    const techStack = ctx.readTechStack();
    const adopted = techStack.technologies.find(t => t.name === 'Redis');
    assert.ok(adopted);
    assert.strictEqual(adopted.category, 'cache');

    // Test 4: POST /api/action/recompile-plan
    const recompileRes = await fetch(`${url}/api/action/recompile-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skyhookDir })
    });
    assert.strictEqual(recompileRes.status, 200);
    const recompileData = await recompileRes.json();
    assert.strictEqual(recompileData.success, true);
    assert.ok(fs.existsSync(path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md')));

    // Test 5: POST /api/action/open-editor
    const openRes = await fetch(`${url}/api/action/open-editor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: path.join(skyhookDir, 'project.yaml'),
        line: 12,
        preference: 'vscode'
      })
    });
    assert.strictEqual(openRes.status, 200);
    const openData = await openRes.json();
    assert.strictEqual(openData.success, true);
    assert.ok(openData.url.startsWith('vscode://file/'));
    assert.strictEqual(openData.line, 12);

    // Allow time for WebSocket messages to arrive
    await new Promise((r) => setTimeout(r, 100));

    // Verify broadcast messages were sent over WebSocket
    const eventTypes = receivedEvents.map(e => e.type);
    assert.ok(eventTypes.includes('LEASE_RELEASED'));
    assert.ok(eventTypes.includes('STORY_TRANSITIONED'));
    assert.ok(eventTypes.includes('DRIFT_ADOPTED'));
    assert.ok(eventTypes.includes('PLAN_RECOMPILED'));

    ws.close();
    await server.stop();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
