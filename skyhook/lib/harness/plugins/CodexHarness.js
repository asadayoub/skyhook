/**
 * CodexHarness - OpenAI Codex Agent Harness Plugin
 * Injects .codex/mcp.json, .codex/agents.md, and workspace AGENTS.md
 * 100% offline, atomic filesystem operations, safe non-destructive merging.
 */

import fs from 'fs';
import path from 'path';
import { BaseAgentHarness } from '../BaseAgentHarness.js';
import {
  resolveSkyhookMcpBin,
  generateGovernanceRules,
  mergeJsonFile,
  readJsonSafe,
  injectMarkerBlock,
  removeMarkerBlock,
  atomicWriteFile,
  MARKER_START
} from '../HarnessUtils.js';

export class CodexHarness extends BaseAgentHarness {
  get id() {
    return 'codex';
  }

  get name() {
    return 'OpenAI Codex';
  }

  get vendor() {
    return 'OpenAI';
  }

  get description() {
    return 'Configures Codex MCP stdio client in .codex/mcp.json and governance rules in .codex/agents.md and AGENTS.md';
  }

  /**
   * Target configuration or rule paths
   * @param {string} workspaceDir
   * @returns {string[]}
   */
  getTargetPaths(workspaceDir) {
    const paths = [
      path.join(workspaceDir, '.codex', 'mcp.json'),
      path.join(workspaceDir, '.codex', 'agents.md')
    ];
    const rootAgentsMd = path.join(workspaceDir, 'AGENTS.md');
    if (fs.existsSync(rootAgentsMd)) {
      paths.push(rootAgentsMd);
    }
    return paths;
  }

  /**
   * Detect if Codex is present, installed, or active in this workspace
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ detected: boolean, reasons: string[], paths: string[] }>}
   */
  async detect(workspaceDir, options = {}) {
    const reasons = [];
    const paths = [];

    const codexDir = path.join(workspaceDir, '.codex');
    const codexAgents = path.join(workspaceDir, '.codex', 'agents.md');
    const codexMcp = path.join(workspaceDir, '.codex', 'mcp.json');
    const rootAgents = path.join(workspaceDir, 'AGENTS.md');

    if (fs.existsSync(codexDir)) {
      reasons.push('Found .codex directory in workspace');
      paths.push(codexDir);
    }
    if (fs.existsSync(codexAgents)) {
      reasons.push('Found .codex/agents.md in workspace');
      paths.push(codexAgents);
    }
    if (fs.existsSync(codexMcp)) {
      reasons.push('Found .codex/mcp.json in workspace');
      paths.push(codexMcp);
    }
    if (fs.existsSync(rootAgents)) {
      reasons.push('Found AGENTS.md in workspace root');
      paths.push(rootAgents);
    }

    if (options.forceGlobalMcp || options.checkGlobal) {
      const homeCodex = path.join(process.env.HOME || process.env.USERPROFILE || '', '.codex');
      if (fs.existsSync(homeCodex)) {
        reasons.push('Found global ~/.codex directory');
        paths.push(homeCodex);
      }
      if (process.env.CODEX_HOME) {
        reasons.push('Found CODEX_HOME environment variable');
      }
    }

    return {
      detected: reasons.length > 0,
      reasons,
      paths
    };
  }

  /**
   * Generate configuration plan for Codex
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ files: Array<{ path: string, content: string, type: string }> }>}
   */
  async generateConfig(workspaceDir, options = {}) {
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const files = [
      {
        path: path.join(workspaceDir, '.codex', 'mcp.json'),
        type: 'merge-json',
        content: JSON.stringify({
          mcpServers: {
            skyhook: {
              command: 'node',
              args: [mcpBin, '--dir', workspaceDir]
            }
          }
        }, null, 2)
      },
      {
        path: path.join(workspaceDir, '.codex', 'agents.md'),
        type: 'marker-text',
        content: generateGovernanceRules(workspaceDir)
      }
    ];

    const rootAgentsMd = path.join(workspaceDir, 'AGENTS.md');
    if (fs.existsSync(rootAgentsMd)) {
      files.push({
        path: rootAgentsMd,
        type: 'marker-text',
        content: generateGovernanceRules(workspaceDir)
      });
    }

    return { files };
  }

  /**
   * Inject Skyhook MCP configuration and rules into Codex environment
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, modifiedFiles: string[], actions: string[] }>}
   */
  async inject(workspaceDir, options = {}) {
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const mcpJsonPath = path.join(workspaceDir, '.codex', 'mcp.json');
    const codexAgentsPath = path.join(workspaceDir, '.codex', 'agents.md');
    const rootAgentsPath = path.join(workspaceDir, 'AGENTS.md');

    const modifiedFiles = [];
    const actions = [];

    // 1. Merge into .codex/mcp.json
    mergeJsonFile(mcpJsonPath, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      existing.mcpServers = servers;
      return existing;
    });
    modifiedFiles.push(mcpJsonPath);
    actions.push(`Configured skyhook MCP server in ${mcpJsonPath}`);

