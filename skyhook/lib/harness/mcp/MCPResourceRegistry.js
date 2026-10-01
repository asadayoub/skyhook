/**
 * MCPResourceRegistry - Pluggable Registry for Skyhook MCP Resources
 * Implements MCP Resources specification (resources/list and resources/read).
 * Provides 11 live, streaming resources covering backlog, decisions, plan,
 * boundaries, tech-stack, standards, blockers, drift-scorecard, dark-matter, profile, and trace-graph.
 */

import fs from 'fs';
import path from 'path';
import { BaseMCPResource } from './BaseMCPResource.js';
import { createSkyhookContext } from '../../context.js';
import { StandardsRegistry } from '../../standards/StandardsRegistry.js';
import { DependencyResolver } from '../../backlog/DependencyResolver.js';
import { DriftAggregator } from '../../drift/DriftAggregator.js';
import { generateCoverageHeatmap } from '../../tracer.js';
import { loadProfile } from '../../utils.js';
import { cmdGraph } from '../../handlers/sync.js';

export class MCPResourceRegistry {
  constructor() {
    this.resources = new Map();
  }

  /**
   * Register a new MCP resource
   * @param {BaseMCPResource} resource 
   */
  register(resource) {
    if (!(resource instanceof BaseMCPResource)) {
      throw new Error('Resource must be an instance of BaseMCPResource');
    }
    this.resources.set(resource.uri, resource);
  }

  /**
   * Get a registered resource by URI
   * @param {string} uri 
   * @returns {BaseMCPResource|undefined}
   */
  get(uri) {
    return this.resources.get(uri);
  }

  /**
   * List all resource definitions for MCP resources/list
   * @returns {Array<Object>}
   */
  list() {
    const definitions = [];
    for (const res of this.resources.values()) {
      definitions.push(res.toDefinition());
    }
    return definitions;
  }

  /**
   * Read resource content by URI
   * @param {string} uri 
   * @param {Object} [context] 
   * @returns {Promise<Object>}
   */
  async read(uri, context = null) {
    const resource = this.get(uri);
    if (!resource) {
      throw new Error(`Resource '${uri}' not found in registry.`);
    }

    const effectiveContext = context || createSkyhookContext(process.cwd()) || {
      projectDir: process.cwd(),
      skyhookDir: `${process.cwd()}/.skyhook`
    };

    return await resource.read(uri, effectiveContext);
  }

