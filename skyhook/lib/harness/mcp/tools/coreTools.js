/**
 * Core MCP Tools
 * Preserves the original 8 foundation tools for Skyhook.
 */

import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdGetNextTask, cmdClaimTask, cmdUpdateStatus, cmdReleaseLease } from '../../../handlers/backlog.js';
import { cmdRecordDecision, cmdVerifyADR } from '../../../handlers/adr.js';
import { cmdTrace, cmdDrift } from '../../../handlers/sync.js';
import { cmdGetContext } from '../../../handlers/general.js';

export function registerCoreTools(registry) {
  // 1. skyhook_get_next_task
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_next_task',
        'Get the next highest-priority ready task or story from the project backlog and acquire an advisory agent lease.',
        {
          type: 'object',
          properties: {
            assignee: { type: 'string', description: 'Agent identifier or human name claiming the task' },
            level: { type: 'string', enum: ['task', 'story', 'any'], default: 'any', description: 'Hierarchy level: task (fine-grained), story (coarse-grained), or any (task first, fallback story)' },
            story: { type: 'string', description: 'Filter tasks belonging to a specific story ID' },
            epic: { type: 'string', description: 'Filter task by epic ID' },
            type: { type: 'string', enum: ['feature', 'bug', 'chore', 'spike', 'test', 'refactor'], description: 'Filter task by work item type' },
            lease: { type: 'number', description: 'Lease duration in minutes (default 30)' },
            claim: { type: 'boolean', description: 'Atomically transition claimed task to in-progress and return full execution context packet' }
          }
        }
      );
    }
    async execute(args, ctx) {
      if (args.claim) {
        const res = await cmdClaimTask(ctx, {
          agent: args.assignee,
          agentId: args.assignee,
          assignee: args.assignee,
          level: args.level || 'any',
          story: args.story,
          epic: args.epic,
          type: args.type,
          lease: args.lease
        });
        if (res.error) {
          return this.formatError(res.error);
        }
        return this.formatSuccess(res);
      }

      const res = await cmdGetNextTask(ctx, {
        agent: args.assignee,
        assignee: args.assignee,
        level: args.level || 'any',
        story: args.story,
        epic: args.epic,
        type: args.type,
        lease: args.lease
      });
      return this.formatSuccess(res);
    }
  }());

  // 1b. skyhook_claim_task
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_claim_task',
        'Atomically claim and lease the next ready task or a specific task, transition it to in-progress, and return a comprehensive execution context packet (requirements, ADRs, acceptance criteria, standards, target files, and test plan).',
        {
          type: 'object',
          properties: {
            assignee: { type: 'string', description: 'Agent identifier or human name claiming the task (required)' },
            taskId: { type: 'string', description: 'Optional specific task ID or story ID to claim (e.g. TASK-001). If omitted, automatically claims the highest priority ready task.' },
            level: { type: 'string', enum: ['task', 'story', 'any'], default: 'any', description: 'Hierarchy level: task (fine-grained), story (coarse-grained), or any (task first, fallback story)' },
            story: { type: 'string', description: 'Filter tasks belonging to a specific story ID' },
            epic: { type: 'string', description: 'Filter task by epic ID' },
            type: { type: 'string', enum: ['feature', 'bug', 'chore', 'spike', 'test', 'refactor'], description: 'Filter task by work item type' },
            role: { type: 'string', description: 'Filter task by specialized agent role' },
            lease: { type: 'number', default: 30, description: 'Lease duration in minutes (default 30)' }
          },
          required: ['assignee']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdClaimTask(ctx, {
        agent: args.assignee,
        agentId: args.assignee,
        assignee: args.assignee,
        taskId: args.taskId,
        storyId: args.taskId,
        level: args.level || 'any',
        story: args.story,
        epic: args.epic,
        type: args.type,
        role: args.role,
        lease: args.lease
      });
      if (res.error) {
        return this.formatError(res.error);
      }
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_update_status
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_update_status',
        'Transition a story or task status through the Agile state machine (backlog -> ready -> in-progress -> in-review -> done) and record events.',
        {
          type: 'object',
          properties: {
            storyId: { type: 'string', description: 'The story or task ID (e.g. STORY-001, TASK-001, or ULID)' },
            taskId: { type: 'string', description: 'Optional explicit task ID alias' },
            status: {
              type: 'string',
              enum: ['backlog', 'ready', 'in-progress', 'implemented', 'in-review', 'verified', 'done', 'blocked', 'cancelled'],
              description: 'Target work item status'
            },
            reason: { type: 'string', description: 'Reason for transition or blocker description' },
            agentId: { type: 'string', description: 'Agent ID performing the transition' },
            force: { type: 'boolean', description: 'Force illegal state transition if authorized' },
            evidence: {
              type: 'object',
              description: 'Verification evidence proving Definition of Done',
              properties: {
                commitHash: { type: 'string', description: 'Git commit hash' },
                changedFiles: { type: 'array', items: { type: 'string' }, description: 'List of modified file paths' },
                automatedChecks: {
                  type: 'object',
                  description: 'Automated test suite execution result',
                  properties: {
                    testCommand: { type: 'string', description: 'Test command executed' },
                    exitCode: { type: 'number', description: 'Process exit code (0 for success)' },
                    passedCount: { type: 'number', description: 'Number of tests passed' },
                    failedCount: { type: 'number', description: 'Number of tests failed' }
                  }
                },
                manualVerification: {
                  type: 'object',
                  description: 'Human or manual inspection notes',
                  properties: {
                    verifiedBy: { type: 'string', description: 'Verifier name or agent id' },
                    notes: { type: 'string', description: 'Notes on manual verification' }
                  }
                }
              }
            },
            commitHash: { type: 'string', description: 'Top-level shorthand for git commit hash' },
            testCommand: { type: 'string', description: 'Top-level shorthand for test command executed' },
            testExitCode: { type: 'number', description: 'Top-level shorthand for test process exit code (0 for success)' },
            strictEvidence: { type: 'boolean', description: 'Require verification evidence before marking verified or done' }
          },
          required: ['status']
        }
      );
    }
    async execute(args, ctx) {
      const itemId = args.storyId || args.taskId;
      if (!itemId) {
        return this.formatError('Missing required parameter: storyId or taskId');
      }
      const res = await cmdUpdateStatus(ctx, {
        storyId: itemId,
        taskId: itemId,
        status: args.status,
        reason: args.reason,
        agent: args.agentId,
        force: !!args.force,
        evidence: args.evidence,
        strictEvidence: !!args.strictEvidence,
        commitHash: args.commitHash,
        testCommand: args.testCommand,
        testExitCode: args.testExitCode
      });
      return this.formatSuccess(res);
    }
  }());

  // 3. skyhook_release_lease
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_release_lease',
        'Release an active task lease on a story or task, allowing other agents or developers to work on it.',
        {
          type: 'object',
          properties: {
            storyId: { type: 'string', description: 'The story or task ID' },
            taskId: { type: 'string', description: 'Optional explicit task ID alias' },
            agentId: { type: 'string', description: 'Agent releasing the lease' },
            force: { type: 'boolean', description: 'Force break a stale lease' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const itemId = args.storyId || args.taskId;
      if (!itemId) {
        return this.formatError('Missing required parameter: storyId or taskId');
      }
      const res = await cmdReleaseLease(ctx, {
        storyId: itemId,
        taskId: itemId,
        agent: args.agentId,
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
            standards: { type: 'array', items: { type: 'string' }, description: 'Standard IDs attached to this decision' },
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
            id: { type: 'string', description: 'Requirement ID to trace' },
            lineage: { type: 'boolean', description: 'Include refactored symbol lineage suggestions' }
          },
          required: ['id']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdTrace(ctx, { id: args.id, lineage: !!args.lineage });
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
            topic: { type: 'string', description: 'Context topic filter (general, features, decisions, requirements, tech, standards)' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdGetContext(ctx, { topic: args.topic || 'general' });
      return this.formatSuccess(res);
    }
  }());
}
