/**
 * MCPToolRegistry - Pluggable Registry for Skyhook MCP Tools
 * Implements MCP Tools specification (tools/list and tools/call).
 */

import { BaseMCPTool } from './BaseMCPTool.js';
import { cmdGetNextTask, cmdUpdateStatus, cmdReleaseLease } from '../../handlers/backlog.js';
import { cmdRecordDecision, cmdVerifyADR } from '../../handlers/adr.js';
import { cmdTrace } from '../../handlers/sync.js';
import { cmdDrift } from '../../handlers/sync.js';
import { cmdGetContext } from '../../handlers/general.js';
import { createSkyhookContext } from '../../context.js';

export class MCPToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a new MCP tool
   * @param {BaseMCPTool} tool 
   */
  register(tool) {
    if (!(tool instanceof BaseMCPTool)) {
      throw new Error('Tool must be an instance of BaseMCPTool');
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a registered tool by name
   * @param {string} name 
   * @returns {BaseMCPTool|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * List all tool definitions for MCP tools/list
   * @returns {Array<Object>}
   */
  list() {
    const definitions = [];
    for (const tool of this.tools.values()) {
      definitions.push(tool.toDefinition());
    }
    return definitions;
  }

  /**
   * Execute a tool by name with arguments
   * @param {string} name 
   * @param {Object} args 
   * @param {Object} [context] 
   * @returns {Promise<Object>}
   */
  async execute(name, args = {}, context = null) {
    const tool = this.get(name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool '${name}' not found in registry.` }]
      };
    }

    const effectiveContext = context || createSkyhookContext(process.cwd()) || {
      projectDir: process.cwd(),
      skyhookDir: `${process.cwd()}/.skyhook`
    };

    try {
      return await tool.execute(args, effectiveContext);
    } catch (err) {
      return tool.formatError(err);
    }
  }

  /**
   * Factory registering all 8 built-in Skyhook tools
   * @returns {MCPToolRegistry}
   */
  static createDefault() {
    const registry = new MCPToolRegistry();

    // 1. skyhook_get_next_task
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_get_next_task',
          'Get the next highest-priority ready task from the project backlog and acquire an advisory agent lease.',
          {
            type: 'object',
            properties: {
              assignee: { type: 'string', description: 'Agent identifier or human name claiming the task' },
              epic: { type: 'string', description: 'Filter task by epic ID' }
            }
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdGetNextTask(ctx, { agent: args.assignee, assignee: args.assignee, epic: args.epic });
        return this.formatSuccess(res);
      }
    }());

    // 2. skyhook_update_status
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_update_status',
          'Transition a story status through the Agile state machine (backlog -> ready -> in-progress -> in-review -> done) and record events.',
          {
            type: 'object',
            properties: {
              storyId: { type: 'string', description: 'The story ID (e.g. STORY-001 or ULID)' },
              status: {
                type: 'string',
                enum: ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'],
                description: 'Target story status'
              },
              force: { type: 'boolean', description: 'Force illegal state transition if authorized' }
            },
            required: ['storyId', 'status']
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdUpdateStatus(ctx, {
          storyId: args.storyId,
          status: args.status,
          force: !!args.force
        });
        return this.formatSuccess(res);
      }
    }());

    // 3. skyhook_release_lease
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_release_lease',
          'Release an active task lease on a story, allowing other agents or developers to work on it.',
          {
            type: 'object',
            properties: {
              storyId: { type: 'string', description: 'The story ID' },
              force: { type: 'boolean', description: 'Force break a stale lease' }
            },
            required: ['storyId']
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdReleaseLease(ctx, {
          storyId: args.storyId,
          force: !!args.force
        });
        return this.formatSuccess(res);
      }
    }());

    // 4. skyhook_record_decision
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_record_decision',
          'Record an architectural decision (ADR) with automated Mermaid diagram generation and index synchronization.',
          {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title of the architectural decision' },
              decision: { type: 'string', description: 'The concrete architectural choice made' },
              context: { type: 'string', description: 'Context and problem driving this decision' },
              status: { type: 'string', enum: ['draft', 'under-review', 'accepted', 'superseded'], default: 'accepted' },
              category: { type: 'string', default: 'architecture' },
              alternatives: { type: 'array', items: { type: 'string' } },
              supersedes: { type: 'string', description: 'ID of an older ADR being superseded' }
            },
            required: ['title', 'decision', 'context']
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdRecordDecision(ctx, args);
        return this.formatSuccess(res);
      }
    }());

    // 5. skyhook_verify_policies
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_verify_policies',
          'Verify codebase imports and structure against accepted ADR architectural policies using AST import scanning.',
          {
            type: 'object',
            properties: {}
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdVerifyADR(ctx, args);
        return this.formatSuccess(res);
      }
    }());

    // 6. skyhook_check_drift
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_check_drift',
          'Scan the codebase for architectural drift, Domain-Driven Design (DDD) layer violations, and circular dependency loops.',
          {
            type: 'object',
            properties: {
              boundaries: { type: 'boolean', description: 'Check DDD module boundaries' },
              semantic: { type: 'boolean', description: 'Run semantic AST lint rules' },
              c4: { type: 'boolean', description: 'Compare against target C4 model' }
            }
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdDrift(ctx, args);
        return this.formatSuccess(res);
      }
    }());

    // 7. skyhook_trace_requirement
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_trace_requirement',
          'Trace a functional requirement ID (e.g. REQ-001) to implementing code symbols, user stories, and ADRs.',
          {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Requirement ID to trace' }
            },
            required: ['id']
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdTrace(ctx, { id: args.id });
        return this.formatSuccess(res);
      }
    }());

    // 8. skyhook_get_context
    registry.register(new class extends BaseMCPTool {
      constructor() {
        super(
          'skyhook_get_context',
          'Retrieve aggregated project intelligence (tech stack, active epics, profile, and standards) for instant agent priming.',
          {
            type: 'object',
            properties: {
              topic: { type: 'string', description: 'Context topic filter (e.g. architecture, backlog, standards)' }
            }
          }
        );
      }
      async execute(args, ctx) {
        const res = await cmdGetContext(ctx, { topic: args.topic || 'general' });
        return this.formatSuccess(res);
      }
    }());

    return registry;
  }
}
