/**
 * MCPToolRegistry - Pluggable Registry for Skyhook MCP Tools
 * Implements MCP Tools specification (tools/list and tools/call).
 * Aggregates modular domain toolsets: Core, Planning, Standards, Backlog, ADR, Drift, Plan, Trace.
 */

import { BaseMCPTool } from './BaseMCPTool.js';
import { createSkyhookContext } from '../../context.js';

import { registerCoreTools } from './tools/coreTools.js';
import { registerPlanningTools } from './tools/planningTools.js';
import { registerStandardsTools } from './tools/standardsTools.js';
import { registerBacklogTools } from './tools/backlogTools.js';
import { registerADRTools } from './tools/adrTools.js';
import { registerDriftTools } from './tools/driftTools.js';
import { registerPlanTools } from './tools/planTools.js';
import { registerTraceTools } from './tools/traceTools.js';

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
   * Alias for get(name)
   */
  getTool(name) {
    return this.get(name);
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
   * Factory registering all built-in Skyhook tools across all functional domains
   * @returns {MCPToolRegistry}
   */
  static createDefault() {
    const registry = new MCPToolRegistry();

    registerCoreTools(registry);
    registerPlanningTools(registry);
    registerStandardsTools(registry);
    registerBacklogTools(registry);
    registerADRTools(registry);
    registerDriftTools(registry);
    registerPlanTools(registry);
    registerTraceTools(registry);

    return registry;
  }
}
