import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { WebSocket } from 'ws';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';
import { cmdInit } from '../lib/handlers/general.js';

test('Dashboard Harness API - detect, status, inject, remove & WebSocket push', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-dash-harness-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Dashboard Harness Test' });

    // Start Skyhook server
    const server = new SkyhookServer({ port: 31630, workspaceDir: tmpDir });
    const { port } = await server.start();

    // Connect WebSocket
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const receivedEvents = [];
    ws.on('message', (data) => {
      try {
        receivedEvents.push(JSON.parse(data.toString()));
      } catch (_) {}
    });

    await new Promise(r => setTimeout(r, 80));

    // 1. GET /api/harness/detect
    const detectData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/harness/detect`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    assert.strictEqual(detectData.totalRegistered, 7);

    // 2. GET /api/harness/status
    const statusData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/harness/status`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    assert.strictEqual(statusData.injectedCount, 0);

    // 3. POST /api/action/inject-harness for Cursor
    const injectData = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ targets: ['cursor'] });
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/action/inject-harness',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.strictEqual(injectData.success, true);
    assert.strictEqual(injectData.injected.length, 1);

    await new Promise(r => setTimeout(r, 60));
    assert.ok(receivedEvents.some(e => e.type === 'HARNESS_INJECTED'), 'Should broadcast HARNESS_INJECTED event');

    // 4. POST /api/action/remove-harness
    const removeData = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ targets: ['cursor'] });
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/action/remove-harness',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.strictEqual(removeData.success, true);

    await new Promise(r => setTimeout(r, 60));
    assert.ok(receivedEvents.some(e => e.type === 'HARNESS_REMOVED'), 'Should broadcast HARNESS_REMOVED event');

    // Teardown
    ws.close();
    await server.stop();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
