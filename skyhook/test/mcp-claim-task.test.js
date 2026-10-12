import test from 'node:test';
import assert from 'node:assert';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { MCPServer } from '../lib/harness/mcp/MCPServer.js';

function createMockContext(initialBacklog = {}, extras = {}) {
  const state = {
    backlog: {
      epics: initialBacklog.epics || [],
      stories: initialBacklog.stories || [],
      tasks: initialBacklog.tasks || []
    },
    decisions: {
      decisions: extras.decisions || []
    },
    requirements: {
      requirements: extras.requirements || []
    }
  };

  return {
    state,
    skyhookDir: null,
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; },
    readDecisions: () => state.decisions,
    readFunctionalReqs: () => state.requirements
  };
}

test('MCP Registry: skyhook_claim_task is registered with valid schema', () => {
  const registry = MCPToolRegistry.createDefault();
  const tool = registry.get('skyhook_claim_task');
  assert.ok(tool, 'skyhook_claim_task must be registered');

  const def = tool.toDefinition();
  assert.strictEqual(def.name, 'skyhook_claim_task');
  assert.ok(def.description.includes('Atomically claim'));
  assert.ok(def.inputSchema.properties.assignee);
  assert.ok(def.inputSchema.properties.taskId);
  assert.deepStrictEqual(def.inputSchema.required, ['assignee']);
});

test('MCP Execution: skyhook_claim_task claims task and returns context packet via tools/call', async () => {
  const registry = MCPToolRegistry.createDefault();
  const ctx = createMockContext({
    epics: [{ id: 'EPIC-1', title: 'Data Pipeline', goal: 'Reliable telemetry ingestion' }],
    stories: [{
      id: 'STORY-1',
      epicId: 'EPIC-1',
      title: 'Kafka Consumer',
      acceptanceCriteria: ['Process 10k msgs/sec'],
      relatedRequirements: ['REQ-PIPE-1']
    }],
    tasks: [{
      id: 'TASK-1',
      parentId: 'STORY-1',
      title: 'Implement Consumer Loop',
      status: 'ready',
      priority: 'high',
      targetFiles: ['src/pipeline/consumer.ts']
    }]
  }, {
    requirements: [{
      id: 'REQ-PIPE-1',
      title: 'Telemetry Throughput',
      description: 'Support high volume ingestion',
      acceptanceCriteria: ['Zero drop rate']
    }]
  });

  const res = await registry.execute('skyhook_claim_task', { assignee: 'mcp-agent-1', lease: 40 }, ctx);
  assert.strictEqual(res.isError, undefined);
  assert.ok(res.content && res.content[0] && res.content[0].text);

  const payload = JSON.parse(res.content[0].text);
  assert.strictEqual(payload.success, true);
  assert.strictEqual(payload.claimed, true);
  assert.strictEqual(payload.task.id, 'TASK-1');
  assert.strictEqual(payload.task.status, 'in-progress');
  assert.strictEqual(payload.task.lease.agentId, 'mcp-agent-1');
  assert.strictEqual(payload.task.lease.durationMinutes, 40);

  // Verify rich context
  assert.ok(payload.context.parentStory);
  assert.strictEqual(payload.context.parentStory.title, 'Kafka Consumer');
  assert.deepStrictEqual(payload.context.parentStory.acceptanceCriteria, ['Process 10k msgs/sec']);
  assert.ok(payload.context.parentEpic);
  assert.strictEqual(payload.context.parentEpic.title, 'Data Pipeline');
  assert.strictEqual(payload.context.requirements[0].id, 'REQ-PIPE-1');
});

test('MCP Execution: skyhook_get_next_task with claim: true delegates to claim workflow', async () => {
  const registry = MCPToolRegistry.createDefault();
  const ctx = createMockContext({
    tasks: [{
      id: 'TASK-CLAIM-FLAG',
      title: 'Setup Redis Cache',
      status: 'ready',
      priority: 'critical'
    }]
  });

  const res = await registry.execute('skyhook_get_next_task', { assignee: 'agent-compat', claim: true }, ctx);
  const payload = JSON.parse(res.content[0].text);

  assert.strictEqual(payload.success, true);
  assert.strictEqual(payload.claimed, true);
  assert.strictEqual(payload.task.id, 'TASK-CLAIM-FLAG');
  assert.strictEqual(payload.task.status, 'in-progress');
  assert.strictEqual(payload.task.lease.agentId, 'agent-compat');
});

test('MCPServer JSON-RPC 2.0 Integration: tools/list and tools/call for claim task', async () => {
  const server = new MCPServer();
  const ctx = createMockContext({
    tasks: [{ id: 'TASK-RPC-1', title: 'RPC Test Task', status: 'ready', priority: 'high' }]
  });
  server.context = ctx;

  // 1. Check tools/list contains skyhook_claim_task
  const listReq = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
  const listRes = await server.handleRequest(listReq);
  assert.strictEqual(listRes.id, 1);
  const tools = listRes.result.tools;
  const claimTool = tools.find(t => t.name === 'skyhook_claim_task');
  assert.ok(claimTool, 'skyhook_claim_task must be listed by MCPServer');

  // 2. Call tools/call with skyhook_claim_task
  const callReq = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'skyhook_claim_task',
      arguments: { assignee: 'agent-jsonrpc', taskId: 'TASK-RPC-1' }
    }
  };
  const callRes = await server.handleRequest(callReq);
  assert.strictEqual(callRes.id, 2);
  const result = callRes.result;
  assert.ok(result.content && result.content[0]);
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(parsed.task.id, 'TASK-RPC-1');
  assert.strictEqual(parsed.task.status, 'in-progress');
  assert.strictEqual(parsed.task.lease.agentId, 'agent-jsonrpc');
});

