/**
 * BaseAgentHarness - Abstract base class for all Agent Harness Plugins
 * Defines the contract for agent detection, configuration generation, atomic injection, and removal.
 * Pure ES Module, 100% offline, zero external dependencies.
 */

export class BaseAgentHarness {
  /**
   * Unique harness identifier (e.g. 'cursor', 'claude-desktop', 'windsurf')
   * @returns {string}
   */
  get id() {
    throw new Error('Not implemented: get id()');
  }

  /**
   * Human-friendly display name (e.g. 'Cursor AI')
   * @returns {string}
   */
  get name() {
    throw new Error('Not implemented: get name()');
  }

  /**
   * Harness vendor or creator (e.g. 'Anysphere', 'Anthropic')
   * @returns {string}
   */
  get vendor() {
    return 'Unknown';
  }

  /**
   * Short description of this harness integration
   * @returns {string}
   */
  get description() {
    return '';
  }

  /**
   * Target configuration or rule paths relative to workspace or user home
   * @param {string} workspaceDir
   * @returns {string[]}
   */
  getTargetPaths(workspaceDir) {
    return [];
  }

  /**
   * Detect if this agent is present, installed, or active for the given workspace
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ detected: boolean, reasons: string[], paths: string[] }>}
   */
  async detect(workspaceDir, options = {}) {
    return { detected: false, reasons: [], paths: [] };
  }

  /**
   * Generate configuration and rules for this harness
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ files: Array<{ path: string, content: string, type: 'json'|'text'|'merge-json'|'marker-text' }> }>}
   */
  async generateConfig(workspaceDir, options = {}) {
    throw new Error('Not implemented: generateConfig()');
  }

  /**
   * Inject Skyhook MCP and rules into this agent's environment
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, modifiedFiles: string[], actions: string[] }>}
   */
  async inject(workspaceDir, options = {}) {
    throw new Error('Not implemented: inject()');
  }

  /**
   * Remove or roll back Skyhook MCP and rules from this agent's environment
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, removedFiles: string[], restoredFiles: string[] }>}
   */
  async remove(workspaceDir, options = {}) {
    throw new Error('Not implemented: remove()');
  }

  /**
   * Check injection status
   * @param {string} workspaceDir
   * @returns {Promise<{ status: 'injected'|'partial'|'not_injected'|'drifted', details: Object }>}
   */
  async status(workspaceDir) {
    return { status: 'not_injected', details: {} };
  }
}
