/**
 * Standards MCP Tools
 * Enables autonomous agents to query, inspect, verify, and author modular engineering standards.
 */

import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdStandards } from '../../../handlers/general.js';

export function registerStandardsTools(registry) {
  // 1. skyhook_list_standards
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_list_standards',
        'Query the engineering standards library filtered by domain, severity, tier, or tag.',
        {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Filter by domain (security, software, api, database, frontend, devops)' },
            category: { type: 'string', description: 'Alias for domain' },
            severity: { type: 'string', enum: ['critical', 'error', 'warning', 'info'], description: 'Filter by severity' },
            tag: { type: 'string', description: 'Filter by semantic tag (e.g. jwt, rest, orm, async)' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdStandards(ctx, {
        action: 'list',
        domain: args.domain || args.category,
        category: args.category || args.domain,
        severity: args.severity,
        tag: args.tag
      });
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_view_standard
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_view_standard',
        'Retrieve complete specification for a standard including guidelines, acceptance criteria, and automated AST rules.',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Standard ID (e.g. STD-SEC-001, STD-SOFT-001)' }
          },
          required: ['id']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdStandards(ctx, {
        action: 'view',
        id: args.id
      });
      return this.formatSuccess(res);
    }
  }());

  // 3. skyhook_verify_standards
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_verify_standards',
        'Run automated AST semantic linter across project source files to check for violations against all active standards.',
        {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' }, description: 'Optional list of file paths to verify' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdStandards(ctx, {
        action: 'verify',
        files: args.files
      });
      return this.formatSuccess(res);
    }
  }());

  // 4. skyhook_create_standard
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_create_standard',
        'Scaffold a new custom workspace standard in .skyhook/standards/definitions/.',
        {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique standard ID (e.g. STD-SEC-002, STD-API-003)' },
            title: { type: 'string', description: 'Concise standard title' },
            domain: { type: 'string', description: 'Domain category (security, software, api, database, frontend, devops)' },
            severity: { type: 'string', enum: ['critical', 'error', 'warning', 'info'], default: 'error' },
            description: { type: 'string', description: 'Summary of the standard purpose' },
            guidelines: { type: 'array', items: { type: 'string' }, description: 'Guideline rules' },
            acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Checklist verification criteria' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Semantic tags for automated linking' }
          },
          required: ['id', 'title', 'domain']
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdStandards(ctx, {
        action: 'new',
        id: args.id,
        title: args.title,
        domain: args.domain,
        category: args.domain,
        severity: args.severity || 'error',
        description: args.description || '',
        guidelines: args.guidelines,
        acceptanceCriteria: args.acceptanceCriteria,
        tags: args.tags
      });
      return this.formatSuccess(res);
    }
  }());
}
