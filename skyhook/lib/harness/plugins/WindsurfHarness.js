/**
 * WindsurfHarness - Codeium Windsurf Harness Plugin
 * Injects .codeium/windsurf/mcp_config.json and .windsurfrules
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

export class WindsurfHarness extends BaseAgentHarness {
  get id() {
    return 'windsurf';
  }

  get name() {
    return 'Codeium Windsurf';
  }

  get vendor() {
    return 'Codeium';
  }

  get description() {
    return 'Configures Windsurf MCP server in .codeium/windsurf/mcp_config.json and rules in .windsurfrules';
  }

  getTargetPaths(workspaceDir) {
    return [
      path.join(workspaceDir, '.codeium/windsurf/mcp_config.json'),
      path.join(workspaceDir, '.windsurfrules')
    ];
  }

  async detect(workspaceDir, options = {}) {
    const codeiumDir = path.join(workspaceDir, '.codeium');
    const windsurfRules = path.join(workspaceDir, '.windsurfrules');
    const reasons = [];
    const paths = [];

    if (fs.existsSync(codeiumDir)) {
      reasons.push('Found .codeium directory in workspace');
      paths.push(codeiumDir);
    }
    if (fs.existsSync(windsurfRules)) {
      reasons.push('Found .windsurfrules in workspace');
      paths.push(windsurfRules);
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
          path: path.join(workspaceDir, '.codeium/windsurf/mcp_config.json'),
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
          path: path.join(workspaceDir, '.windsurfrules'),
          type: 'marker-text',
          content: generateGovernanceRules(workspaceDir)
        }
      ]
    };
  }

  async inject(workspaceDir, options = {}) {
    const mcpConfigPath = path.join(workspaceDir, '.codeium/windsurf/mcp_config.json');
    const rulesPath = path.join(workspaceDir, '.windsurfrules');
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const modifiedFiles = [];
    const actions = [];

    // 1. Merge into .codeium/windsurf/mcp_config.json
    mergeJsonFile(mcpConfigPath, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, mcpServers: servers };
    });
    modifiedFiles.push(mcpConfigPath);
    actions.push('Updated .codeium/windsurf/mcp_config.json with skyhook MCP server');

    // 2. Inject marker block into .windsurfrules
    injectMarkerBlock(rulesPath, generateGovernanceRules(workspaceDir));
    modifiedFiles.push(rulesPath);
    actions.push('Injected Skyhook governance rules into .windsurfrules');

    return { success: true, modifiedFiles, actions };
  }

  async remove(workspaceDir, options = {}) {
    const mcpConfigPath = path.join(workspaceDir, '.codeium/windsurf/mcp_config.json');
    const rulesPath = path.join(workspaceDir, '.windsurfrules');
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
    const mcpConfigPath = path.join(workspaceDir, '.codeium/windsurf/mcp_config.json');
    const rulesPath = path.join(workspaceDir, '.windsurfrules');

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
