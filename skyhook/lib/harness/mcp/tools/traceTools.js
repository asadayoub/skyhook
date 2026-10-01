/**
 * Trace MCP Tools
 * Enables autonomous agents to inspect AST code coverage heatmaps, Dark Matter metrics,
 * blast radius impact analysis, and unmapped legacy symbols.
 */

import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdCoverage, cmdImpact, cmdUntraced, cmdMapLegacy } from '../../../handlers/sync.js';

export function registerTraceTools(registry) {
  // 1. skyhook_get_coverage
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_coverage',
        'Calculate AST traceability coverage and Dark Matter metrics (% of codebase symbols linked to functional requirements).',
        {
          type: 'object',
          properties: {}
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdCoverage(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_analyze_impact
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_analyze_impact',
        'Analyze blast radius and downstream dependencies before modifying or deleting a requirement.',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Requirement ID to evaluate (e.g. REQ-001)' }
          },
          required: ['id']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdImpact(ctx, { id: args.id });
      return this.formatSuccess(res);
    }
  }());

  // 3. skyhook_find_untraced
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_find_untraced',
        'Find all declared requirements that currently have zero code implementations or AST symbol links.',
        {
          type: 'object',
          properties: {}
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdUntraced(ctx, args);
      return this.formatSuccess(res);
    }
  }());

  // 4. skyhook_map_legacy_symbol
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_map_legacy_symbol',
        'Inspect unmapped legacy code symbols (functions, classes, methods) across the codebase that have no traced requirement link.',
        {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum symbols to return', default: 20 }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdMapLegacy(ctx, args);
      if (res && res.legacySymbols && args.limit) {
        res.legacySymbols = res.legacySymbols.slice(0, args.limit);
      }
      return this.formatSuccess(res);
    }
  }());
}
