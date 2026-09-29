/**
 * ADRPolicyCompiler - Living ADR Policy Compiler
 * Compiles accepted architectural decisions into:
 * 1. .skyhook/architecture-boundaries.yaml (for ADRPolicyGuard & ArchitectureDriftEngine)
 * 2. ESLint no-restricted-imports rules (.skyhook/generated/eslint-adr-rules.json)
 * 3. CI Gate config (.skyhook/generated/adr-ci-gate.json)
 * Automatically excludes/deactivates superseded and deprecated ADR rules.
 */

import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml, getTimestamp } from '../utils.js';
import { ADRMarkdownParser } from './ADRMarkdownParser.js';

export class ADRPolicyCompiler {
  /**
   * @param {string} skyhookDir 
   * @param {string} [projectDir]
   */
  constructor(skyhookDir, projectDir = process.cwd()) {
    this.skyhookDir = path.resolve(skyhookDir);
    this.projectDir = path.resolve(projectDir);
    this.decisionsDir = path.join(this.skyhookDir, 'decisions');
    this.recordsDir = path.join(this.decisionsDir, 'records');
    this.indexPath = path.join(this.decisionsDir, 'index.yaml');
    this.boundariesPath = path.join(this.skyhookDir, 'architecture-boundaries.yaml');
    this.generatedDir = path.join(this.skyhookDir, 'generated');
    this.eslintPath = path.join(this.generatedDir, 'eslint-adr-rules.json');
    this.ciGatePath = path.join(this.generatedDir, 'adr-ci-gate.json');
    this.parser = new ADRMarkdownParser();
  }

  /**
   * Extract natural language policy heuristics if structured enforcement is missing
   * @param {string} text 
   * @param {string} adrId 
   * @returns {Array<Object>}
   */
  extractHeuristicRules(text, adrId) {
    const rules = [];
    if (!text) return rules;

    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Heuristic 1: Prohibit/disallow import of X
      const prohibitMatch = line.match(/(?:do not|never|prohibit|disallow)\s+import(?:ing)?\s+(?:from\s+)?['"`]?([a-zA-Z0-9@/._-]+)['"`]?/i);
      if (prohibitMatch) {
        rules.push({
          ruleType: 'prohibited-import',
          prohibitedImports: [prohibitMatch[1]],
          violationMessage: `Import of '${prohibitMatch[1]}' prohibited per ADR clause (${adrId})`
        });
      }

      // Heuristic 2: Boundary restriction (e.g. controllers must not import db/database)
      const boundaryMatch = line.match(/([a-zA-Z0-9/._-]+)\s+(?:cannot|must not|should not)\s+(?:directly\s+)?import\s+['"`]?([a-zA-Z0-9@/._-]+)['"`]?/i);
      if (boundaryMatch) {
        rules.push({
          ruleType: 'boundary-violation',
          forbiddenInDir: boundaryMatch[1],
          forbiddenImports: [boundaryMatch[2]],
          violationMessage: `Directory '${boundaryMatch[1]}' cannot import '${boundaryMatch[2]}' per ADR clause (${adrId})`
        });
      }
    }

    return rules;
  }

  /**
   * Load all decisions from index.yaml and enrich with markdown enforcement blocks
   * @returns {Array<Object>}
   */
  loadEnrichedDecisions() {
    let indexData = { decisions: [] };
    if (fs.existsSync(this.indexPath)) {
      indexData = readYaml(this.indexPath) || { decisions: [] };
    }
    const decisions = indexData.decisions || [];

    for (const d of decisions) {
      const recordPath = d.file ? path.join(this.skyhookDir, d.file) : path.join(this.recordsDir, `${d.id}.md`);
      if (fs.existsSync(recordPath)) {
        try {
          const parsed = this.parser.parseFile(recordPath);
          if (parsed.enforcement && (!d.enforcement || !d.enforcement.rules)) {
            d.enforcement = parsed.enforcement;
          }
          if (!d.enforcement && (parsed.decision || parsed.context)) {
            const heuristics = this.extractHeuristicRules(`${parsed.decision}\n${parsed.context}`, d.id);
            if (heuristics.length > 0) {
              d.enforcement = { rules: heuristics };
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    return decisions;
  }

  /**
   * Compile active policies into machine-readable configs
   * @param {Object} [options]
   * @returns {Object} Compilation results
   */
  compile(options = {}) {
    const decisions = this.loadEnrichedDecisions();

    const activeRules = [];
    const deactivatedDecisions = [];
    const acceptedDecisions = [];

    for (const d of decisions) {
      const status = (d.status || 'draft').toLowerCase();

      // Deactivate superseded, deprecated, rejected, or draft decisions
      if (status === 'superseded' || status === 'deprecated' || status === 'rejected') {
        deactivatedDecisions.push({
          id: d.id,
          title: d.title,
          status,
          supersededBy: d.supersededBy || null
        });
        continue;
      }

      if (status === 'accepted') {
        acceptedDecisions.push(d);
        if (d.enforcement && Array.isArray(d.enforcement.rules)) {
          for (const rule of d.enforcement.rules) {
            activeRules.push({
              adrId: d.id,
              adrTitle: d.title,
              category: d.category || 'architecture',
              ...rule
            });
          }
        }
      }
    }

    // 1. Compile .skyhook/architecture-boundaries.yaml
    const boundariesConfig = {
      version: '1.0.0',
      compiledAt: getTimestamp(),
      source: 'skyhook-adr-policy-compiler',
      summary: {
        activePoliciesCount: activeRules.length,
        acceptedADRsCount: acceptedDecisions.length,
        deactivatedADRsCount: deactivatedDecisions.length
      },
      activePolicies: activeRules,
      deactivatedPolicies: deactivatedDecisions
    };

    writeYaml(this.boundariesPath, boundariesConfig);

    // 2. Compile ESLint no-restricted-imports JSON
    if (!fs.existsSync(this.generatedDir)) {
      fs.mkdirSync(this.generatedDir, { recursive: true });
    }

    const restrictedPaths = [];
    for (const rule of activeRules) {
      if (rule.prohibitedImports && Array.isArray(rule.prohibitedImports)) {
        for (const imp of rule.prohibitedImports) {
          restrictedPaths.push({
            name: imp,
            message: rule.violationMessage || `Importing '${imp}' is prohibited by accepted ${rule.adrId} (${rule.adrTitle}).`
          });
        }
      }
    }

    const eslintRules = {
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: restrictedPaths
          }
        ]
      }
    };
    fs.writeFileSync(this.eslintPath, JSON.stringify(eslintRules, null, 2), 'utf-8');

    // 3. Compile CI Gate config
    const ciGateConfig = {
      version: '1.0.0',
      generatedAt: getTimestamp(),
      gateName: 'Skyhook ADR Policy Verification Gate',
      failOnViolations: true,
      rulesCount: activeRules.length,
      rules: activeRules
    };
    fs.writeFileSync(this.ciGatePath, JSON.stringify(ciGateConfig, null, 2), 'utf-8');

    return {
      success: true,
      compiledCount: activeRules.length,
      acceptedCount: acceptedDecisions.length,
      deactivatedCount: deactivatedDecisions.length,
      boundariesPath: this.boundariesPath,
      eslintPath: this.eslintPath,
      ciGatePath: this.ciGatePath,
      rules: activeRules,
      deactivated: deactivatedDecisions
    };
  }
}
