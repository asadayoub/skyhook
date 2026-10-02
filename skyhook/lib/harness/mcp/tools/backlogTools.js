/**
 * Backlog MCP Tools
 * Enables autonomous agents to inspect features, scaffold epics & stories,
 * analyze dependency blockers, and inspect agile velocity metrics.
 */

import path from 'path';
import { BaseMCPTool } from '../BaseMCPTool.js';
import {
  cmdListCurrentFeatures,
  cmdAddFeature,
  cmdGetBlockers,
  cmdBacklogEvents,
  cmdAddTask,
  cmdListTasks,
  cmdGetTask,
  cmdUpdateTaskStatus,
  cmdAddSubtask,
  cmdToggleSubtask,
  cmdTaskHeartbeat
} from '../../../handlers/backlog.js';
import { DashboardRPCHandler } from '../../../server/DashboardRPCHandler.js';

export function registerBacklogTools(registry) {
  // 1. skyhook_list_features
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_list_features',
        'List all project features (epics) and their associated user stories, statuses, priority levels, and active leases.',
        {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['all', 'backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked'],
              default: 'all',
              description: 'Filter stories by status'
            }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdListCurrentFeatures(ctx, { status: args.status || 'all' });
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_add_feature
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_add_feature',
        'Add a new high-level feature (epic) to the project backlog with optional initial user stories.',
        {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the feature/epic' },
            description: { type: 'string', description: 'Detailed description of feature goals and user value' },
            goal: { type: 'string', description: 'Core outcome or milestone' },
            stories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  userStory: { type: 'string' },
                  acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], default: 'medium' }
                },
                required: ['title']
              }
            }
          },
          required: ['title']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdAddFeature(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 3. skyhook_create_story
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_create_story',
        'Create a new user story under an existing epic, specifying acceptance criteria, priority, governing standards, and dependencies.',
        {
          type: 'object',
          properties: {
            epicId: { type: 'string', description: 'The parent epic ID (e.g. EPIC-001 or ULID)' },
            title: { type: 'string', description: 'Title of the story' },
            description: { type: 'string', description: 'Detailed description or user story statement' },
            userStory: { type: 'string', description: 'As a [role], I want [goal], so that [benefit]' },
            acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'List of verifiable acceptance criteria' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
            storyPoints: { type: 'number', default: 1 },
            standards: { type: 'array', items: { type: 'string' }, description: 'Standard IDs or tags governing this story' },
            dependsOn: { type: 'array', items: { type: 'string' }, description: 'Story IDs that must be completed first' }
          },
          required: ['epicId', 'title']
        }
      );
    }
    async execute(args, ctx) {
      const skyhookDir = ctx?.skyhookDir || path.join(process.cwd(), '.skyhook');
      const storyData = {
        epicId: args.epicId,
        title: args.title,
        description: args.description || args.userStory || '',
        acceptanceCriteria: args.acceptanceCriteria || [],
        priority: args.priority || 'medium',
        storyPoints: args.storyPoints !== undefined ? Number(args.storyPoints) : 1,
        standards: args.standards || [],
        dependsOn: args.dependsOn || []
      };
      const res = await DashboardRPCHandler.createStory(skyhookDir, storyData);
      return this.formatSuccess(res);
    }
  }());

  // 4. skyhook_get_blockers
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_blockers',
        'Retrieve all stories currently blocked from execution, including unmet dependencies and blocker reasons.',
        {
          type: 'object',
          properties: {}
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdGetBlockers(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 5. skyhook_get_backlog_metrics
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_backlog_metrics',
        'Inspect agile cycle time, lead time, throughput metrics, and recent backlog event history from the append-only event ledger.',
        {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum events to inspect', default: 50 }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdBacklogEvents(ctx, { limit: args.limit || 50 });
      return this.formatSuccess(res);
    }
  }());

  // 6. skyhook_create_task
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_create_task',
        'Create a new fine-grained task under an existing story or epic with optional subtasks, target files, and dependencies.',
        {
          type: 'object',
          properties: {
            parentId: { type: 'string', description: 'Parent story ID (e.g. STORY-001) or epic ID (e.g. EPIC-001)' },
            storyId: { type: 'string', description: 'Alias for parentId when attaching to a story' },
            epicId: { type: 'string', description: 'Alias for parentId when attaching to an epic' },
            parentType: { type: 'string', enum: ['story', 'epic'], description: 'Type of parent work item' },
            title: { type: 'string', description: 'Title of the task' },
            description: { type: 'string', description: 'Detailed instructions and scope' },
            type: { type: 'string', enum: ['feature', 'bug', 'chore', 'spike', 'test', 'refactor'], default: 'feature', description: 'Task archetype' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
            storyPoints: { type: 'number', description: 'Estimated complexity points' },
            estimatedMinutes: { type: 'number', description: 'Estimated execution time in minutes' },
            targetFiles: { type: 'array', items: { type: 'string' }, description: 'Target source files to protect against multi-agent edit collisions' },
            standards: { type: 'array', items: { type: 'string' }, description: 'Applicable standard IDs' },
            dependsOn: { type: 'array', items: { type: 'string' }, description: 'Task or Story IDs that must complete first' },
            subtasks: { type: 'array', items: { type: 'string' }, description: 'List of checklist subtask titles' }
          },
          required: ['title']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdAddTask(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 7. skyhook_list_tasks
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_list_tasks',
        'List all fine-grained tasks in the backlog with optional filtering by parent story/epic, status, or type.',
        {
          type: 'object',
          properties: {
            parentId: { type: 'string', description: 'Filter tasks under a specific story or epic' },
            status: { type: 'string', enum: ['all', 'backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked'], default: 'all' },
            type: { type: 'string', enum: ['feature', 'bug', 'chore', 'spike', 'test', 'refactor'], description: 'Filter by task type' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdListTasks(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 8. skyhook_get_task
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_task',
        'Retrieve detailed information for a specific task including subtasks, lease status, and target files.',
        {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID (e.g. TASK-001)' }
          },
          required: ['taskId']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdGetTask(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 9. skyhook_update_task_status
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_update_task_status',
        'Transition a task status through the Agile state machine with automatic parent story rollup.',
        {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'The task ID' },
            status: {
              type: 'string',
              enum: ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'],
              description: 'Target status'
            },
            reason: { type: 'string', description: 'Reason for status update or blocker description' },
            agentId: { type: 'string', description: 'Agent ID performing the update' },
            force: { type: 'boolean', description: 'Force override state machine constraints' }
          },
          required: ['taskId', 'status']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdUpdateTaskStatus(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 10. skyhook_create_subtask
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_create_subtask',
        'Add a checklist subtask under a specific task.',
        {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Parent task ID (e.g. TASK-001)' },
            title: { type: 'string', description: 'Subtask title or action item' }
          },
          required: ['taskId', 'title']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdAddSubtask(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 11. skyhook_update_subtask
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_update_subtask',
        'Toggle or update the completion status of a checklist subtask.',
        {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Parent task ID' },
            subtaskId: { type: 'string', description: 'Subtask ID (e.g. SUB-001)' },
            completed: { type: 'boolean', description: 'True if completed, false if pending. Toggles if omitted.' }
          },
          required: ['taskId', 'subtaskId']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdToggleSubtask(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 12. skyhook_heartbeat_lease
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_heartbeat_lease',
        'Extend an active task or story lease to prevent lease expiration during long-running agent execution.',
        {
          type: 'object',
          properties: {
            itemId: { type: 'string', description: 'Story ID or Task ID' },
            agentId: { type: 'string', description: 'Agent ID holding the lease' },
            extendMinutes: { type: 'number', default: 30, description: 'Number of minutes to extend the lease from now' }
          },
          required: ['itemId', 'agentId']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdTaskHeartbeat(ctx, args);
      return this.formatSuccess(res);
    }
  }());
}
