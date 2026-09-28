import test from 'node:test';
import assert from 'node:assert';
import { WebSocket } from 'ws';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';

test('WebSocketGateway: establishes connection and receives broadcast events', async () => {
  const server = new SkyhookServer({ port: 31500 });
  const { port, url } = await server.start();
  assert.ok(port >= 31500);

  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const ws = new WebSocket(wsUrl);

  const messages = [];
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
    });
  });

  // 1. Initial connection envelope
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].type, 'CONNECTED');

  // 2. Broadcast event
  server.gateway.broadcast('STORY_TRANSITIONED', {
    storyId: 'STORY-TEST-1',
    status: 'in-progress'
  });

  // Allow brief tick for message transmission
  await new Promise(r => setTimeout(r, 50));

  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[1].type, 'STORY_TRANSITIONED');
  assert.strictEqual(messages[1].payload.storyId, 'STORY-TEST-1');
  assert.strictEqual(messages[1].payload.status, 'in-progress');

  // 3. Ping/pong message
  ws.send(JSON.stringify({ type: 'ping' }));
  await new Promise(r => setTimeout(r, 50));

  const pongMsg = messages.find(m => m.type === 'pong');
  assert.ok(pongMsg);

  // Clean shutdown
  ws.close();
  await server.stop();
});
