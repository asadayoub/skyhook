import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';
import { TaskLeaseManager } from '../lib/backlog/TaskLeaseManager.js';
import { DependencyResolver } from '../lib/backlog/DependencyResolver.js';
import { BacklogStateMachine } from '../lib/backlog/BacklogStateMachine.js';
import { SkyhookContext } from '../lib/context.js';
import * as backlogHandlers from '../lib/handlers/backlog.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { registerCoreTools } from '../lib/harness/mcp/tools/coreTools.js';
import { registerBacklogTools } from '../lib/harness/mcp/tools/backlogTools.js';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-task-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'standards'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'plan'), { recursive: true });

  const initialBacklog = {
    epics: [
      { id: 'EPIC-001', title: 'Authentication Overhaul', status: 'ready', childStories: ['STORY-001'] }
    ],
    stories: [
      {
        id: 'STORY-001',
        epicId: 'EPIC-001',
        title: 'OAuth2 Authentication',
        status: 'ready',
        priority: 'high',
        storyPoints: 5,
        targetFiles: ['lib/auth/oauth.js'],
        childTasks: []
      }
    ],
    tasks: []
  };

  fs.writeFileSync(path.join(skyhookDir, 'backlog', 'epics.yaml'), JSON.stringify(initialBacklog, null, 2), 'utf8');
  fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), 'name: Test Project\nid: test-proj\nprofile: web-app\n', 'utf8');

  return { tmpDir, skyhookDir };
}

test('EventLedger defines all required task & subtask event types', () => {
  assert.ok(EVENT_TYPES.TASK_CREATED);
  assert.ok(EVENT_TYPES.TASK_UPDATED);
  assert.ok(EVENT_TYPES.TASK_STATE_TRANSITIONED);
  assert.ok(EVENT_TYPES.TASK_LEASED);
  assert.ok(EVENT_TYPES.TASK_RELEASED);
  assert.ok(EVENT_TYPES.TASK_COMPLETED);
  assert.ok(EVENT_TYPES.SUBTASK_CREATED);
  assert.ok(EVENT_TYPES.SUBTASK_TOGGLED);
});

test('TaskLeaseManager: Two-Tier Locking allows concurrent sibling tasks but locks story exclusively', () => {
  const backlog = {
    epics: [{ id: 'EPIC-1' }],
    stories: [
      { id: 'STORY-1', status: 'ready', childTasks: ['TASK-1', 'TASK-2'] }
    ],
    tasks: [
      { id: 'TASK-1', parentId: 'STORY-1', parentType: 'story', status: 'ready', targetFiles: ['lib/auth.js'] },
      { id: 'TASK-2', parentId: 'STORY-1', parentType: 'story', status: 'ready', targetFiles: ['lib/user.js'] }
    ]
  };

  // Agent Alpha leases TASK-1
  const lease1 = TaskLeaseManager.acquireTaskLease(backlog.tasks[0], 'agent-alpha', 30, backlog);
  assert.ok(lease1);
  assert.strictEqual(backlog.tasks[0].lease.agentId, 'agent-alpha');

  // Agent Beta leases TASK-2 concurrently (sibling task under same story) - MUST SUCCEED!
  const lease2 = TaskLeaseManager.acquireTaskLease(backlog.tasks[1], 'agent-beta', 30, backlog);
  assert.ok(lease2);
  assert.strictEqual(backlog.tasks[1].lease.agentId, 'agent-beta');

  // Agent Gamma attempts exclusive lease on parent STORY-1 - MUST FAIL because child tasks are actively leased
  assert.throws(() => {
    TaskLeaseManager.acquireLease(backlog.stories[0], 'agent-gamma', 30, backlog);
  }, /Cannot acquire exclusive lease on story 'STORY-1'/);

  // Heartbeat lease on TASK-1 extends expiration
  const heartbeat = TaskLeaseManager.heartbeatLease(backlog.tasks[0], 'agent-alpha', 45);
  assert.strictEqual(heartbeat.durationMinutes, 45);

  // Release lease on TASK-1
  TaskLeaseManager.releaseLease(backlog.tasks[0], 'agent-alpha');
  assert.strictEqual(backlog.tasks[0].lease, undefined);
});

