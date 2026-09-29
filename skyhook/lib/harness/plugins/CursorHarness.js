/**
 * CursorHarness - Cursor AI Editor Harness Plugin
 * Injects .cursor/mcp.json and .cursorrules
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

export class CursorHarness extends BaseAgentHarness {
  get id() {
    return 'cursor';
  }

  get name() {
    return 'Cursor AI';
  }

  get vendor() {
    return 'Anysphere';
  }

  get description() {
    return 'Configures Cursor MCP stdio client in .cursor/mcp.json and governance rules in .cursorrules';
  }

  getTargetPaths(workspaceDir) {
    return [
      path.join(workspaceDir, '.cursor/mcp.json'),
      path.join(workspaceDir, '.cursorrules')
    ];
  }

  async detect(workspaceDir, options = {}) {
    const reasons = [];
    const paths = [];

    const cursorDir = path.join(workspaceDir, '.cursor');
    const cursorRules = path.join(workspaceDir, '.cursorrules');

    if (fs.existsSync(cursorDir)) {
      reasons.push('Found .cursor directory in workspace');
      paths.push(cursorDir);
    }
    if (fs.existsSync(cursorRules)) {
      reasons.push('Found .cursorrules in workspace');
      paths.push(cursorRules);
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
          path: path.join(workspaceDir, '.cursor/mcp.json'),
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
          path: path.join(workspaceDir, '.cursorrules'),
          type: 'marker-text',
          content: generateGovernanceRules(workspaceDir)
        }
      ]
    };
  }

  async inject(workspaceDir, options = {}) {
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const mcpJsonPath = path.join(workspaceDir, '.cursor/mcp.json');
    const cursorRulesPath = path.join(workspaceDir, '.cursorrules');
    const modifiedFiles = [];
    const actions = [];

    // 1. Merge into .cursor/mcp.json
    mergeJsonFile(mcpJsonPath, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, mcpServers: servers };
    });
    modifiedFiles.push(mcpJsonPath);
    actions.push('Updated .cursor/mcp.json with skyhook MCP server');

    // 2. Inject marker block into .cursorrules
    injectMarkerBlock(cursorRulesPath, generateGovernanceRules(workspaceDir));
    modifiedFiles.push(cursorRulesPath);
    actions.push('Injected Skyhook governance rules into .cursorrules');

    return { success: true, modifiedFiles, actions };
  }

  async remove(workspaceDir, options = {}) {
    const mcpJsonPath = path.join(workspaceDir, '.cursor/mcp.json');
    const cursorRulesPath = path.join(workspaceDir, '.cursorrules');
    const removedFiles = [];
    const restoredFiles = [];

    if (fs.existsSync(mcpJsonPath)) {
      const data = readJsonSafe(mcpJsonPath);
      if (data.mcpServers && data.mcpServers.skyhook) {
        delete data.mcpServers.skyhook;
        if (Object.keys(data.mcpServers).length === 0 && Object.keys(data).length === 1) {
          fs.unlinkSync(mcpJsonPath);
          removedFiles.push(mcpJsonPath);
        } else {
          atomicWriteFile(mcpJsonPath, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(mcpJsonPath);
        }
      }
    }

    if (fs.existsSync(cursorRulesPath)) {
      const removed = removeMarkerBlock(cursorRulesPath, true);
      if (removed) {
        if (!fs.existsSync(cursorRulesPath)) {
          removedFiles.push(cursorRulesPath);
        } else {
          restoredFiles.push(cursorRulesPath);
        }
      }
    }

    return { success: true, removedFiles, restoredFiles };
  }

  async status(workspaceDir) {
    const mcpJsonPath = path.join(workspaceDir, '.cursor/mcp.json');
    const cursorRulesPath = path.join(workspaceDir, '.cursorrules');

    let hasMcp = false;
    let hasRules = false;

    if (fs.existsSync(mcpJsonPath)) {
      const data = readJsonSafe(mcpJsonPath);
      hasMcp = !!(data.mcpServers && data.mcpServers.skyhook);
    }

    if (fs.existsSync(cursorRulesPath)) {
      const content = fs.readFileSync(cursorRulesPath, 'utf-8');
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
