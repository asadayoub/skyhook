/**
 * ADR MCP Tools
 * Enables autonomous agents to synthesize draft ADRs, synchronize markdown records,
 * formally supersede architectural decisions, and inspect decision DAGs.
 */

import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdDraftADR, cmdSyncADR, cmdSupersedeADR, cmdADRDAG } from '../../../handlers/adr.js';

export function registerADRTools(registry) {
  // 1. skyhook_draft_adr
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_draft_adr',
        'Auto-synthesize a draft Architecture Decision Record (ADR) based on detected codebase shifts or specified parameters.',
        {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Proposed title for the decision' },
            decision: { type: 'string', description: 'The chosen architectural approach' },
            context: { type: 'string', description: 'Context and problem driving this decision' },
            category: { type: 'string', default: 'technology', description: 'Category (technology, architecture, security, database)' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdDraftADR(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_sync_adr
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_sync_adr',
        'Run bi-directional synchronization between .skyhook/decisions/records/*.md and decisions/index.yaml.',
        {
          type: 'object',
          properties: {}
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdSyncADR(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 3. skyhook_supersede_adr
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_supersede_adr',
        'Formally supersede an existing ADR with a new decision, updating the decision DAG and policy compiler.',
        {
          type: 'object',
          properties: {
            oldId: { type: 'string', description: 'ID of the ADR being superseded (e.g. ADR-001)' },
            newId: { type: 'string', description: 'ID of the superseding ADR (e.g. ADR-004)' },
            reason: { type: 'string', description: 'Architectural rationale for superseding the older decision' }
          },
          required: ['oldId', 'newId']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdSupersedeADR(ctx, {
        oldId: args.oldId,
        newId: args.newId,
        reason: args.reason
      });
      return this.formatSuccess(res);
    }
  }());

  // 4. skyhook_get_adr_dag
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_adr_dag',
        'Retrieve the Mermaid decision graph (DAG) showing all ADRs, supersession links, and lifecycle states.',
        {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['mermaid', 'json'], default: 'mermaid' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdADRDAG(ctx, { format: args.format || 'mermaid' });
      return this.formatSuccess(res);
    }
  }());
}