test('TaskLeaseManager: checkFileConflicts detects targetFiles overlap between concurrent active leases', () => {
  const backlog = {
    stories: [],
    tasks: [
      {
        id: 'TASK-1',
        title: 'Auth Refactor',
        targetFiles: ['lib/auth.js', 'lib/token.js'],
        lease: {
          agentId: 'codex-agent-1',
          expiresAt: new Date(Date.now() + 60000).toISOString()
        }
      },
      {
        id: 'TASK-2',
        title: 'OAuth Tokens',
        targetFiles: ['lib/token.js', 'lib/storage.js']
      }
    ]
  };

  const warnings = TaskLeaseManager.checkFileConflicts(backlog.tasks[1], backlog);
  assert.strictEqual(warnings.length, 1);
  assert.ok(warnings[0].message.includes('codex-agent-1'));
  assert.ok(warnings[0].conflictingFiles.includes('lib/token.js'));
});

test('BacklogStateMachine: Hierarchical bottom-up rollups and DoD validation', () => {
  const backlog = {
    epics: [
      { id: 'EPIC-1', status: 'ready', childStories: ['STORY-1'] }
    ],
    stories: [
      { id: 'STORY-1', epicId: 'EPIC-1', status: 'ready', childTasks: ['TASK-1'] }
    ],
    tasks: [
      {
        id: 'TASK-1',
        parentId: 'STORY-1',
        parentType: 'story',
        status: 'ready',
        subtasks: [
          { id: 'SUB-1', title: 'Write tests', completed: false }
        ]
      }
    ]
  };

  // 1. Task moving to in-progress auto-advances parent story from ready to in-progress
  const r1 = BacklogStateMachine.transition(backlog, 'TASK-1', 'in-progress');
  assert.strictEqual(r1.success, true);
  assert.strictEqual(backlog.tasks[0].status, 'in-progress');
  assert.strictEqual(backlog.stories[0].status, 'in-progress');

  // 2. Transitioning TASK-1 to done fails without completed subtasks (DoD constraint)
  assert.throws(() => {
    BacklogStateMachine.transition(backlog, 'TASK-1', 'done');
  }, /uncompleted subtask/);

  // 3. Complete subtask and retry -> auto-advances parent story to in-review
  backlog.tasks[0].subtasks[0].completed = true;
  const r2 = BacklogStateMachine.transition(backlog, 'TASK-1', 'done');
  assert.strictEqual(r2.success, true);
  assert.strictEqual(backlog.stories[0].status, 'in-review');

  // 4. Complete STORY-1 -> auto-completes parent epic to done
  const r3 = BacklogStateMachine.transition(backlog, 'STORY-1', 'done');
  assert.strictEqual(r3.success, true);
  assert.strictEqual(r3.epicCompleted, true);
  assert.strictEqual(backlog.epics[0].status, 'done');
});

