/**
 * CopilotHarness - GitHub Copilot Harness Plugin
 * Injects .github/copilot-instructions.md and .vscode/settings.json
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

export class CopilotHarness extends BaseAgentHarness {
  get id() {
    return 'copilot';
  }

  get name() {
    return 'GitHub Copilot';
  }

  get vendor() {
    return 'GitHub';
  }

  get description() {
    return 'Injects rules into .github/copilot-instructions.md and workspace settings in .vscode/settings.json';
  }

  getTargetPaths(workspaceDir) {
    return [
      path.join(workspaceDir, '.github/copilot-instructions.md'),
      path.join(workspaceDir, '.vscode/mcp.json'),
      path.join(workspaceDir, '.vscode/settings.json')
    ];
  }

  async detect(workspaceDir, options = {}) {
    const githubDir = path.join(workspaceDir, '.github');
    const copilotMd = path.join(workspaceDir, '.github/copilot-instructions.md');
    const vscodeDir = path.join(workspaceDir, '.vscode');
    const mcpJson = path.join(workspaceDir, '.vscode/mcp.json');
    const reasons = [];
    const paths = [];

    if (fs.existsSync(copilotMd)) {
      reasons.push('Found .github/copilot-instructions.md in workspace');
      paths.push(copilotMd);
    } else if (fs.existsSync(githubDir)) {
      reasons.push('Found .github directory in workspace');
      paths.push(githubDir);
    }

    if (fs.existsSync(mcpJson)) {
      reasons.push('Found .vscode/mcp.json in workspace');
      paths.push(mcpJson);
    } else if (fs.existsSync(vscodeDir)) {
      reasons.push('Found .vscode directory in workspace');
      paths.push(vscodeDir);
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
          path: path.join(workspaceDir, '.github/copilot-instructions.md'),
          type: 'marker-text',
          content: generateGovernanceRules(workspaceDir)
        },
        {
          path: path.join(workspaceDir, '.vscode/mcp.json'),
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
          path: path.join(workspaceDir, '.vscode/settings.json'),
          type: 'merge-json',
          content: JSON.stringify({
            'github.copilot.chat.mcpServers': {
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
    const copilotMd = path.join(workspaceDir, '.github/copilot-instructions.md');
    const vscodeMcp = path.join(workspaceDir, '.vscode/mcp.json');
    const vscodeSettings = path.join(workspaceDir, '.vscode/settings.json');
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const modifiedFiles = [];
    const actions = [];

    // 1. Inject rules into .github/copilot-instructions.md
    injectMarkerBlock(copilotMd, generateGovernanceRules(workspaceDir));
    modifiedFiles.push(copilotMd);
    actions.push('Injected Skyhook governance rules into .github/copilot-instructions.md');

    // 2. Merge into .vscode/mcp.json (VS Code native MCP standard)
    mergeJsonFile(vscodeMcp, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, mcpServers: servers };
    });
    modifiedFiles.push(vscodeMcp);
    actions.push('Configured Skyhook MCP server in .vscode/mcp.json');

    // 3. Merge into .vscode/settings.json (Legacy Copilot setting support)
    mergeJsonFile(vscodeSettings, (existing) => {
      const servers = existing['github.copilot.chat.mcpServers'] || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, 'github.copilot.chat.mcpServers': servers };
    });
    modifiedFiles.push(vscodeSettings);
    actions.push('Configured Skyhook MCP server in .vscode/settings.json');

    return { success: true, modifiedFiles, actions };
  }

  async remove(workspaceDir, options = {}) {
    const copilotMd = path.join(workspaceDir, '.github/copilot-instructions.md');
    const vscodeMcp = path.join(workspaceDir, '.vscode/mcp.json');
    const vscodeSettings = path.join(workspaceDir, '.vscode/settings.json');
    const removedFiles = [];
    const restoredFiles = [];

    if (fs.existsSync(copilotMd)) {
      const removed = removeMarkerBlock(copilotMd, true);
      if (removed) {
        if (!fs.existsSync(copilotMd)) removedFiles.push(copilotMd);
        else restoredFiles.push(copilotMd);
      }
    }

    if (fs.existsSync(vscodeMcp)) {
      const data = readJsonSafe(vscodeMcp);
      if (data.mcpServers && data.mcpServers.skyhook) {
        delete data.mcpServers.skyhook;
        if (Object.keys(data.mcpServers).length === 0) {
          fs.unlinkSync(vscodeMcp);
          removedFiles.push(vscodeMcp);
        } else {
          atomicWriteFile(vscodeMcp, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(vscodeMcp);
        }
      }
    }

    if (fs.existsSync(vscodeSettings)) {
      const data = readJsonSafe(vscodeSettings);
      if (data['github.copilot.chat.mcpServers'] && data['github.copilot.chat.mcpServers'].skyhook) {
        delete data['github.copilot.chat.mcpServers'].skyhook;
        if (Object.keys(data['github.copilot.chat.mcpServers']).length === 0) {
          delete data['github.copilot.chat.mcpServers'];
        }
        if (Object.keys(data).length === 0) {
          fs.unlinkSync(vscodeSettings);
          removedFiles.push(vscodeSettings);
        } else {
          atomicWriteFile(vscodeSettings, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(vscodeSettings);
        }
      }
    }

    return { success: true, removedFiles, restoredFiles };
  }

  async status(workspaceDir) {
    const copilotMd = path.join(workspaceDir, '.github/copilot-instructions.md');
    const vscodeMcp = path.join(workspaceDir, '.vscode/mcp.json');
    const vscodeSettings = path.join(workspaceDir, '.vscode/settings.json');

    let hasRules = false;
    let hasMcp = false;

    if (fs.existsSync(copilotMd)) {
      const content = fs.readFileSync(copilotMd, 'utf-8');
      hasRules = content.includes(MARKER_START);
    }
    if (fs.existsSync(vscodeMcp)) {
      const data = readJsonSafe(vscodeMcp);
      if (data.mcpServers && data.mcpServers.skyhook) {
        hasMcp = true;
      }
    }
    if (!hasMcp && fs.existsSync(vscodeSettings)) {
      const data = readJsonSafe(vscodeSettings);
      hasMcp = !!(data['github.copilot.chat.mcpServers'] && data['github.copilot.chat.mcpServers'].skyhook);
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
