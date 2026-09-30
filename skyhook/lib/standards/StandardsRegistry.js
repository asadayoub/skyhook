/**
 * StandardsRegistry - Multi-tiered catalog, indexing, and resolution engine for engineering standards.
 * Supports:
 * - 1. Workspace Custom (.skyhook/standards/custom/*.yaml)
 * - 2. Workspace Installed Packages (.skyhook/standards/packages/*\/*.yaml)
 * - 3. Global User Standards (~/.skyhook/standards/*.yaml)
 * - 4. Built-in Core Library (skyhook/standards/definitions/**\/*.yaml)
 */

import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml } from '../yaml.js';
import { CLI_ROOT, SKYHOOK_ROOT } from '../utils.js';

export class StandardsRegistry {
  /**
   * Locate root directory of builtin standards definitions
   */
  static getBuiltinDefinitionsDir() {
    const candidate1 = path.join(CLI_ROOT, 'standards', 'definitions');
    if (fs.existsSync(candidate1)) return candidate1;

    const candidate2 = path.join(SKYHOOK_ROOT, 'standards', 'definitions');
    if (fs.existsSync(candidate2)) return candidate2;

    return null;
  }

  /**
   * Recursively scan directory for .yaml files
   */
  static scanYamlFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.scanYamlFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * Load and index all standards across all discovery tiers
   * @param {string} [projectDir=process.cwd()]
   * @returns {Array<Object>} List of resolved standard definitions with source metadata
   */
  static loadAll(projectDir = process.cwd()) {
    const standardsMap = new Map();

    const home = process.env.HOME || process.env.USERPROFILE || '';
    const tiers = [
      {
        source: 'builtin',
        tier: 'builtin',
        dir: this.getBuiltinDefinitionsDir()
      },
      {
        source: 'global',
        tier: 'user-global',
        dir: home ? path.join(home, '.skyhook', 'standards') : null
      },
      {
        source: 'package',
        tier: 'workspace-package',
        dir: path.join(projectDir, '.skyhook', 'standards', 'packages')
      },
      {
        source: 'custom',
        tier: 'workspace-custom',
        dir: path.join(projectDir, '.skyhook', 'standards', 'custom')
      }
    ];

    for (const tier of tiers) {
      if (!tier.dir || !fs.existsSync(tier.dir)) continue;

      const files = this.scanYamlFiles(tier.dir);
      for (const filePath of files) {
        try {
          const standard = readYaml(filePath);
          if (standard && standard.id) {
            standardsMap.set(standard.id, {
              ...standard,
              tier: tier.tier,
              _source: tier.source,
              _filePath: filePath
            });
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    return Array.from(standardsMap.values());
  }

  /**
   * Get a single standard by canonical ID (e.g. 'STD-SEC-001')
   * @param {string} id
   * @param {string} [projectDir=process.cwd()]
   * @returns {Object|null}
   */
  static getStandard(id, projectDir = process.cwd()) {
    if (!id) return null;
    const cleanId = String(id).trim().toUpperCase();
    const all = this.loadAll(projectDir);
    return all.find(s => s.id.toUpperCase() === cleanId) || null;
  }

  /**
   * Query standards by domain, tag, or category
   * @param {Object} [filter={}]
   * @param {string} [projectDir=process.cwd()]
   * @returns {Array<Object>}
   */
  static listStandards(filter = {}, projectDir = process.cwd()) {
    let standards = this.loadAll(projectDir);

    if (filter.domain) {
      const dom = filter.domain.toLowerCase();
      standards = standards.filter(s => (s.domain || '').toLowerCase() === dom || (s.category || '').toLowerCase() === dom);
    }

    if (filter.category) {
      const cat = filter.category.toLowerCase();
      standards = standards.filter(s => (s.category || '').toLowerCase() === cat || (s.domain || '').toLowerCase() === cat);
    }

    if (filter.severity) {
      const sev = filter.severity.toLowerCase();
      standards = standards.filter(s => (s.severity || '').toLowerCase() === sev);
    }

    if (filter.tag) {
      const tag = filter.tag.toLowerCase();
      standards = standards.filter(s => (s.tags || []).some(t => t.toLowerCase() === tag));
    }

    if (filter.search) {
      const term = filter.search.toLowerCase();
      standards = standards.filter(s => 
        s.id.toLowerCase().includes(term) ||
        (s.title || '').toLowerCase().includes(term) ||
        (s.summary || '').toLowerCase().includes(term) ||
        (s.tags || []).some(t => t.toLowerCase().includes(term))
      );
    }

    return standards;
  }

  /**
   * Save a new custom standard into the workspace (.skyhook/standards/custom/<id>.yaml)
   * @param {string} projectDir
   * @param {Object} standardData
   * @returns {Object} Created standard details
   */
  static saveCustomStandard(projectDir, standardData) {
    if (!standardData || !standardData.id) {
      throw new Error('Standard must define an "id" field (e.g. STD-CUSTOM-001)');
    }

    const customDir = path.join(projectDir, '.skyhook', 'standards', 'custom');
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }

    const filename = `${standardData.id.toLowerCase()}.yaml`;
    const targetPath = path.join(customDir, filename);

    const standard = {
      schemaVersion: '1.0.0',
      id: standardData.id.toUpperCase(),
      title: standardData.title || 'Custom Engineering Standard',
      category: standardData.category || 'custom',
      domain: standardData.domain || 'project',
      tags: Array.isArray(standardData.tags) ? standardData.tags : ['custom'],
      severity: standardData.severity || 'error',
      version: standardData.version || '1.0.0',
      summary: standardData.summary || '',
      guidelines: Array.isArray(standardData.guidelines) ? standardData.guidelines : [],
      acceptanceCriteria: Array.isArray(standardData.acceptanceCriteria) ? standardData.acceptanceCriteria : [],
      automatedRules: Array.isArray(standardData.automatedRules) ? standardData.automatedRules : [],
      remediation: standardData.remediation || '',
      createdAt: new Date().toISOString()
    };

    writeYaml(targetPath, standard);
    return { success: true, standard, filePath: targetPath };
  }
}
