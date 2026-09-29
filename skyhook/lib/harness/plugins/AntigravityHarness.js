/**
 * AntigravityHarness - Google Antigravity Agent Harness Plugin
 * Injects .agents/rules/skyhook-governance.md and .agents/mcp_config.json
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

export class AntigravityHarness extends BaseAgentHarness {
  get id() {
    return 'antigravity';
  }

  get name() {
    return 'Google Antigravity';
  }

  get vendor() {
    return 'Google';
  }

  get description() {
    return 'Injects governance rule file in .agents/rules/ and MCP server config in .agents/mcp_config.json';
  }

  getTargetPaths(workspaceDir) {
    return [
      path.join(workspaceDir, '.agents/rules/skyhook-governance.md'),
      path.join(workspaceDir, '.agents/mcp_config.json')
    ];
  }

  async detect(workspaceDir, options = {}) {
    const agentsDir = path.join(workspaceDir, '.agents');
    const geminiDir = path.join(process.env.HOME || '', '.gemini');
    const reasons = [];
    const paths = [];

    if (fs.existsSync(agentsDir)) {
      reasons.push('Found .agents workspace customization root');
      paths.push(agentsDir);
    }
    if (fs.existsSync(geminiDir)) {
      reasons.push('Found Antigravity global environment configuration');
      paths.push(geminiDir);
    }

    return {
      detected: reasons.length > 0,
      reasons,
      paths
    };
  }

  async generateConfig(workspaceDir, options = {}) {
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    return {
      files: [
        {
          path: path.join(workspaceDir, '.agents/mcp_config.json'),
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
          path: path.join(workspaceDir, '.agents/rules/skyhook-governance.md'),
          type: 'marker-text',
          content: generateGovernanceRules(workspaceDir)
        }
      ]
    };
  }

  async inject(workspaceDir, options = {}) {
    const mcpConfigPath = path.join(workspaceDir, '.agents/mcp_config.json');
    const rulesPath = path.join(workspaceDir, '.agents/rules/skyhook-governance.md');
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const modifiedFiles = [];
    const actions = [];

    // 1. Merge into .agents/mcp_config.json
    mergeJsonFile(mcpConfigPath, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, mcpServers: servers };
    });
    modifiedFiles.push(mcpConfigPath);
    actions.push('Configured Skyhook MCP server in .agents/mcp_config.json');

    // 2. Inject rules into .agents/rules/skyhook-governance.md
    injectMarkerBlock(rulesPath, generateGovernanceRules(workspaceDir));
    modifiedFiles.push(rulesPath);
    actions.push('Injected Skyhook governance rules into .agents/rules/skyhook-governance.md');

    return { success: true, modifiedFiles, actions };
  }

  async remove(workspaceDir, options = {}) {
    const mcpConfigPath = path.join(workspaceDir, '.agents/mcp_config.json');
    const rulesPath = path.join(workspaceDir, '.agents/rules/skyhook-governance.md');
    const removedFiles = [];
    const restoredFiles = [];

    if (fs.existsSync(mcpConfigPath)) {
      const data = readJsonSafe(mcpConfigPath);
      if (data.mcpServers && data.mcpServers.skyhook) {
        delete data.mcpServers.skyhook;
        if (Object.keys(data.mcpServers).length === 0 && Object.keys(data).length === 1) {
          fs.unlinkSync(mcpConfigPath);
          removedFiles.push(mcpConfigPath);
        } else {
          atomicWriteFile(mcpConfigPath, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(mcpConfigPath);
        }
      }
    }

    if (fs.existsSync(rulesPath)) {
      const removed = removeMarkerBlock(rulesPath, true);
      if (removed) {
        if (!fs.existsSync(rulesPath)) removedFiles.push(rulesPath);
        else restoredFiles.push(rulesPath);
      }
    }

    return { success: true, removedFiles, restoredFiles };
  }

  async status(workspaceDir) {
    const mcpConfigPath = path.join(workspaceDir, '.agents/mcp_config.json');
    const rulesPath = path.join(workspaceDir, '.agents/rules/skyhook-governance.md');

    let hasMcp = false;
    let hasRules = false;

    if (fs.existsSync(mcpConfigPath)) {
      const data = readJsonSafe(mcpConfigPath);
      hasMcp = !!(data.mcpServers && data.mcpServers.skyhook);
    }
    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, 'utf-8');
      hasRules = content.includes(MARKER_START);
    }

    if (hasMcp && hasRules) {
      return { status: 'injected', details: { mcp: true, rules: true } };
    }
    if (hasMcp || hasRules) {
      return { status: 'partial', details: { mcp: hasMcp, rules: hasRules } };
    }
    return { status: 'not_injected', details: { mcp: false, rules: false } };
  }
}
