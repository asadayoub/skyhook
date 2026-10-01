/**
 * Backlog MCP Tools
 * Enables autonomous agents to inspect features, scaffold epics & stories,
 * analyze dependency blockers, and inspect agile velocity metrics.
 */

import path from 'path';
import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdListCurrentFeatures, cmdAddFeature, cmdGetBlockers, cmdBacklogEvents } from '../../../handlers/backlog.js';
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
}
