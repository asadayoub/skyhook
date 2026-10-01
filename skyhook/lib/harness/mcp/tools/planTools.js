/**
 * Plan MCP Tools
 * Enables autonomous agents to recompile living project plans, calculate capacity
 * forecasts, and retrieve scoped execution plans.
 */

import fs from 'fs';
import path from 'path';
import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdPlan } from '../../../handlers/general.js';

export function registerPlanTools(registry) {
  // 1. skyhook_recompile_plan
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_recompile_plan',
        'Trigger an immediate recompilation of the living master project plan (PROJECT_PLAN.md) with capacity forecasts and critical path analysis.',
        {
          type: 'object',
          properties: {
            all: { type: 'boolean', description: 'Recompile master plan and all scoped requirement/epic plans', default: true }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdPlan(ctx, { all: args.all !== false });
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_get_plan
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_plan',
        'Retrieve a compiled execution plan scoped to a specific requirement or epic, or fetch the project Gantt chart.',
        {
          type: 'object',
          properties: {
            req: { type: 'string', description: 'Requirement ID (e.g. REQ-001)' },
            epic: { type: 'string', description: 'Epic ID (e.g. EPIC-001)' },
            format: { type: 'string', enum: ['markdown', 'mermaid'], default: 'markdown' }
          }
        }
      );
    }
    async execute(args, ctx) {
      if (args.format === 'mermaid') {
        const res = await cmdPlan(ctx, { format: 'mermaid' });
        return this.formatSuccess(res);
      }

      if (args.req) {
        const res = await cmdPlan(ctx, { req: args.req });
        return this.formatSuccess(res);
      }

      if (args.epic) {
        const res = await cmdPlan(ctx, { epic: args.epic });
        return this.formatSuccess(res);
      }

      // Default: master plan
      const skyhookDir = ctx?.skyhookDir || path.join(process.cwd(), '.skyhook');
      const planFile = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');
      if (fs.existsSync(planFile)) {
        const content = fs.readFileSync(planFile, 'utf-8');
        return this.formatSuccess({
          path: planFile,
          content
        });
      }

      const res = await cmdPlan(ctx, {});
      return this.formatSuccess(res);
    }
  }());
}
