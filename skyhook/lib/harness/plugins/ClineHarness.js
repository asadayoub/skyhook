/**
 * ClineHarness - Cline / Roo Code Agent Harness Plugin
 * Injects .clinerules and Cline MCP settings
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
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

export class ClineHarness extends BaseAgentHarness {
  get id() {
    return 'cline';
  }

  get name() {
    return 'Cline';
  }

  get vendor() {
    return 'Cline / Roo Code';
  }

  get description() {
    return 'Injects Skyhook governance rules into .clinerules and configures Cline MCP server settings';
  }

  getClineMcpSettingsPath(options = {}) {
    if (options.mcpSettingsPath) return options.mcpSettingsPath;

    const home = os.homedir();
    const platform = process.platform;

    if (platform === 'darwin') {
      return path.join(
        home,
        'Library',
        'Application Support',
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json'
      );
    }
    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(
        appData,
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json'
      );
    }
    return path.join(
      home,
      '.config',
      'Code',
      'User',
      'globalStorage',
      'saoudrizwan.claude-dev',
      'settings',
      'cline_mcp_settings.json'
    );
  }

  getTargetPaths(workspaceDir, options = {}) {
    return [
      path.join(workspaceDir, '.clinerules'),
      this.getClineMcpSettingsPath(options)
    ];
  }

  async detect(workspaceDir, options = {}) {
    const clineRules = path.join(workspaceDir, '.clinerules');
    const rooModes = path.join(workspaceDir, '.roomodes');
    const mcpSettings = this.getClineMcpSettingsPath(options);
    const reasons = [];
    const paths = [];

    if (fs.existsSync(clineRules)) {
      reasons.push('Found .clinerules in workspace');
      paths.push(clineRules);
    }
    if (fs.existsSync(rooModes)) {
      reasons.push('Found .roomodes in workspace');
      paths.push(rooModes);
    }
    if (fs.existsSync(mcpSettings)) {
      reasons.push('Found Cline global MCP settings configuration');
      paths.push(mcpSettings);
    }

    return {
      detected: reasons.length > 0,
      reasons,
      paths
    };
  }

  async generateConfig(workspaceDir, options = {}) {
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const mcpSettings = this.getClineMcpSettingsPath(options);

    return {
      files: [
        {
          path: path.join(workspaceDir, '.clinerules'),
          type: 'marker-text',
          content: generateGovernanceRules(workspaceDir)
        },
        {
          path: mcpSettings,
          type: 'merge-json',
          content: JSON.stringify({
            mcpServers: {
              skyhook: {
                command: 'node',
                args: [mcpBin, '--dir', workspaceDir],
                disabled: false,
                autoApprove: []
              }
            }
          }, null, 2)
        }
      ]
    };
  }

  async inject(workspaceDir, options = {}) {
    const clineRules = path.join(workspaceDir, '.clinerules');
    const mcpSettings = this.getClineMcpSettingsPath(options);
    const mcpBin = resolveSkyhookMcpBin(workspaceDir);
    const modifiedFiles = [];
    const actions = [];

    // 1. Inject rules into .clinerules
    injectMarkerBlock(clineRules, generateGovernanceRules(workspaceDir));
    modifiedFiles.push(clineRules);
    actions.push('Injected Skyhook governance rules into .clinerules');

    // 2. Merge into Cline MCP settings if parent dir exists or forced
    if (options.forceGlobalMcp || fs.existsSync(path.dirname(mcpSettings))) {
      mergeJsonFile(mcpSettings, (existing) => {
        const servers = existing.mcpServers || {};
        servers.skyhook = {
          command: 'node',
          args: [mcpBin, '--dir', workspaceDir],
          disabled: false,
          autoApprove: []
        };
        return { ...existing, mcpServers: servers };
      });
      modifiedFiles.push(mcpSettings);
      actions.push('Configured Skyhook MCP server in cline_mcp_settings.json');
    }

    return { success: true, modifiedFiles, actions };
  }

  async remove(workspaceDir, options = {}) {
    const clineRules = path.join(workspaceDir, '.clinerules');
    const mcpSettings = this.getClineMcpSettingsPath(options);
    const removedFiles = [];
    const restoredFiles = [];

    if (fs.existsSync(clineRules)) {
      const removed = removeMarkerBlock(clineRules, true);
      if (removed) {
        if (!fs.existsSync(clineRules)) removedFiles.push(clineRules);
        else restoredFiles.push(clineRules);
      }
    }

    if (fs.existsSync(mcpSettings)) {
      const data = readJsonSafe(mcpSettings);
      if (data.mcpServers && data.mcpServers.skyhook) {
        delete data.mcpServers.skyhook;
        if (Object.keys(data.mcpServers).length === 0 && Object.keys(data).length === 1) {
          fs.unlinkSync(mcpSettings);
          removedFiles.push(mcpSettings);
        } else {
          atomicWriteFile(mcpSettings, JSON.stringify(data, null, 2) + '\n');
          restoredFiles.push(mcpSettings);
        }
      }
    }

    return { success: true, removedFiles, restoredFiles };
  }

  async status(workspaceDir, options = {}) {
    const clineRules = path.join(workspaceDir, '.clinerules');
    const mcpSettings = this.getClineMcpSettingsPath(options);

    let hasRules = false;
    let hasMcp = false;

    if (fs.existsSync(clineRules)) {
      const content = fs.readFileSync(clineRules, 'utf-8');
      hasRules = content.includes(MARKER_START);
    }
    if (fs.existsSync(mcpSettings)) {
      const data = readJsonSafe(mcpSettings);
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