  /**
   * Factory registering all 11 built-in Skyhook resources
   * @returns {MCPResourceRegistry}
   */
  static createDefault() {
    const registry = new MCPResourceRegistry();

    // Helper to read file content or return empty placeholder
    const readFileSafely = (filePath, defaultText = '{}') => {
      try {
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, 'utf-8');
        }
      } catch {
        // fallback
      }
      return defaultText;
    };

    // 1. skyhook://backlog
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://backlog',
          'Project Backlog (Epics, Stories, Acceptance Criteria, Leases)',
          'application/yaml',
          'Live project backlog containing all user stories, state machine statuses, and active leases.'
        );
      }
      async read(uri, ctx) {
        const filePath = path.join(ctx.skyhookDir, 'backlog', 'epics.yaml');
        const content = readFileSafely(filePath, 'schemaVersion: "1.0.0"\nepics: []\nstories: []\n');
        return this.formatContent(uri, content);
      }
    }());

    // 2. skyhook://plan
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://plan',
          'Living Project Plan (Capacity Forecast & Roadmap)',
          'text/markdown',
          'Living PROJECT_PLAN.md with rolling velocity, Monte Carlo delivery forecasts, and Gantt charts.'
        );
      }
      async read(uri, ctx) {
        const filePath = path.join(ctx.skyhookDir, 'plan', 'PROJECT_PLAN.md');
        const content = readFileSafely(filePath, '# Project Plan\n\nNo compiled plan available yet.\n');
        return this.formatContent(uri, content, 'text/markdown');
      }
    }());

    // 3. skyhook://decisions
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://decisions',
          'Architectural Decisions Index',
          'application/yaml',
          'Index of all recorded Architecture Decision Records (ADRs) with statuses, categories, and policy rules.'
        );
      }
      async read(uri, ctx) {
        const filePath = path.join(ctx.skyhookDir, 'decisions', 'index.yaml');
        const content = readFileSafely(filePath, 'schemaVersion: "1.0.0"\ndecisions: []\n');
        return this.formatContent(uri, content);
      }
    }());

    // 4. skyhook://boundaries
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://boundaries',
          'Machine Architectural Boundaries & Rules',
          'application/yaml',
          'Living architecture boundary rules compiled from active accepted ADRs and layer invariants.'
        );
      }
      async read(uri, ctx) {
        const filePath = path.join(ctx.skyhookDir, 'architecture-boundaries.yaml');
        const content = readFileSafely(filePath, 'version: "1.0.0"\nactivePolicies: []\n');
        return this.formatContent(uri, content);
      }
    }());

    // 5. skyhook://tech-stack
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://tech-stack',
          'Declared & Discovered Technology Stack',
          'application/yaml',
          'Current tech-stack.yaml tracking recognized frameworks, runtime engines, and persistence layers.'
        );
      }
      async read(uri, ctx) {
        const filePath = path.join(ctx.skyhookDir, 'tech-stack.yaml');
        const content = readFileSafely(filePath, 'technologies: []\n');
        return this.formatContent(uri, content);
      }
    }());

    // 6. skyhook://standards
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://standards',
          'Modular Engineering Standards Catalog',
          'application/json',
          'Complete engineering standards catalog active in this workspace, with guidelines, acceptance criteria, and rules.'
        );
      }
      async read(uri, ctx) {
        const projectDir = ctx.projectDir || (ctx.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
        const standards = StandardsRegistry.listStandards({}, projectDir);
        return this.formatContent(uri, JSON.stringify({ count: standards.length, standards }, null, 2), 'application/json');
      }
    }());

    // 7. skyhook://blockers
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://blockers',
          'Active Backlog Blockers & Dependency Graph',
          'application/json',
          'Currently blocked backlog tasks with unmet prerequisites and blocker reasons.'
        );
      }
      async read(uri, ctx) {
        const backlog = (ctx.readBacklog ? ctx.readBacklog() : null) || {};
        const allStories = backlog.stories || [];
        const blocked = allStories.filter(s => DependencyResolver.isBlocked(s, allStories));
        const details = blocked.map(s => ({
          id: s.id,
          title: s.title,
          status: s.status,
          blockerReason: s.blockerReason || null,
          unmetDependencies: DependencyResolver.getUnmetDependencies(s, allStories)
        }));
        return this.formatContent(uri, JSON.stringify({ count: details.length, blockers: details }, null, 2), 'application/json');
      }
    }());

    // 8. skyhook://drift-scorecard
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://drift-scorecard',
          'Living Architecture Drift & Compliance Scorecard',
          'application/json',
          'Live architectural compliance health score (0-100%), circular dependency cycles, and layer violations.'
        );
      }
      async read(uri, ctx) {
        try {
          const aggregator = new DriftAggregator(ctx);
          const scorecard = await aggregator.analyze();
          return this.formatContent(uri, JSON.stringify(scorecard, null, 2), 'application/json');
        } catch (err) {
          return this.formatContent(uri, JSON.stringify({ error: err.message, healthScore: 0 }, null, 2), 'application/json');
        }
      }
    }());

    // 9. skyhook://dark-matter
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://dark-matter',
          'AST Dark Matter & Requirement Trace Coverage Heatmap',
          'application/json',
          'Analysis of untraced codebase symbols and percentage of code linked to functional requirements.'
        );
      }
      async read(uri, ctx) {
        try {
          const projectDir = ctx.projectDir || (ctx.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
          const coverage = await generateCoverageHeatmap(projectDir);
          return this.formatContent(uri, JSON.stringify(coverage, null, 2), 'application/json');
        } catch (err) {
          return this.formatContent(uri, JSON.stringify({ error: err.message }, null, 2), 'application/json');
        }
      }
    }());

    // 10. skyhook://profile
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://profile',
          'Project Architectural Profile & Constraints',
          'application/json',
          'Active project profile configuration, expected conventions, and baseline tech stack expectations.'
        );
      }
      async read(uri, ctx) {
        const projectYaml = (ctx.readProjectYaml ? ctx.readProjectYaml() : null) || {};
        const profile = loadProfile(projectYaml.profile || 'web-app') || {};
        return this.formatContent(uri, JSON.stringify({ project: projectYaml, profile }, null, 2), 'application/json');
      }
    }());

    // 11. skyhook://trace-graph
    registry.register(new class extends BaseMCPResource {
      constructor() {
        super(
          'skyhook://trace-graph',
          'Living Requirement-to-Code Trace Graph',
          'text/markdown',
          'Visual Mermaid diagram linking Functional Requirements -> User Stories -> Code Symbols -> Tests.'
        );
      }
      async read(uri, ctx) {
        try {
          const res = await cmdGraph(ctx, {});
          const content = res.markdown || res.graph || '# Living Requirement Trace Graph\n\n```mermaid\ngraph TD\n  Start[Project Initialized]\n```\n';
          return this.formatContent(uri, content, 'text/markdown');
        } catch (err) {
          return this.formatContent(uri, '# Living Requirement Trace Graph\n\nError generating graph: ' + err.message, 'text/markdown');
        }
      }
    }());

    return registry;
  }
}
