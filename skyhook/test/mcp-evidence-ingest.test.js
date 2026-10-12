import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { SkyhookContext } from '../lib/context.js';
import { EventLedger } from '../lib/backlog/EventLedger.js';
import { normalizeEvidence } from '../lib/handlers/backlog.js';

test('normalizeEvidence correctly parses string JSON, flat flags, and objects', () => {
  // 1. JSON string
  const jsonStr = JSON.stringify({ commitHash: 'abc', automatedChecks: { exitCode: 0 } });
  const norm1 = normalizeEvidence({ evidence: jsonStr });
  assert.strictEqual(norm1.commitHash, 'abc');
  assert.strictEqual(norm1.automatedChecks.exitCode, 0);

  // 2. Flat CLI arguments
  const norm2 = normalizeEvidence({
    commit: 'c0ffee',
    test: 'npm test test/auth.test.js',
    'exit-code': 0,
    passedCount: 42,
    notes: 'verified on local node v24'
  });
  assert.strictEqual(norm2.commitHash, 'c0ffee');
  assert.strictEqual(norm2.automatedChecks.testCommand, 'npm test test/auth.test.js');
  assert.strictEqual(norm2.automatedChecks.exitCode, 0);
  assert.strictEqual(norm2.automatedChecks.passedCount, 42);
  assert.strictEqual(norm2.manualVerification.notes, 'verified on local node v24');

  // 3. Fallback when string is not JSON
  const norm3 = normalizeEvidence({ evidence: 'just some freeform notes' });
  assert.strictEqual(norm3.notes, 'just some freeform notes');
});

test('MCP Tool Registry: skyhook_update_task_status and skyhook_update_status expose rich evidence schemas', () => {
  const registry = MCPToolRegistry.createDefault();

  const taskTool = registry.get('skyhook_update_task_status');
  assert.ok(taskTool);
  const taskDef = taskTool.toDefinition();
  assert.ok(taskDef.inputSchema.properties.evidence);
  assert.ok(taskDef.inputSchema.properties.evidence.properties.automatedChecks);
  assert.ok(taskDef.inputSchema.properties.commitHash);
  assert.ok(taskDef.inputSchema.properties.testCommand);
  assert.ok(taskDef.inputSchema.properties.testExitCode);
  assert.ok(taskDef.inputSchema.properties.strictEvidence);

  const statusTool = registry.get('skyhook_update_status');
  assert.ok(statusTool);
  const statusDef = statusTool.toDefinition();
  assert.ok(statusDef.inputSchema.properties.evidence);
  assert.ok(statusDef.inputSchema.properties.commitHash);
  assert.ok(statusDef.inputSchema.properties.testExitCode);
});

