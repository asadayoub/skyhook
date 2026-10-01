/**
 * Drift MCP Tools
 * Enables autonomous agents to remediate architectural drift and retrieve C4 diagrams.
 */

import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdDrift } from '../../../handlers/sync.js';
import { DriftAutoFixer } from '../../../drift/DriftAutoFixer.js';
import { DriftAggregator } from '../../../drift/DriftAggregator.js';

export function registerDriftTools(registry) {
  // 1. skyhook_adopt_drift
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_adopt_drift',
        'Auto-adopt detected or specified libraries and packages into .skyhook/tech-stack.yaml to reconcile architectural drift.',
        {
          type: 'object',
          properties: {
            technologies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Technology name' },
                  category: { type: 'string', description: 'Category (Database, Framework, Styling, etc.)' }
                },
                required: ['name']
              },
              description: 'Optional explicit list of technologies to adopt. If omitted, scans for and adopts all package drift.'
            }
          }
        }
      );
    }
    async execute(args, ctx) {
      if (args.technologies && args.technologies.length > 0) {
        const res = DriftAutoFixer.adoptDrift(ctx, args.technologies);
        return this.formatSuccess(res);
      }

      // Auto-scan drift and adopt detected items
      const aggregator = new DriftAggregator(ctx);
      const scorecard = await aggregator.analyze();
      const packageDrifts = (scorecard.warnings || []).filter(w => w.type === 'PACKAGE_DRIFT');

      const items = packageDrifts.map(p => ({
        name: p.orm || p.database || p.styling || (p.message && p.message.match(/'([^']+)'/)?.[1]) || 'Unknown',
        category: p.type.toLowerCase().includes('database') ? 'Database' : 'Technology'
      })).filter(i => i.name !== 'Unknown');

      const res = DriftAutoFixer.adoptDrift(ctx, items);
      return this.formatSuccess({
        message: `Adopted ${res.adoptedCount || (res.adopted ? res.adopted.length : 0)} detected package(s)`,
        ...res
      });
    }
  }());

  // 2. skyhook_get_c4_architecture
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_c4_architecture',
        'Generate and retrieve living C4 Container and Component architecture diagrams in Mermaid format.',
        {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['all', 'container', 'component'], default: 'all' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const scorecard = await cmdDrift(ctx, { c4: true, json: true });
      const c4 = scorecard.c4 || {};

      if (args.level === 'container') {
        return this.formatSuccess({
          level: 'container',
          mermaid: c4.mermaidContainer || ''
        });
      }

      if (args.level === 'component') {
        return this.formatSuccess({
          level: 'component',
          mermaid: c4.mermaidComponent || ''
        });
      }

      return this.formatSuccess({
        level: 'all',
        mermaidContainer: c4.mermaidContainer || '',
        mermaidComponent: c4.mermaidComponent || '',
        containersCount: (c4.containers || []).length,
        componentsCount: (c4.components || []).length
      });
    }
  }());
}
