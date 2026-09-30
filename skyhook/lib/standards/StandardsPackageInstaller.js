/**
 * StandardsPackageInstaller - Installs, pulls, and scaffolds standards packages.
 * Manages .skyhook/standards/packages/ and .skyhook/standards/custom/
 */

import fs from 'fs';
import path from 'path';
import { StandardsRegistry } from './StandardsRegistry.js';

export class StandardsPackageInstaller {
  /**
   * Install standards from a local directory or pack
   * @param {string} sourcePath - Local directory containing standard YAML files
   * @param {string} projectDir - Target workspace
   * @param {string} [packName] - Optional namespace for the pack
   * @returns {Object} { success: true, count, targetDir }
   */
  static installFromDirectory(sourcePath, projectDir = process.cwd(), packName = '') {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Standards source directory not found: "${sourcePath}"`);
    }

    const name = packName || path.basename(sourcePath);
    const targetDir = path.join(projectDir, '.skyhook', 'standards', 'packages', name);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = StandardsRegistry.scanYamlFiles(sourcePath);
    if (files.length === 0) {
      throw new Error(`No standard YAML files found in "${sourcePath}"`);
    }

    let installedCount = 0;
    for (const file of files) {
      const destPath = path.join(targetDir, path.basename(file));
      fs.copyFileSync(file, destPath);
      installedCount++;
    }

    return {
      success: true,
      package: name,
      packName: name,
      installedCount,
      targetDir
    };
  }

  /**
   * Alias for installFromDirectory
   */
  static installPackage(sourcePath, projectDir = process.cwd(), packName = '') {
    return this.installFromDirectory(sourcePath, projectDir, packName);
  }

  /**
   * Scaffold a new standard template YAML in .skyhook/standards/custom/
   * @param {string|Object} projectDirOrOptions
   * @param {Object|string} [optionsOrProjectDir]
   * @returns {Object}
   */
  static scaffoldCustom(projectDir = process.cwd(), options = {}) {
    let targetProjectDir = projectDir;
    let opts = options;

    if (typeof projectDir === 'object' && projectDir !== null) {
      opts = projectDir;
      targetProjectDir = typeof options === 'string' ? options : process.cwd();
    }

    const id = (opts.id || 'STD-CUSTOM-001').toUpperCase();
    const title = opts.title || 'Custom Engineering Standard';
    const category = opts.category || 'custom';
    const severity = opts.severity || 'error';

    const saved = StandardsRegistry.saveCustomStandard(targetProjectDir, {
      id,
      title,
      category,
      domain: opts.domain || 'project',
      tags: opts.tags || ['custom', category],
      severity,
      summary: opts.summary || opts.description || `Mandates compliance with ${title} across project implementations.`,
      guidelines: Array.isArray(opts.guidelines) ? opts.guidelines : [
        `All code modifying ${category} components must adhere to ${title}.`,
        'Verify edge cases and document exceptions before deploying.'
      ],
      acceptanceCriteria: Array.isArray(opts.acceptanceCriteria) ? opts.acceptanceCriteria : [
        { id: 'AC-1', criterion: `Feature passes verification against ${id}.` }
      ],
      automatedRules: Array.isArray(opts.automatedRules) ? opts.automatedRules : [
        {
          ruleId: `${id.toLowerCase()}-check`,
          type: 'ast-pattern',
          pattern: opts.pattern || 'TODO_ADD_PATTERN',
          severity,
          message: `Violation of standard ${id}: ${title}`
        }
      ]
    });

    return {
      success: true,
      standard: saved.standard,
      filePath: saved.filePath,
      relativePath: path.relative(targetProjectDir, saved.filePath)
    };
  }

  /**
   * Alias for scaffoldCustom
   */
  static scaffoldCustomStandard(options, projectDir = process.cwd()) {
    return this.scaffoldCustom(projectDir, options);
  }
}
