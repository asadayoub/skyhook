/**
 * HarnessInjector - Orchestrates AI agent harness configuration injection and uninstallation
 * Maintains atomic manifest in .skyhook/harness-manifest.json.
 * 100% offline, safe non-destructive merging.
 */

import fs from 'fs';
import path from 'path';
import { AgentHarnessRegistry } from './AgentHarnessRegistry.js';
import { AgentDetector } from './AgentDetector.js';
import { readJsonSafe, atomicWriteFile } from './HarnessUtils.js';

export class HarnessInjector {
  /**
   * @param {Object} [options]
   * @param {AgentHarnessRegistry} [options.registry]
   */
  constructor(options = {}) {
    this.registry = options.registry || AgentHarnessRegistry.createDefault();
    this.detector = new AgentDetector(this.registry);
  }

  /**
   * Get manifest file path in workspace
   * @param {string} workspaceDir
   * @returns {string}
   */
  getManifestPath(workspaceDir) {
    return path.join(workspaceDir, '.skyhook', 'harness-manifest.json');
  }

  /**
   * Read harness manifest from .skyhook/harness-manifest.json
   * @param {string} workspaceDir
   * @returns {Object}
   */
  readManifest(workspaceDir) {
    const manifestPath = this.getManifestPath(workspaceDir);
    return readJsonSafe(manifestPath);
  }

