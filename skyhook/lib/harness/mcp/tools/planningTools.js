/**
 * Planning MCP Tools
 * Covers safe project initialization, profile inspection, tech stack declaration,
 * phased discovery questioning, and requirements management.
 */

import fs from 'fs';
import path from 'path';
import { BaseMCPTool } from '../BaseMCPTool.js';
import { cmdInit, cmdProfile, cmdDiscover, cmdQuestion } from '../../../handlers/general.js';
import { DashboardRPCHandler } from '../../../server/DashboardRPCHandler.js';
import { readYaml, writeYaml } from '../../../utils.js';

export function registerPlanningTools(registry) {
  // 1. skyhook_init_project
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_init_project',
        'Safely initialize a Skyhook project with a specified profile (web-app, cli-tool, api-service, etc.). Fails safely if .skyhook already exists.',
        {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name (defaults to current directory name)' },
            profile: { type: 'string', description: 'Profile name (web-app, cli-tool, api-service, library, mobile-app, etc.)', default: 'web-app' },
            description: { type: 'string', description: 'High level description of project' },
            variant: { type: 'string', description: 'Optional profile variant' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const projectDir = ctx?.projectDir || process.cwd();
      const skyhookDir = ctx?.skyhookDir || path.join(projectDir, '.skyhook');

      if (fs.existsSync(skyhookDir)) {
        return this.formatSuccess({
          message: 'Project is already initialized. .skyhook directory exists.',
          skyhookDir,
          initialized: true
        });
      }

      const res = await cmdInit({ skyhookDir, projectDir }, {
        name: args.name,
        profile: args.profile || 'web-app',
        description: args.description || '',
        variant: args.variant
      });
      return this.formatSuccess(res);
    }
  }());

  // 2. skyhook_get_profile
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_profile',
        'Inspect architectural profile details including default tech stack, questions, and variants.',
        {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Profile name (e.g. web-app, cli-tool, api-service)', default: 'web-app' }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdProfile(ctx, { name: args.name || 'web-app' });
      return this.formatSuccess(res);
    }
  }());

  // 3. skyhook_manage_tech_stack
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_manage_tech_stack',
        'Declare, inspect, add, or remove technologies and frameworks in .skyhook/tech-stack.yaml.',
        {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'add', 'remove'], description: 'Action to perform', default: 'list' },
            technology: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Technology/package name (e.g. Next.js, Prisma, PostgreSQL)' },
                category: { type: 'string', description: 'Category (Framework, Database & ORM, Database, Styling, Testing, Deployment, CI/CD)' },
                version: { type: 'string', description: 'Declared version or constraint' }
              },
              required: ['name']
            }
          }
        }
      );
    }
    async execute(args, ctx) {
      const skyhookDir = ctx?.skyhookDir || path.join(process.cwd(), '.skyhook');
      const techStackPath = path.join(skyhookDir, 'tech-stack.yaml');
      const techStack = (fs.existsSync(techStackPath) ? readYaml(techStackPath) : null) || {
        schemaVersion: '1.0.0',
        technologies: [],
        patterns: [],
        constraints: []
      };
      if (!Array.isArray(techStack.technologies)) techStack.technologies = [];

      const action = args.action || 'list';

      if (action === 'add') {
        if (!args.technology || !args.technology.name) {
          return this.formatError('Technology name is required for action "add"');
        }
        const existingIdx = techStack.technologies.findIndex(t => t.name.toLowerCase() === args.technology.name.toLowerCase());
        const entry = {
          name: args.technology.name,
          category: args.technology.category || 'Technology',
          ...(args.technology.version ? { version: args.technology.version } : {})
        };
        if (existingIdx >= 0) {
          techStack.technologies[existingIdx] = { ...techStack.technologies[existingIdx], ...entry };
        } else {
          techStack.technologies.push(entry);
        }
        writeYaml(techStackPath, techStack);
        return this.formatSuccess({ message: `Technology '${entry.name}' added to tech-stack.yaml`, techStack });
      }

      if (action === 'remove') {
        if (!args.technology || !args.technology.name) {
          return this.formatError('Technology name is required for action "remove"');
        }
        techStack.technologies = techStack.technologies.filter(t => t.name.toLowerCase() !== args.technology.name.toLowerCase());
        writeYaml(techStackPath, techStack);
        return this.formatSuccess({ message: `Technology '${args.technology.name}' removed from tech-stack.yaml`, techStack });
      }

      return this.formatSuccess(techStack);
    }
  }());

  // 4. skyhook_run_discovery
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_run_discovery',
        'Execute phased discovery workflow (init, vision, requirements, architecture, ux, tech, plan) and submit answers to record architectural requirements.',
        {
          type: 'object',
          properties: {
            phase: {
              type: 'string',
              enum: ['init', 'vision', 'requirements', 'architecture', 'ux', 'tech', 'plan', 'all'],
              default: 'all',
              description: 'Discovery phase to query or answer'
            },
            answers: {
              type: 'object',
              description: 'Key-value map of question IDs to answers'
            }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdDiscover(ctx, { phase: args.phase || 'all', answers: args.answers || {} });
      return this.formatSuccess(res);
    }
  }());

  // 5. skyhook_get_questions
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_get_questions',
        'Retrieve contextual architectural and project questions based on active profile and phase.',
        {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Category/phase filter (init, vision, requirements, architecture, ux, tech, plan, all)', default: 'all' },
            limit: { type: 'number', description: 'Maximum questions to return', default: 10 }
          }
        }
      );
    }
    async execute(args, ctx) {
      const res = await cmdQuestion(ctx, { category: args.category || 'all', limit: args.limit || 10 });
      return this.formatSuccess(res);
    }
  }());

  // 6. skyhook_create_requirement
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_create_requirement',
        'Register a new requirement in .skyhook/requirements/ (functional, non-functional, or constraint).',
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['functional', 'nonFunctional', 'constraints'], default: 'functional', description: 'Requirement category' },
            id: { type: 'string', description: 'Optional explicit ID (e.g. REQ-001, NFR-001, CON-001). Auto-generated if omitted.' },
            statement: { type: 'string', description: 'The requirement statement (or title)' },
            rationale: { type: 'string', description: 'Architectural or business rationale' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], default: 'medium' }
          },
          required: ['statement']
        }
      );
    }
    async execute(args, ctx) {
      const skyhookDir = ctx?.skyhookDir || path.join(process.cwd(), '.skyhook');
      const res = DashboardRPCHandler.createRequirement(skyhookDir, args.type || 'functional', {
        id: args.id,
        statement: args.statement,
        rationale: args.rationale,
        priority: args.priority || 'medium'
      });
      return this.formatSuccess(res);
    }
  }());

  // 7. skyhook_list_requirements
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_list_requirements',
        'List registered requirements filtered by category (functional, non-functional, constraints) and priority.',
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['all', 'functional', 'nonFunctional', 'constraints'], default: 'all' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
          }
        }
      );
    }
    async execute(args, ctx) {
      const skyhookDir = ctx?.skyhookDir || path.join(process.cwd(), '.skyhook');
      const reqDir = path.join(skyhookDir, 'requirements');

      const func = fs.existsSync(path.join(reqDir, 'functional.yaml')) ? (readYaml(path.join(reqDir, 'functional.yaml')) || { requirements: [] }) : { requirements: [] };
      const nf = fs.existsSync(path.join(reqDir, 'non-functional.yaml')) ? (readYaml(path.join(reqDir, 'non-functional.yaml')) || { requirements: [] }) : { requirements: [] };
      const con = fs.existsSync(path.join(reqDir, 'constraints.yaml')) ? (readYaml(path.join(reqDir, 'constraints.yaml')) || { constraints: [] }) : { constraints: [] };

      const all = [];
      (func.requirements || []).forEach(r => all.push({ ...r, type: 'functional' }));
      (nf.requirements || []).forEach(r => all.push({ ...r, type: 'nonFunctional' }));
      (con.constraints || []).forEach(r => all.push({ ...r, type: 'constraints' }));

      let filtered = all;
      if (args.type && args.type !== 'all') {
        filtered = filtered.filter(r => r.type === args.type);
      }
      if (args.priority) {
        filtered = filtered.filter(r => r.priority === args.priority);
      }

      return this.formatSuccess({
        requirements: filtered,
        count: filtered.length,
        total: all.length
      });
    }
  }());

  // 8. skyhook_update_requirement
  registry.register(new class extends BaseMCPTool {
    constructor() {
      super(
        'skyhook_update_requirement',
        'Update statement, rationale, or priority of an existing requirement.',
        {
          type: 'object',
          properties: {
            reqId: { type: 'string', description: 'Requirement ID (e.g. REQ-001, NFR-001, CON-001)' },
            type: { type: 'string', enum: ['functional', 'nonFunctional', 'constraints'], default: 'functional' },
            statement: { type: 'string' },
            rationale: { type: 'string' },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
          },
          required: ['reqId']
        }
      );
    }
    async execute(args, ctx) {
      const skyhookDir = ctx?.skyhookDir || path.join(process.cwd(), '.skyhook');
      const res = DashboardRPCHandler.updateRequirement(skyhookDir, args.type || 'functional', args.reqId, {
        statement: args.statement,
        rationale: args.rationale,
        priority: args.priority
      });
      return this.formatSuccess(res);
    }
  }());
}
