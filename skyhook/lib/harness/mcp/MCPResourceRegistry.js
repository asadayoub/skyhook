/**
 * MCPResourceRegistry - Pluggable Registry for Skyhook MCP Resources
 * Implements MCP Resources specification (resources/list and resources/read).
 */

import fs from 'fs';
import path from 'path';
import { BaseMCPResource } from './BaseMCPResource.js';
import { createSkyhookContext } from '../../context.js';

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
   * Factory registering all 5 built-in Skyhook resources
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

    return registry;
  }
}
