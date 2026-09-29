/**
 * ClaudeCodeHarness - Anthropic Claude Code CLI Harness Plugin
 * Injects CLAUDE.md governance rules and .claude/config.json MCP settings
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

export class ClaudeCodeHarness extends BaseAgentHarness {
  get id() {
    return 'claude-code';
  }

  get name() {
    return 'Claude Code';
  }

  get vendor() {
    return 'Anthropic';
  }

  get description() {
    return 'Injects governance rules into CLAUDE.md and MCP settings into .claude/config.json';
  }

  getTargetPaths(workspaceDir) {
    return [
      path.join(workspaceDir, 'CLAUDE.md'),
      path.join(workspaceDir, '.claude/config.json')
    ];
  }

  async detect(workspaceDir, options = {}) {
    const claudeMd = path.join(workspaceDir, 'CLAUDE.md');
    const claudeDir = path.join(workspaceDir, '.claude');
    const reasons = [];
    const paths = [];

    if (fs.existsSync(claudeMd)) {
      reasons.push('Found CLAUDE.md in workspace');
      paths.push(claudeMd);
    }
    if (fs.existsSync(claudeDir)) {
      reasons.push('Found .claude directory in workspace');
      paths.push(claudeDir);
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
          path: path.join(workspaceDir, 'CLAUDE.md'),
          type: 'marker-text',
          content: generateGovernanceRules(workspaceDir)
        },
        {
          path: path.join(workspaceDir, '.claude/config.json'),
          type: 'merge-json',
          content: JSON.stringify({
            mcpServers: {
              skyhook: {
                command: 'node',
                args: [mcpBin, '--dir', workspaceDir]
              }
            }
          }, null, 2)
        }
      ]
    };
  }

  async inject(workspaceDir, options = {}) {
    const claudeMd = path.join(workspaceDir, 'CLAUDE.md');
    const claudeConfig = path.join(workspaceDir, '.claude/config.json');
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const modifiedFiles = [];
    const actions = [];

    // 1. Inject rules into CLAUDE.md
    injectMarkerBlock(claudeMd, generateGovernanceRules(workspaceDir));
    modifiedFiles.push(claudeMd);
    actions.push('Injected Skyhook governance rules into CLAUDE.md');

    // 2. Merge config into .claude/config.json
    mergeJsonFile(claudeConfig, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, mcpServers: servers };
    });
    modifiedFiles.push(claudeConfig);
    actions.push('Configured Skyhook MCP server in .claude/config.json');

    return { success: true, modifiedFiles, actions };
  }

  async remove(workspaceDir, options = {}) {
    const claudeMd = path.join(workspaceDir, 'CLAUDE.md');
    const claudeConfig = path.join(workspaceDir, '.claude/config.json');
    const removedFiles = [];
    const restoredFiles = [];

    if (fs.existsSync(claudeMd)) {
      const removed = removeMarkerBlock(claudeMd, true);
      if (removed) {
        if (!fs.existsSync(claudeMd)) removedFiles.push(claudeMd);
        else restoredFiles.push(claudeMd);
      }
    }

    if (fs.existsSync(claudeConfig)) {
      const data = readJsonSafe(claudeConfig);
      if (data.mcpServers && data.mcpServers.skyhook) {
        delete data.mcpServers.skyhook;
        if (Object.keys(data.mcpServers).length === 0 && Object.keys(data).length === 1) {
          fs.unlinkSync(claudeConfig);
          removedFiles.push(claudeConfig);
        } else {
          atomicWriteFile(claudeConfig, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(claudeConfig);
        }
      }
    }

    return { success: true, removedFiles, restoredFiles };
  }

  async status(workspaceDir) {
    const claudeMd = path.join(workspaceDir, 'CLAUDE.md');
    const claudeConfig = path.join(workspaceDir, '.claude/config.json');

    let hasRules = false;
    let hasMcp = false;

    if (fs.existsSync(claudeMd)) {
      const content = fs.readFileSync(claudeMd, 'utf-8');
      hasRules = content.includes(MARKER_START);
    }
    if (fs.existsSync(claudeConfig)) {
      const data = readJsonSafe(claudeConfig);
      hasMcp = !!(data.mcpServers && data.mcpServers.skyhook);
    }

    if (hasRules && hasMcp) {
      return { status: 'injected', details: { rules: true, mcp: true } };
    }
    if (hasRules || hasMcp) {
      return { status: 'partial', details: { rules: hasRules, mcp: hasMcp } };
    }
    return { status: 'not_injected', details: { rules: false, mcp: false } };
  }
}
