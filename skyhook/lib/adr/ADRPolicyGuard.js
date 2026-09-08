/**
 * ADR Policy Guard
 * Enforces accepted architectural decisions against the codebase using AST / import scanning.
 * "Decisions with Teeth"
 */

import fs from 'fs';
import path from 'path';

export class ADRPolicyGuard {
  constructor(skyhookDir, projectDir = process.cwd()) {
    this.skyhookDir = skyhookDir;
    this.projectDir = projectDir;
  }

  /**
   * Run policy verification against all accepted ADRs
   * @param {Array} decisions - List of decisions from index.yaml or context
   * @returns {Object} Verification results with passed status and violations
   */
  async verifyPolicies(decisions = []) {
    const activePolicies = [];

    // Extract enforcement rules from decisions
    for (const decision of decisions) {
      if (decision.status === 'accepted' && decision.enforcement && decision.enforcement.rules) {
        for (const rule of decision.enforcement.rules) {
          activePolicies.push({
            adrId: decision.id,
            adrTitle: decision.title,
            ...rule
          });
        }
      }
    }

    if (activePolicies.length === 0) {
      return {
        passed: true,
        policiesCount: 0,
        violations: [],
        message: 'No active ADR enforcement policies found.'
      };
    }

    const sourceFiles = this.findSourceFiles(this.projectDir);
    const violations = [];

    for (const file of sourceFiles) {
      const relPath = path.relative(this.projectDir, file);
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (const policy of activePolicies) {
        // 1. Prohibited Imports Check
        if (policy.prohibitedImports && Array.isArray(policy.prohibitedImports)) {
          // Check if this file is excluded/excepted
          if (policy.exceptIn && this.matchesGlobOrDir(relPath, policy.exceptIn)) {
            continue;
          }

          for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            for (const prohibited of policy.prohibitedImports) {
              // Matches: import ... from 'prohibited' or require('prohibited')
              const importRegex = new RegExp(`(?:from\\s+['"\`]${prohibited}['"\`]|require\\(['"\`]${prohibited}['"\`])`);
              if (importRegex.test(line)) {
                violations.push({
                  adrId: policy.adrId,
                  adrTitle: policy.adrTitle,
                  ruleType: 'prohibited-import',
                  file: relPath,
                  line: lineNum + 1,
                  lineContent: line.trim(),
                  message: policy.violationMessage || `Import of '${prohibited}' is prohibited by ${policy.adrId} (${policy.adrTitle})`
                });
              }
            }
          }
        }

        // 2. Directory Boundary Check (e.g. controllers cannot import DB directly)
        if (policy.restrictDir && policy.forbiddenInDir) {
          if (this.matchesGlobOrDir(relPath, policy.forbiddenInDir)) {
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
              const line = lines[lineNum];
              for (const forbidden of policy.forbiddenImports || []) {
                const importRegex = new RegExp(`(?:from\\s+['"\`].*${forbidden}.*['"\`]|require\\(['"\`].*${forbidden}.*['"\`])`);
                if (importRegex.test(line)) {
                  violations.push({
                    adrId: policy.adrId,
                    adrTitle: policy.adrTitle,
                    ruleType: 'boundary-violation',
                    file: relPath,
                    line: lineNum + 1,
                    lineContent: line.trim(),
                    message: policy.violationMessage || `Directory '${policy.forbiddenInDir}' cannot import '${forbidden}' per ${policy.adrId}`
                  });
                }
              }
            }
          }
        }
      }
    }

    return {
      passed: violations.length === 0,
      policiesCount: activePolicies.length,
      filesScanned: sourceFiles.length,
      violations
    };
  }

  /**
   * Helper to find all relevant source files
   */
  findSourceFiles(dir) {
    const results = [];
    const ignoreDirs = new Set(['node_modules', '.git', '.skyhook', 'dist', 'build', '.next', 'coverage']);

    function scan(current) {
      if (!fs.existsSync(current)) return;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name)) {
            scan(path.join(current, entry.name));
          }
        } else if (entry.isFile()) {
          if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
            results.push(path.join(current, entry.name));
          }
        }
      }
    }

    scan(dir);
    return results;
  }

  /**
   * Helper to check if file matches a path pattern or prefix
   */
  matchesGlobOrDir(filePath, patterns) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    const normalized = filePath.replace(/\\/g, '/');

    return list.some(pat => {
      const cleanPat = pat.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\\/g, '/');
      return normalized.includes(cleanPat);
    });
  }
}
