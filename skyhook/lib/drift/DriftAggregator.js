/**
 * DriftAggregator - Unified Architectural Compliance & Drift Aggregation Engine
 * Orchestrates AST import graphs, DDD boundary guards, semantic pattern linters,
 * living C4 architecture models, ADR policies, and package drift into a single
 * actionable health scorecard.
 */

import path from 'path';
import { ASTImportGraph } from './ASTImportGraph.js';
import { ModuleBoundaryGuard } from './ModuleBoundaryGuard.js';
import { SemanticRuleEngine } from './SemanticRuleEngine.js';
import { C4ArchitectureGenerator } from './C4ArchitectureGenerator.js';
import { ADRPolicyGuard } from '../adr/ADRPolicyGuard.js';
import { DriftAnalyzer } from '../drift-analyzer.js';
import { inferFromRepo } from '../inference/InferenceEngine.js';
import { DriftAutoFixer } from './DriftAutoFixer.js';

export class DriftAggregator {
  /**
   * @param {Object} ctx - Skyhook project context
   * @param {Object} [options]
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.projectDir = path.resolve(ctx.projectDir || process.cwd());
    this.options = options;
  }

  /**
   * Execute full multi-dimensional architecture analysis
   * @returns {Promise<Object>} Unified architecture scorecard
   */
  async analyze() {
    const importGraph = new ASTImportGraph(this.projectDir, this.options);
    await importGraph.build();

    // 1. DDD & Module Boundary Guard
    const boundaryGuard = new ModuleBoundaryGuard(this.projectDir);
    const boundaryResult = boundaryGuard.checkAll(importGraph, this.ctx);
    const boundaryConfig = boundaryGuard.loadConfiguration(this.ctx);

    // 2. Semantic Rule Engine (AST Pattern Linter)
    const semanticEngine = new SemanticRuleEngine(this.projectDir, {
      ...boundaryConfig,
      ignoreDirs: importGraph.ignoredDirs
    });
    const semanticResult = await semanticEngine.run();

    // 3. Living C4 Architecture Model & Diff
    const c4Gen = new C4ArchitectureGenerator(this.projectDir, importGraph);
    const c4Inferred = await c4Gen.inferArchitecture();
    const c4ContainerMermaid = c4Gen.toMermaidContainerDiagram(c4Inferred);
    const c4ComponentMermaid = c4Gen.toMermaidComponentDiagram(c4Inferred);
    const c4Diff = c4Gen.diffWithTarget(c4Inferred);

    // 4. ADR Policy Guard
    let adrPolicyResult = { pass: true, violations: [] };
    try {
      const adrGuard = new ADRPolicyGuard(this.ctx);
      adrPolicyResult = await adrGuard.verify();
    } catch {
      // Graceful fallback if ADR index or directory not yet created
    }

    // 5. Inferred Package Drift
    let packageDriftResult = { detected: false, violations: [] };
    try {
      const declaredTechStack = (this.ctx.readTechStack ? this.ctx.readTechStack() : null) || { technologies: [] };
      const inferredFacts = await inferFromRepo(this.projectDir);
      const driftAnalyzer = new DriftAnalyzer();
      packageDriftResult = driftAnalyzer.analyze(inferredFacts, declaredTechStack);
    } catch {
      // Graceful fallback
    }

    // Classify Violations
    const criticalViolations = [];
    const warnings = [];

    // Boundary layer violations & circular dependencies
    for (const v of boundaryResult.violations) {
      if (v.severity === 'error' || v.type === 'LAYER_VIOLATION' || v.type === 'CIRCULAR_DEPENDENCY') {
        criticalViolations.push(v);
      } else {
        warnings.push(v);
      }
    }

    // Semantic rule errors and warnings
    for (const v of semanticResult.violations) {
      if (v.severity === 'error') {
        criticalViolations.push({
          type: 'SEMANTIC_ERROR',
          ...v
        });
      } else {
        warnings.push({
          type: 'SEMANTIC_WARNING',
          ...v
        });
      }
    }

    // ADR Policy violations (always critical)
    for (const v of adrPolicyResult.violations) {
      criticalViolations.push({
        type: 'ADR_POLICY_VIOLATION',
        ...v
      });
    }

    // Package drift
    for (const v of packageDriftResult.violations) {
      warnings.push({
        type: 'PACKAGE_DRIFT',
        ...v
      });
    }

    // C4 Target Architecture Drift
    if (c4Diff.hasTargetSpecification && !c4Diff.match) {
      for (const added of c4Diff.addedContainers) {
        warnings.push({
          type: 'C4_ADDED_CONTAINER',
          message: added.reason,
          name: added.name
        });
      }
      for (const missing of c4Diff.missingContainers) {
        warnings.push({
          type: 'C4_MISSING_CONTAINER',
          message: missing.reason,
          name: missing.name
        });
      }
      for (const unauth of c4Diff.unauthorizedConnections) {
        criticalViolations.push({
          type: 'C4_UNAUTHORIZED_CONNECTION',
          message: unauth.reason,
          from: unauth.from,
          to: unauth.to
        });
      }
    }

    // Calculate Unified Compliance Health Score (0-100)
    let scoreDeduction = 0;
    scoreDeduction += criticalViolations.length * 15;
    scoreDeduction += warnings.length * 3;
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - scoreDeduction)));

    // Generate Remediation Guide
    const allViolations = [...criticalViolations, ...warnings];
    const remediation = DriftAutoFixer.generateRemediationGuide(allViolations);

    return {
      healthScore,
      pass: criticalViolations.length === 0,
      timestamp: new Date().toISOString(),
      summary: {
        totalViolations: allViolations.length,
        criticalCount: criticalViolations.length,
        warningCount: warnings.length,
        nodesCount: importGraph.nodes.size,
        edgesCount: importGraph.edges.length,
        externalPackagesCount: importGraph.externalPackages.size,
        circularCyclesCount: boundaryResult.circularCycles.length
      },
      criticalViolations,
      warnings,
      circularCycles: boundaryResult.circularCycles,
      c4: {
        inferred: c4Inferred,
        mermaidContainer: c4ContainerMermaid,
        mermaidComponent: c4ComponentMermaid,
        diff: c4Diff
      },
      graphMetrics: {
        nodes: Array.from(importGraph.nodes.values()),
        edges: importGraph.edges,
        externalPackages: Array.from(importGraph.externalPackages.entries()).map(([pkg, files]) => ({
          package: pkg,
          usedIn: Array.from(files)
        }))
      },
      remediation
    };
  }
}
