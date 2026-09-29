import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PassThrough } from 'stream';
import http from 'http';
import { MCPServer } from '../lib/harness/mcp/MCPServer.js';
import { StdioTransport } from '../lib/harness/mcp/StdioTransport.js';
import { SSETransport } from '../lib/harness/mcp/SSETransport.js';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdAddFeature } from '../lib/handlers/backlog.js';
import { createSkyhookContext } from '../lib/context.js';

test('MCPServer Core - Handshake, Tools, Resources, Prompts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Initialize workspace with sample data
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'MCP Test Project' });
    const ctx = createSkyhookContext(tmpDir);
    const addRes = await cmdAddFeature(ctx, {
      title: 'Harness Support',
      stories: [
        { title: 'Offline MCP Connection', storyPoints: 5, acceptanceCriteria: ['Responds to tools/list'] }
      ]
    });
    const storyId = addRes.storyIds[0];
    const { cmdUpdateStatus } = await import('../lib/handlers/backlog.js');
    await cmdUpdateStatus(ctx, { storyId, status: 'ready' });

    const server = new MCPServer({ projectDir: tmpDir, context: ctx });

    // 2. Handshake: initialize
    const initRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', clientInfo: { name: 'Cursor', version: '0.40.0' } }
    });
    assert.strictEqual(initRes.jsonrpc, '2.0');
    assert.strictEqual(initRes.id, 1);
    assert.strictEqual(initRes.result.protocolVersion, '2024-11-05');
    assert.strictEqual(initRes.result.serverInfo.name, 'skyhook-mcp');
    assert.ok(initRes.result.capabilities.tools);

    // 3. Ping
    const pingRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'ping'
    });
    assert.strictEqual(pingRes.id, 2);
    assert.deepStrictEqual(pingRes.result, {});

    // 4. Tools list
    const toolsRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list'
    });
    assert.strictEqual(toolsRes.id, 3);
    const toolNames = toolsRes.result.tools.map(t => t.name);
    assert.ok(toolNames.includes('skyhook_get_context'));
    assert.ok(toolNames.includes('skyhook_get_next_task'));
    assert.ok(toolNames.includes('skyhook_update_status'));
    assert.ok(toolNames.includes('skyhook_verify_policies'));
    assert.ok(toolNames.includes('skyhook_check_drift'));
    assert.ok(toolNames.includes('skyhook_release_lease'));
    assert.ok(toolNames.includes('skyhook_record_decision'));
    assert.ok(toolNames.includes('skyhook_trace_requirement'));

    // 5. Tool call: skyhook_get_context
    const ctxCallRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'skyhook_get_context',
        arguments: {}
      }
    });
    assert.strictEqual(ctxCallRes.id, 4);
    assert.ok(!ctxCallRes.error);
    const textOutput = ctxCallRes.result.content[0].text;
    assert.ok(textOutput.includes('MCP Test Project'));

    // 6. Tool call: skyhook_get_next_task
    const taskCallRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'skyhook_get_next_task',
        arguments: { agentId: 'test-agent' }
      }
    });
    assert.strictEqual(taskCallRes.id, 5);
    assert.ok(taskCallRes.result.content[0].text.includes('Offline MCP Connection'));

    // 7. Resources list
    const resList = await server.handleRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/list'
    });
    assert.strictEqual(resList.id, 6);
    const uris = resList.result.resources.map(r => r.uri);
    assert.ok(uris.includes('skyhook://backlog'));
    assert.ok(uris.includes('skyhook://plan'));
    assert.ok(uris.includes('skyhook://boundaries'));
    assert.ok(uris.includes('skyhook://decisions'));
    assert.ok(uris.includes('skyhook://tech-stack'));

    // 8. Resource read: skyhook://backlog
    const backlogRead = await server.handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'skyhook://backlog' }
    });
    assert.strictEqual(backlogRead.id, 7);
    assert.ok(backlogRead.result.contents[0].text.includes('Offline MCP Connection'));

    // 9. Prompts list & get
    const promptsList = await server.handleRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'prompts/list'
    });
    assert.strictEqual(promptsList.id, 8);
    assert.ok(promptsList.result.prompts.some(p => p.name === 'task_kickoff'));

    const promptGet = await server.handleRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'prompts/get',
      params: { name: 'task_kickoff', arguments: { storyId: 'STORY-001' } }
    });
    assert.strictEqual(promptGet.id, 9);
    assert.ok(promptGet.result.messages[0].content.text.includes('STORY-001'));

    // 10. Error handling: invalid method
    const invalidRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'unknown_method'
    });
    assert.strictEqual(invalidRes.error.code, -32601);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('StdioTransport - Communication and stdout isolation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-stdio-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Stdio Test' });
    const server = new MCPServer({ projectDir: tmpDir });

    const mockStdin = new PassThrough();
    const mockStdout = new PassThrough();
    const mockStderr = new PassThrough();

    const transport = new StdioTransport(server, {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr
    });

    transport.listen();

    const responses = [];
    mockStdout.on('data', chunk => {
      const lines = chunk.toString().trim().split('\n');
      for (const line of lines) {
        if (line) responses.push(JSON.parse(line));
      }
    });

    // Test sending ping
    mockStdin.write(JSON.stringify({ jsonrpc: '2.0', id: 101, method: 'ping' }) + '\n');

    await new Promise(r => setTimeout(r, 50));

    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].id, 101);

    // Verify console.log is diverted to stderr
    console.log('Testing stderr diversion');
    const stderrContent = mockStderr.read()?.toString() || '';
    assert.ok(stderrContent.includes('Testing stderr diversion'));

    transport.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SSETransport - Offline local loopback HTTP server', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sse-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'SSE Test' });
    const server = new MCPServer({ projectDir: tmpDir });

    // Use port 0 for automatic ephemeral port assignment
    const transport = new SSETransport(server, { port: 0, host: '127.0.0.1' });
    const { port, host } = await transport.start();
    assert.ok(port > 0);

    // 1. Initiate GET /sse to acquire a session
    const sseChunks = [];
    let sessionId = null;

    const sseReq = http.request({
      hostname: host,
      port,
      path: '/sse',
      method: 'GET'
    }, (res) => {
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'text/event-stream');

      res.on('data', chunk => {
        const text = chunk.toString();
        sseChunks.push(text);
        const match = text.match(/sessionId=([a-zA-Z0-9-]+)/);
        if (match) sessionId = match[1];
      });
    });

    sseReq.end();

    // Wait for SSE handshake event
    let waited = 0;
    while (!sessionId && waited < 50) {
      await new Promise(r => setTimeout(r, 20));
      waited++;
    }
    assert.ok(sessionId, 'Should have received sessionId from /sse endpoint event');

    // 2. Send POST /messages with JSON-RPC initialize
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    });

    const postReq = http.request({
      hostname: host,
      port,
      path: `/messages?sessionId=${sessionId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      assert.strictEqual(res.statusCode, 202);
    });

    postReq.write(postData);
    postReq.end();

    // Wait for SSE response event
    let hasMessage = false;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 20));
      if (sseChunks.some(c => c.includes('skyhook-mcp'))) {
        hasMessage = true;
        break;
      }
    }
    assert.ok(hasMessage, 'Response should have been sent over SSE channel');

    // 3. Clean teardown
    sseReq.destroy();
    await transport.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