test('MCP Ingestion: skyhook_update_task_status with nested evidence records in epics.yaml and events.jsonl', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-ingest-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  const ctx = new SkyhookContext(tmpDir);
  ctx.writeBacklog({
    schemaVersion: '1.0.0',
    epics: [{ id: 'EPIC-1', title: 'Infra' }],
    stories: [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'API', status: 'ready', acceptanceCriteria: ['REST'] }],
    tasks: [{ id: 'TASK-1', parentId: 'STORY-1', parentType: 'story', title: 'Controller', status: 'ready' }]
  });

  const registry = MCPToolRegistry.createDefault();

  try {
    // 1. ready -> in-progress
    await registry.execute('skyhook_update_task_status', {
      taskId: 'TASK-1',
      status: 'in-progress'
    }, ctx);

    // 2. in-progress -> implemented
    await registry.execute('skyhook_update_task_status', {
      taskId: 'TASK-1',
      status: 'implemented'
    }, ctx);

    // 3. implemented -> verified with nested evidence
    const nestedEvidence = {
      commitHash: '7a8b9c',
      changedFiles: ['lib/controller.js'],
      automatedChecks: {
        testCommand: 'node --test test/controller.test.js',
        exitCode: 0,
        passedCount: 6
      }
    };

    const res = await registry.execute('skyhook_update_task_status', {
      taskId: 'TASK-1',
      status: 'verified',
      evidence: nestedEvidence
    }, ctx);

    assert.strictEqual(res.isError, undefined);
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.success, true);
    assert.strictEqual(payload.status, 'verified');

    // Verify written to epics.yaml
    const backlog = ctx.readBacklog();
    const task = backlog.tasks.find(t => t.id === 'TASK-1');
    assert.strictEqual(task.status, 'verified');
    assert.strictEqual(task.verificationStatus, 'verified');
    assert.strictEqual(task.evidence.commitHash, '7a8b9c');
    assert.strictEqual(task.evidence.automatedChecks.exitCode, 0);

    // Verify written to events.jsonl
    const events = EventLedger.readEvents(skyhookDir);
    const evTypes = events.map(e => e.type);
    assert.ok(evTypes.includes('EVIDENCE_ATTACHED'));
    assert.ok(evTypes.includes('TASK_VERIFIED'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP Ingestion: flat parameters normalize and record evidence accurately', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-flat-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  const ctx = new SkyhookContext(tmpDir);
  ctx.writeBacklog({
    schemaVersion: '1.0.0',
    epics: [{ id: 'EPIC-1', title: 'Infra' }],
    stories: [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'API', status: 'ready', acceptanceCriteria: ['REST'] }],
    tasks: [{ id: 'TASK-1', parentId: 'STORY-1', parentType: 'story', title: 'Controller', status: 'ready' }]
  });

  const registry = MCPToolRegistry.createDefault();

  try {
    // ready -> in-progress -> implemented
    await registry.execute('skyhook_update_task_status', { taskId: 'TASK-1', status: 'in-progress' }, ctx);
    await registry.execute('skyhook_update_task_status', { taskId: 'TASK-1', status: 'implemented' }, ctx);

    // Call with flat arguments: commitHash, testCommand, testExitCode
    const res = await registry.execute('skyhook_update_task_status', {
      taskId: 'TASK-1',
      status: 'verified',
      commitHash: 'flat12345',
      testCommand: 'npm test',
      testExitCode: 0
    }, ctx);

    assert.strictEqual(res.isError, undefined);
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.success, true);
    assert.strictEqual(payload.status, 'verified');

    // Verify task normalized evidence
    const backlog = ctx.readBacklog();
    const task = backlog.tasks.find(t => t.id === 'TASK-1');
    assert.strictEqual(task.evidence.commitHash, 'flat12345');
    assert.strictEqual(task.evidence.automatedChecks.testCommand, 'npm test');
    assert.strictEqual(task.evidence.automatedChecks.exitCode, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP Ingestion: failing exit code rejects status update with actionable error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-fail-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  const ctx = new SkyhookContext(tmpDir);
  ctx.writeBacklog({
    schemaVersion: '1.0.0',
    epics: [{ id: 'EPIC-1', title: 'Infra' }],
    stories: [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'API', status: 'ready', acceptanceCriteria: ['REST'] }],
    tasks: [{ id: 'TASK-1', parentId: 'STORY-1', parentType: 'story', title: 'Controller', status: 'ready' }]
  });

  const registry = MCPToolRegistry.createDefault();

  try {
    await registry.execute('skyhook_update_task_status', { taskId: 'TASK-1', status: 'in-progress' }, ctx);
    await registry.execute('skyhook_update_task_status', { taskId: 'TASK-1', status: 'implemented' }, ctx);

    const res = await registry.execute('skyhook_update_task_status', {
      taskId: 'TASK-1',
      status: 'verified',
      testCommand: 'npm test',
      testExitCode: 1
    }, ctx);

    const payload = JSON.parse(res.content[0].text);
    assert.ok(payload.error);
    assert.ok(payload.error.includes('automated check failed with exit code 1'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
