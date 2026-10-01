/**
 * AgentHarnessRegistry - Registry for AI agent harness plugins
 * 100% offline, zero native build tools, modular and extensible.
 */

import { BaseAgentHarness } from './BaseAgentHarness.js';
import { CursorHarness } from './plugins/CursorHarness.js';
import { ClaudeDesktopHarness } from './plugins/ClaudeDesktopHarness.js';
import { ClaudeCodeHarness } from './plugins/ClaudeCodeHarness.js';
import { CopilotHarness } from './plugins/CopilotHarness.js';
import { WindsurfHarness } from './plugins/WindsurfHarness.js';
import { AntigravityHarness } from './plugins/AntigravityHarness.js';
import { ClineHarness } from './plugins/ClineHarness.js';
import { CodexHarness } from './plugins/CodexHarness.js';

export class AgentHarnessRegistry {
  constructor() {
    this.harnesses = new Map();
  }

  /**
   * Register a new agent harness plugin
   * @param {BaseAgentHarness} harness
   */
  register(harness) {
    if (!(harness instanceof BaseAgentHarness)) {
      throw new Error('Harness must be an instance of BaseAgentHarness');
    }
    this.harnesses.set(harness.id, harness);
  }

  /**
   * Get harness by ID
   * @param {string} id
   * @returns {BaseAgentHarness|undefined}
   */
  get(id) {
    return this.harnesses.get(id);
  }

  /**
   * Return array of all registered harnesses
   * @returns {BaseAgentHarness[]}
   */
  list() {
    return Array.from(this.harnesses.values());
  }

  /**
   * Detect installed/configured agents in workspace or environment
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<Array<{ id: string, name: string, vendor: string, detected: boolean, reasons: string[], paths: string[] }>>}
   */
  async detectAll(workspaceDir, options = {}) {
    const results = [];
    for (const harness of this.harnesses.values()) {
      try {
        const detection = await harness.detect(workspaceDir, options);
        results.push({
          id: harness.id,
          name: harness.name,
          vendor: harness.vendor,
          description: harness.description,
          ...detection
        });
      } catch (err) {
        results.push({
          id: harness.id,
          name: harness.name,
          vendor: harness.vendor,
          description: harness.description,
          detected: false,
          reasons: [`Error detecting: ${err.message}`],
          paths: []
        });
      }
    }
    return results;
  }

  /**
   * Factory registering all 7 built-in agent harnesses
   * @returns {AgentHarnessRegistry}
   */
  static createDefault() {
    const registry = new AgentHarnessRegistry();
    registry.register(new CursorHarness());
    registry.register(new ClaudeDesktopHarness());
    registry.register(new ClaudeCodeHarness());
    registry.register(new CopilotHarness());
    registry.register(new WindsurfHarness());
    registry.register(new AntigravityHarness());
    registry.register(new ClineHarness());
    registry.register(new CodexHarness());
    return registry;
  }
}
