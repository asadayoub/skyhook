/**
 * ClaudeDesktopHarness - Claude Desktop App Harness Plugin
 * Injects MCP server configuration into claude_desktop_config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { BaseAgentHarness } from '../BaseAgentHarness.js';
import {
  resolveSkyhookMcpBin,
  mergeJsonFile,
  readJsonSafe,
  atomicWriteFile
} from '../HarnessUtils.js';

export class ClaudeDesktopHarness extends BaseAgentHarness {
  get id() {
    return 'claude-desktop';
  }

  get name() {
    return 'Claude Desktop';
  }

  get vendor() {
    return 'Anthropic';
  }

  get description() {
    return 'Registers Skyhook as an MCP stdio server in claude_desktop_config.json';
  }

  getConfigPath(options = {}) {
    if (options.configPath) return options.configPath;

    const platform = process.platform;
    const home = os.homedir();

    if (platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'Claude', 'claude_desktop_config.json');
    }
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }

  getTargetPaths(workspaceDir, options = {}) {
    return [this.getConfigPath(options)];
  }

  async detect(workspaceDir, options = {}) {
    const configPath = this.getConfigPath(options);
    const parentDir = path.dirname(configPath);
    const reasons = [];
    const paths = [];

    if (fs.existsSync(configPath)) {
      reasons.push('Found existing claude_desktop_config.json');
      paths.push(configPath);
    } else if (fs.existsSync(parentDir)) {
      reasons.push('Found Claude desktop application support directory');
      paths.push(parentDir);
    }

    return {
      detected: reasons.length > 0,
      reasons,
      paths
    };
  }

  async generateConfig(workspaceDir, options = {}) {
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const configPath = this.getConfigPath(options);

    return {
      files: [
        {
          path: configPath,
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
    const configPath = this.getConfigPath(options);
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);

    mergeJsonFile(configPath, (existing) => {
      const servers = existing.mcpServers || {};
      servers.skyhook = {
        command: 'node',
        args: [mcpBin, '--dir', workspaceDir]
      };
      return { ...existing, mcpServers: servers };
    });

    return {
      success: true,
      modifiedFiles: [configPath],
      actions: ['Merged Skyhook MCP stdio config into claude_desktop_config.json']
    };
  }

  async remove(workspaceDir, options = {}) {
    const configPath = this.getConfigPath(options);
    const removedFiles = [];
    const restoredFiles = [];

    if (fs.existsSync(configPath)) {
      const data = readJsonSafe(configPath);
      if (data.mcpServers && data.mcpServers.skyhook) {
        delete data.mcpServers.skyhook;
        if (Object.keys(data.mcpServers).length === 0 && Object.keys(data).length === 1) {
          fs.unlinkSync(configPath);
          removedFiles.push(configPath);
        } else {
          atomicWriteFile(configPath, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(configPath);
        }
      }
    }

    return { success: true, removedFiles, restoredFiles };
  }

  async status(workspaceDir, options = {}) {
    const configPath = this.getConfigPath(options);
    if (!fs.existsSync(configPath)) {
      return { status: 'not_injected', details: { fileExists: false, configPath } };
    }

    const data = readJsonSafe(configPath);
    const hasSkyhook = !!(data.mcpServers && data.mcpServers.skyhook);

    return {
      status: hasSkyhook ? 'injected' : 'not_injected',
      details: { fileExists: true, hasSkyhook, configPath }
    };
  }
}
