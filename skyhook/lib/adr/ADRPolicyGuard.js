/**
 * ADR Policy Guard
 * Enforces accepted architectural decisions against the codebase using AST / import scanning.
 * "Decisions with Teeth"
 */

import fs from 'fs';
import path from 'path';
import { ASTImportGraph } from '../drift/ASTImportGraph.js';
import { loadProjectIgnoreRules } from '../utils.js';

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

    const graph = new ASTImportGraph(this.projectDir);
    await graph.build();
    const sourceFiles = Array.from(graph.nodes.keys());
    const violations = [];

    for (const policy of activePolicies) {
      for (const edge of graph.edges) {
        const relPath = edge.from;

        // 1. Prohibited Imports Check
        if (policy.prohibitedImports && Array.isArray(policy.prohibitedImports)) {
          if (policy.exceptIn && this.matchesGlobOrDir(relPath, policy.exceptIn)) {
            continue;
          }

          for (const prohibited of policy.prohibitedImports) {
            if (edge.specifier === prohibited || edge.to === prohibited || edge.specifier.includes(prohibited)) {
              violations.push({
                adrId: policy.adrId,
                adrTitle: policy.adrTitle,
                ruleType: 'prohibited-import',
                file: relPath,
                line: edge.line || 1,
                lineContent: `import from '${edge.specifier}'`,
                message: policy.violationMessage || `Import of '${prohibited}' is prohibited by ${policy.adrId} (${policy.adrTitle})`
              });
              break;
            }
          }
        }

        // 2. Directory Boundary Check (e.g. controllers cannot import DB directly)
        if (policy.restrictDir && policy.forbiddenInDir) {
          if (this.matchesGlobOrDir(relPath, policy.forbiddenInDir)) {
            for (const forbidden of policy.forbiddenImports || []) {
              if (edge.specifier.includes(forbidden) || (edge.to && edge.to.includes(forbidden))) {
                violations.push({
                  adrId: policy.adrId,
                  adrTitle: policy.adrTitle,
                  ruleType: 'boundary-violation',
                  file: relPath,
                  line: edge.line || 1,
                  lineContent: `import from '${edge.specifier}'`,
                  message: policy.violationMessage || `Directory '${policy.forbiddenInDir}' cannot import '${forbidden}' per ${policy.adrId}`
                });
                break;
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
    const filter = loadProjectIgnoreRules(this.projectDir);

    function scan(current, projectDir) {
      if (!fs.existsSync(current)) return;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');
        if (filter.shouldIgnore(entry.name, relPath, entry.isDirectory())) {
          continue;
        }

        if (entry.isDirectory()) {
          scan(fullPath, projectDir);
        } else if (entry.isFile()) {
          if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
            results.push(fullPath);
          }
        }
      }
    }

    scan(dir, this.projectDir);
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