test('ProjectContext: addTask, addSubtask, toggleSubtask, and addStory operations', () => {
  const { tmpDir, skyhookDir } = createTempProject();
  const ctx = new SkyhookContext(tmpDir);

  // 1. Add Story
  const story = ctx.addStory({
    title: 'User Profile Settings',
    epicId: 'EPIC-001',
    storyPoints: 3
  });
  assert.ok(story.id);
  assert.strictEqual(story.title, 'User Profile Settings');

  // 2. Add Task under Story
  const task1 = ctx.addTask({
    parentId: story.id,
    title: 'Avatar Upload API',
    type: 'feature',
    targetFiles: ['lib/avatar.js'],
    subtasks: ['Validate file size', 'Resize image']
  });
  assert.ok(task1.id.startsWith('TASK-'));
  assert.strictEqual(task1.parentId, story.id);
  assert.strictEqual(task1.subtasks.length, 2);

  // 3. Add Subtask
  const sub3 = ctx.addSubtask(task1.id, 'Upload to S3 storage');
  assert.strictEqual(sub3.title, 'Upload to S3 storage');
  assert.strictEqual(sub3.completed, false);

  // 4. Toggle Subtask
  const toggled = ctx.toggleSubtask(task1.id, sub3.id, true);
  assert.strictEqual(toggled.completed, true);

  // Verify backlog was persisted accurately
  const readBacklog = ctx.readBacklog();
  const foundTask = readBacklog.tasks.find(t => t.id === task1.id);
  assert.ok(foundTask);
  assert.strictEqual(foundTask.subtasks.length, 3);
  assert.strictEqual(foundTask.subtasks[2].completed, true);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Backlog Handlers: cmdGetNextTask, cmdAddTask, and cmdTaskHeartbeat', async () => {
  const { tmpDir, skyhookDir } = createTempProject();
  const ctx = new SkyhookContext(tmpDir);

  // Add a task
  const addRes = await backlogHandlers.cmdAddTask(ctx, {
    parentId: 'STORY-001',
    title: 'JWT Token Validation Endpoint',
    type: 'feature',
    priority: 'critical'
  });
  assert.strictEqual(addRes.success, true);
  const taskId = addRes.task.id;

  // cmdGetNextTask with level: 'task' and leasing
  const nextRes = await backlogHandlers.cmdGetNextTask(ctx, {
    agent: 'codex-worker-99',
    level: 'task'
  });
  assert.ok(nextRes.task);
  assert.strictEqual(nextRes.task.id, taskId);
  assert.strictEqual(nextRes.task.lease.agentId, 'codex-worker-99');

  // Heartbeat lease
  const hbRes = await backlogHandlers.cmdTaskHeartbeat(ctx, {
    itemId: taskId,
    agent: 'codex-worker-99',
    extendMinutes: 45
  });
  assert.strictEqual(hbRes.success, true);
  assert.strictEqual(hbRes.lease.durationMinutes, 45);

  // List tasks
  const listRes = await backlogHandlers.cmdListTasks(ctx, { parentId: 'STORY-001' });
  assert.strictEqual(listRes.tasks.length, 1);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('MCP Tools Registry: registers and executes task MCP tools', async () => {
  const { tmpDir, skyhookDir } = createTempProject();
  const ctx = new SkyhookContext(tmpDir);
  const registry = new MCPToolRegistry();

  registerCoreTools(registry);
  registerBacklogTools(registry);

  // Verify all new tools are registered
  assert.ok(registry.getTool('skyhook_create_task'));
  assert.ok(registry.getTool('skyhook_list_tasks'));
  assert.ok(registry.getTool('skyhook_get_task'));
  assert.ok(registry.getTool('skyhook_update_task_status'));
  assert.ok(registry.getTool('skyhook_create_subtask'));
  assert.ok(registry.getTool('skyhook_update_subtask'));
  assert.ok(registry.getTool('skyhook_heartbeat_lease'));

  // 1. Execute skyhook_create_task
  const createTool = registry.getTool('skyhook_create_task');
  const createResult = await createTool.execute({
    parentId: 'STORY-001',
    title: 'Configure CORS Policy',
    type: 'chore',
    priority: 'high'
  }, ctx);
  assert.ok(!createResult.isError);
  const payload = JSON.parse(createResult.content[0].text);
  assert.ok(payload.task.id);
  const taskId = payload.task.id;

  // 2. Execute skyhook_get_next_task with level: task
  const nextTool = registry.getTool('skyhook_get_next_task');
  const nextResult = await nextTool.execute({
    assignee: 'agent-mcp-test',
    level: 'task'
  }, ctx);
  assert.ok(!nextResult.isError);
  const nextPayload = JSON.parse(nextResult.content[0].text);
  assert.strictEqual(nextPayload.task.id, taskId);
  assert.strictEqual(nextPayload.task.lease.agentId, 'agent-mcp-test');

  // 3. Execute skyhook_create_subtask
  const subTool = registry.getTool('skyhook_create_subtask');
  const subResult = await subTool.execute({
    taskId,
    title: 'Allow localhost in development'
  }, ctx);
  assert.ok(!subResult.isError);

  // 4. Execute skyhook_update_task_status
  const updateTool = registry.getTool('skyhook_update_task_status');
  const updateResult = await updateTool.execute({
    taskId,
    status: 'in-progress',
    agentId: 'agent-mcp-test'
  }, ctx);
  assert.ok(!updateResult.isError);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('DashboardRPCHandler: supports full Task & Subtask CRUD operations', async () => {
  const { tmpDir, skyhookDir } = createTempProject();

  // 1. Create Task
  const createRes = await DashboardRPCHandler.createTask(skyhookDir, {
    parentId: 'STORY-001',
    title: 'Audit Logging Middleware',
    type: 'feature',
    priority: 'medium'
  });
  assert.strictEqual(createRes.success, true);
  const taskId = createRes.task.id;

  // 2. Update Task
  const updateRes = await DashboardRPCHandler.updateTask(skyhookDir, taskId, {
    priority: 'high',
    estimatedMinutes: 90
  });
  assert.strictEqual(updateRes.success, true);
  assert.strictEqual(updateRes.task.priority, 'high');
  assert.strictEqual(updateRes.task.estimatedMinutes, 90);

  // 3. Create and Toggle Subtask
  const subRes = await DashboardRPCHandler.createSubtask(skyhookDir, taskId, 'Sanitize request headers');
  assert.strictEqual(subRes.success, true);
  const toggleRes = await DashboardRPCHandler.toggleSubtask(skyhookDir, taskId, subRes.subtask.id, true);
  assert.strictEqual(toggleRes.success, true);
  assert.strictEqual(toggleRes.subtask.completed, true);

  // 4. Delete Task
  const delRes = await DashboardRPCHandler.deleteTask(skyhookDir, taskId);
  assert.strictEqual(delRes.success, true);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
