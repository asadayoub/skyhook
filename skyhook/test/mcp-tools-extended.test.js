import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MCPServer } from '../lib/harness/mcp/MCPServer.js';
import { cmdInit } from '../lib/handlers/general.js';
import { cmdAddFeature } from '../lib/handlers/backlog.js';
import { createSkyhookContext, SkyhookContext } from '../lib/context.js';

test('MCP Server Extended - Complete Tools & Resources Verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-ext-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Initialize project
    const ctx = new SkyhookContext(tmpDir);
    await cmdInit(ctx, { name: 'MCP Extended Test' });

    // 2. Add sample feature with a story and code file implementing it
    const addRes = await cmdAddFeature(ctx, {
      title: 'Billing Module',
      stories: [
        { title: 'Stripe Webhook', storyPoints: 5, acceptanceCriteria: ['Accepts POST requests'] }
      ]
    });
    const storyId = addRes.storyIds[0];

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'webhook.js'), `
// @skyhook-implements REQ-BILL-01
export function handleWebhook(event) {
  return true;
}
`);

    const server = new MCPServer({ projectDir: tmpDir, context: ctx });

    // 3. Test Tool: skyhook_update_status to 'ready'
    const readyRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'skyhook_update_status',
        arguments: { storyId, status: 'ready' }
      }
    });
    assert.strictEqual(readyRes.id, 1);
    assert.ok(!readyRes.error);
    assert.ok(readyRes.result.content[0].text.includes('ready'));

    // 4. Test Tool: skyhook_get_next_task with agentId leasing
    const taskRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'skyhook_get_next_task',
        arguments: { agentId: 'mcp-agent' }
      }
    });
    assert.strictEqual(taskRes.id, 2);
    assert.ok(!taskRes.error);
    assert.ok(taskRes.result.content[0].text.includes('Stripe Webhook'));

    // 5. Test Tool: skyhook_release_lease
    const releaseRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'skyhook_release_lease',
        arguments: { storyId, agentId: 'mcp-agent' }
      }
    });
    assert.strictEqual(releaseRes.id, 3);
    assert.ok(!releaseRes.error);
    assert.ok(releaseRes.result.content[0].text.includes('released'));

    // 6. Test Tool: skyhook_record_decision
    const decideRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'skyhook_record_decision',
        arguments: {
          title: 'Use Stripe For Payments',
          decision: 'We will integrate Stripe Elements and Checkout.',
          context: 'Need reliable PCI-compliant billing.'
        }
      }
    });
    assert.strictEqual(decideRes.id, 4);
    assert.ok(!decideRes.error);
    assert.ok(decideRes.result.content[0].text.includes('Decision recorded'));

    // 7. Test Tool: skyhook_verify_policies
    const verifyRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'skyhook_verify_policies',
        arguments: {}
      }
    });
    assert.strictEqual(verifyRes.id, 5);
    assert.ok(!verifyRes.error);

    // 8. Test Tool: skyhook_check_drift
    const driftRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'skyhook_check_drift',
        arguments: {}
      }
    });
    assert.strictEqual(driftRes.id, 6);
    assert.ok(!driftRes.error);
    assert.ok(driftRes.result.content[0].text.includes('healthScore') || driftRes.result.content[0].text.includes('status'));

    // 9. Test Tool: skyhook_trace_requirement
    const traceRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'skyhook_trace_requirement',
        arguments: { id: 'REQ-BILL-01' }
      }
    });
    assert.strictEqual(traceRes.id, 7);
    assert.ok(!traceRes.error);
    assert.ok(traceRes.result.content[0].text.includes('REQ-BILL-01'));

    // 10. Read Resource: skyhook://plan
    const planRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'resources/read',
      params: { uri: 'skyhook://plan' }
    });
    assert.strictEqual(planRes.id, 8);
    assert.ok(planRes.result.contents[0].text);

    // 11. Read Resource: skyhook://boundaries
    const boundRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'resources/read',
      params: { uri: 'skyhook://boundaries' }
    });
    assert.strictEqual(boundRes.id, 9);
    assert.ok(boundRes.result.contents[0].text);

    // 12. Read Resource: skyhook://decisions
    const decRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'resources/read',
      params: { uri: 'skyhook://decisions' }
    });
    assert.strictEqual(decRes.id, 10);
    assert.ok(decRes.result.contents[0].text.includes('Use Stripe For Payments'));

    // 13. Read Resource: skyhook://tech-stack
    const techRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'resources/read',
      params: { uri: 'skyhook://tech-stack' }
    });
    assert.strictEqual(techRes.id, 11);
    assert.ok(techRes.result.contents[0].text);

    // 14. Error handling: Unknown resource URI
    const unknownRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'resources/read',
      params: { uri: 'skyhook://unknown-resource' }
    });
    assert.strictEqual(unknownRes.id, 12);
    assert.ok(unknownRes.error);
    assert.strictEqual(unknownRes.error.code, -32603);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
