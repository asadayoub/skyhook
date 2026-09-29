/**
 * AgentDetector - Scans workspace and OS environment for installed/active AI agents
 * 100% offline, zero native build tools.
 */

import { AgentHarnessRegistry } from './AgentHarnessRegistry.js';

export class AgentDetector {
  /**
   * @param {AgentHarnessRegistry} [registry]
   */
  constructor(registry = null) {
    this.registry = registry || AgentHarnessRegistry.createDefault();
  }

  /**
   * Run full detection across all registered harnesses
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{
   *   detectedAgents: Array<{ id: string, name: string, vendor: string, reasons: string[], paths: string[] }>,
   *   undetectedAgents: Array<{ id: string, name: string, vendor: string }>,
   *   totalRegistered: number,
   *   detectedCount: number,
   *   timestamp: string
   * }>}
   */
  async scan(workspaceDir, options = {}) {
    const all = await this.registry.detectAll(workspaceDir, options);

    const detectedAgents = [];
    const undetectedAgents = [];

    for (const item of all) {
      if (item.detected) {
        detectedAgents.push(item);
      } else {
        undetectedAgents.push({
          id: item.id,
          name: item.name,
          vendor: item.vendor,
          description: item.description
        });
      }
    }

    return {
      detectedAgents,
      undetectedAgents,
      totalRegistered: all.length,
      detectedCount: detectedAgents.length,
      timestamp: new Date().toISOString()
    };
  }
}