    // 2. Inject rules into .codex/agents.md
    const rulesContent = generateGovernanceRules(workspaceDir);
    injectMarkerBlock(codexAgentsPath, rulesContent);
    modifiedFiles.push(codexAgentsPath);
    actions.push(`Injected governance rules into ${codexAgentsPath}`);

    // 3. Inject rules into root AGENTS.md if present or pre-seeded
    if (fs.existsSync(rootAgentsPath)) {
      injectMarkerBlock(rootAgentsPath, rulesContent);
      modifiedFiles.push(rootAgentsPath);
      actions.push(`Injected governance rules into ${rootAgentsPath}`);
    }

    // 4. Register with native Codex CLI if installed and not in test environment
    if (!options.dryRun && !options.skipCli && process.env.NODE_ENV !== 'test') {
      try {
        const { execSync } = await import('child_process');
        execSync(`codex mcp add skyhook -- node "${mcpBin}"`, { stdio: 'ignore' });
        actions.push('Registered skyhook in Codex CLI global registry (codex mcp add)');
      } catch (_) {
        // Gracefully ignore if codex CLI is not in PATH or already configured
      }
    }

    return {
      success: true,
      modifiedFiles,
      actions
    };
  }

  /**
   * Remove Skyhook integration from Codex environment
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, removedFiles: string[], restoredFiles: string[] }>}
   */
  async remove(workspaceDir, options = {}) {
    const mcpJsonPath = path.join(workspaceDir, '.codex', 'mcp.json');
    const codexAgentsPath = path.join(workspaceDir, '.codex', 'agents.md');
    const rootAgentsPath = path.join(workspaceDir, 'AGENTS.md');

    const removedFiles = [];
    const restoredFiles = [];

    // 1. Remove from .codex/mcp.json
    if (fs.existsSync(mcpJsonPath)) {
      const parsed = readJsonSafe(mcpJsonPath);
      if (parsed.mcpServers && parsed.mcpServers.skyhook) {
        delete parsed.mcpServers.skyhook;
        if (Object.keys(parsed.mcpServers).length === 0) {
          delete parsed.mcpServers;
        }
        if (Object.keys(parsed).length === 0) {
          fs.unlinkSync(mcpJsonPath);
          removedFiles.push(mcpJsonPath);
        } else {
          atomicWriteFile(mcpJsonPath, JSON.stringify(parsed, null, 2) + '\n');
          restoredFiles.push(mcpJsonPath);
        }
      }
    }

    // 2. Remove marker from .codex/agents.md
    if (fs.existsSync(codexAgentsPath)) {
      const removed = removeMarkerBlock(codexAgentsPath, true);
      if (removed) {
        if (!fs.existsSync(codexAgentsPath)) {
          removedFiles.push(codexAgentsPath);
        } else {
          restoredFiles.push(codexAgentsPath);
        }
      }
    }

    // 3. Remove marker from root AGENTS.md
    if (fs.existsSync(rootAgentsPath)) {
      const removed = removeMarkerBlock(rootAgentsPath, true);
      if (removed) {
        if (!fs.existsSync(rootAgentsPath)) {
          removedFiles.push(rootAgentsPath);
        } else {
          restoredFiles.push(rootAgentsPath);
        }
      }
    }

    // 4. Remove from native Codex CLI registry if installed and not in test environment
    if (!options.dryRun && !options.skipCli && process.env.NODE_ENV !== 'test') {
      try {
        const { execSync } = await import('child_process');
        execSync('codex mcp remove skyhook', { stdio: 'ignore' });
      } catch (_) {}
    }

    return {
      success: true,
      removedFiles,
      restoredFiles
    };
  }

  /**
   * Check injection status
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @returns {Promise<{ status: 'injected'|'partial'|'not_injected', details: Object }>}
   */
  async status(workspaceDir, options = {}) {
    const mcpJsonPath = path.join(workspaceDir, '.codex', 'mcp.json');
    const codexAgentsPath = path.join(workspaceDir, '.codex', 'agents.md');

    let hasMcp = false;
    let hasRules = false;

    if (fs.existsSync(mcpJsonPath)) {
      const json = readJsonSafe(mcpJsonPath);
      hasMcp = !!(json.mcpServers && json.mcpServers.skyhook);
    }

    if (fs.existsSync(codexAgentsPath)) {
      const content = fs.readFileSync(codexAgentsPath, 'utf-8');
      hasRules = content.includes(MARKER_START);
    }

    let status = 'not_injected';
    if (hasMcp && hasRules) {
      status = 'injected';
    } else if (hasMcp || hasRules) {
      status = 'partial';
    }

    return {
      status,
      details: {
        mcpJsonPath,
        codexAgentsPath,
        hasMcp,
        hasRules
      }
    };
  }
}