  /**
   * Write harness manifest
   * @param {string} workspaceDir
   * @param {Object} manifest
   */
  writeManifest(workspaceDir, manifest) {
    const manifestPath = this.getManifestPath(workspaceDir);
    const skyhookDir = path.dirname(manifestPath);
    if (!fs.existsSync(skyhookDir)) {
      fs.mkdirSync(skyhookDir, { recursive: true });
    }
    atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  /**
   * Inject configuration into targeted agents
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @param {string|string[]} [options.targets='auto'] - 'auto', 'all', or array of IDs
   * @param {boolean} [options.dryRun=false]
   * @param {boolean} [options.force=false]
   * @returns {Promise<{
   *   success: boolean,
   *   injected: Array<{ id: string, name: string, modifiedFiles: string[], actions: string[] }>,
   *   skipped: Array<{ id: string, reason: string }>,
   *   dryRun: boolean
   * }>}
   */
  async inject(workspaceDir, options = {}) {
    const dryRun = !!options.dryRun;
    let targetList = [];

    const rawTargets = options.targets || options.target || 'auto';
    const targetArray = Array.isArray(rawTargets) ? rawTargets : [rawTargets];

    if (targetArray.includes('all')) {
      targetList = this.registry.list();
    } else if (targetArray.includes('auto')) {
      const scanResult = await this.detector.scan(workspaceDir, options);
      const detectedIds = new Set(scanResult.detectedAgents.map(a => a.id));
      targetList = this.registry.list().filter(h => detectedIds.has(h.id));
      // If none detected automatically, return info
      if (targetList.length === 0) {
        return {
          success: true,
          injected: [],
          skipped: this.registry.list().map(h => ({ id: h.id, reason: 'No editor or configuration signature detected' })),
          dryRun,
          message: 'No supported agents were automatically detected. Specify --target <agent> or --all to force injection.'
        };
      }
    } else {
      for (const id of targetArray) {
        const harness = this.registry.get(id);
        if (harness) {
          targetList.push(harness);
        }
      }
    }

    const injected = [];
    const skipped = [];
    const manifest = this.readManifest(workspaceDir);
    const activeInjections = manifest.injectedHarnesses || {};

    for (const harness of targetList) {
      if (dryRun) {
        const configPlan = await harness.generateConfig(workspaceDir, options);
        injected.push({
          id: harness.id,
          name: harness.name,
          vendor: harness.vendor,
          plannedFiles: configPlan.files.map(f => f.path),
          actions: [`Would configure ${harness.name} (${configPlan.files.length} files)`]
        });
        continue;
      }

      try {
        const res = await harness.inject(workspaceDir, options);
        if (res.success) {
          injected.push({
            id: harness.id,
            name: harness.name,
            vendor: harness.vendor,
            modifiedFiles: res.modifiedFiles,
            actions: res.actions
          });
          activeInjections[harness.id] = {
            name: harness.name,
            injectedAt: new Date().toISOString(),
            files: res.modifiedFiles
          };
        }
      } catch (err) {
        skipped.push({ id: harness.id, reason: err.message });
      }
    }

    if (!dryRun) {
      manifest.lastUpdated = new Date().toISOString();
      manifest.injectedHarnesses = activeInjections;
      this.writeManifest(workspaceDir, manifest);
    }

    return {
      success: true,
      injected,
      skipped,
      dryRun
    };
  }

  /**
   * Remove Skyhook configurations from targeted agents
   * @param {string} workspaceDir
   * @param {Object} [options]
   * @param {string|string[]} [options.targets='all']
   * @returns {Promise<{
   *   success: boolean,
   *   removed: Array<{ id: string, name: string, removedFiles: string[], restoredFiles: string[] }>,
   *   skipped: Array<{ id: string, reason: string }>
   * }>}
   */
  async remove(workspaceDir, options = {}) {
    const rawTargets = options.targets || options.target || 'all';
    const targetArray = Array.isArray(rawTargets) ? rawTargets : [rawTargets];

    let targetList = [];
    if (targetArray.includes('all')) {
      targetList = this.registry.list();
    } else {
      for (const id of targetArray) {
        const harness = this.registry.get(id);
        if (harness) targetList.push(harness);
      }
    }

    const removed = [];
    const skipped = [];
    const manifest = this.readManifest(workspaceDir);
    const activeInjections = manifest.injectedHarnesses || {};

    for (const harness of targetList) {
      try {
        const res = await harness.remove(workspaceDir, options);
        if (res.success) {
          removed.push({
            id: harness.id,
            name: harness.name,
            removedFiles: res.removedFiles,
            restoredFiles: res.restoredFiles
          });
          delete activeInjections[harness.id];
        }
      } catch (err) {
        skipped.push({ id: harness.id, reason: err.message });
      }
    }

    manifest.lastUpdated = new Date().toISOString();
    manifest.injectedHarnesses = activeInjections;
    this.writeManifest(workspaceDir, manifest);

    return {
      success: true,
      removed,
      skipped
    };
  }

  /**
   * Get injection status across all harnesses
   * @param {string} workspaceDir
   * @returns {Promise<{
   *   harnesses: Array<{ id: string, name: string, vendor: string, status: string, details: Object }>,
   *   injectedCount: number,
   *   totalCount: number
   * }>}
   */
  async status(workspaceDir) {
    const harnesses = [];
    let injectedCount = 0;

    for (const harness of this.registry.list()) {
      const st = await harness.status(workspaceDir);
      if (st.status === 'injected') injectedCount++;
      harnesses.push({
        id: harness.id,
        name: harness.name,
        vendor: harness.vendor,
        ...st
      });
    }

    return {
      harnesses,
      injectedCount,
      totalCount: harnesses.length
    };
  }

  /**
   * Synchronize rule files across all currently active/injected harnesses
   * @param {Object} ctx - SkyhookContext
   * @returns {Promise<{ syncedHarnesses: string[], count: number }>}
   */
  async syncRules(ctx) {
    const workspaceDir = ctx.projectDir || process.cwd();
    const manifest = this.readManifest(workspaceDir);
    const active = manifest.injectedHarnesses || {};
    const syncedHarnesses = [];

    for (const id of Object.keys(active)) {
      const harness = this.registry.get(id);
      if (harness) {
        try {
          await harness.inject(workspaceDir);
          syncedHarnesses.push(id);
        } catch (_) {}
      }
    }

    return {
      syncedHarnesses,
      count: syncedHarnesses.length
    };
  }
}
