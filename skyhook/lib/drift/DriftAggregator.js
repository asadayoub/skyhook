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

    // Generate Machine-Executable Prescribed Actions
    const prescribedActions = this.generatePrescribedActions(allViolations, boundaryResult.circularCycles);

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
        circularCyclesCount: boundaryResult.circularCycles.length,
        prescribedActionsCount: prescribedActions.length
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
      remediation,
      prescribedActions
    };
  }

  /**
   * Generate concrete, machine-executable MCP remediation actions for drift items
   * @param {Array<Object>} violations
   * @param {Array<Array<string>>} [circularCycles=[]]
   * @returns {Array<Object>} List of prescribed actions with concrete tool calls
   */
  generatePrescribedActions(violations = [], circularCycles = []) {
    const actions = [];
    let actionIdCounter = 1;

    // 1. Process Circular Dependency Cycles
    for (const cycle of circularCycles) {
      if (!Array.isArray(cycle) || cycle.length === 0) continue;
      const cycleDisplay = cycle.map(f => path.basename(f)).join(' ➔ ');
      actions.push({
        id: `action-break-cycle-${actionIdCounter++}`,
        type: 'circular_dependency',
        priority: 'critical',
        description: `Break circular dependency cycle: ${cycleDisplay}`,
        mcpTool: 'skyhook_create_task',
        arguments: {
          title: `Break circular dependency cycle: ${cycleDisplay}`,
          description: `Refactor mutual imports across circular dependency path: ${cycle.join(' -> ')}. Extract common types, interfaces, or utilities into a shared module.`,
          type: 'refactor',
          priority: 'critical'
        },
        cycle
      });
    }

    // 2. Process Violations
    for (const v of violations) {
      // 2a. Package Drift
      if (v.type === 'PACKAGE_DRIFT') {
        const pkgName = v.orm || v.database || v.styling || v.name || (v.message && v.message.match(/'([^']+)'/)?.[1]) || 'Unknown';
        const category = v.category || (v.type && v.type.toLowerCase().includes('database') ? 'Database' : 'Technology');

        if (pkgName && pkgName !== 'Unknown') {
          // Action A: Adopt drift into tech-stack.yaml
          actions.push({
            id: `action-adopt-package-${actionIdCounter++}`,
            type: 'package_drift',
            priority: 'medium',
            description: `Adopt detected package '${pkgName}' into .skyhook/tech-stack.yaml`,
            mcpTool: 'skyhook_adopt_drift',
            arguments: {
              technologies: [
                { name: pkgName, category }
              ]
            },
            package: pkgName
          });

          // Action B: Draft ADR for package adoption
          actions.push({
            id: `action-draft-adr-${actionIdCounter++}`,
            type: 'package_drift',
            priority: 'medium',
            description: `Draft Architecture Decision Record (ADR) for adoption of '${pkgName}'`,
            mcpTool: 'skyhook_draft_adr',
            arguments: {
              title: `Adopt ${pkgName} for ${category}`,
              decision: `Formally adopt ${pkgName} into the system architecture to satisfy project requirements.`,
              context: `Automated drift detection identified introduction of ${pkgName} in codebase.`,
              category: category.toLowerCase()
            },
            package: pkgName
          });
        }
      }

      // 2b. Boundary Layer Violations / Encapsulation Breaches
      else if (v.type === 'LAYER_VIOLATION' || v.type === 'ENCAPSULATION_BREACH') {
        const targetFile = v.file || v.from || 'unknown';
        const baseTarget = path.basename(targetFile);
        const toDest = v.toLayer || v.module || path.basename(v.to || 'infrastructure');

        // Action A: Refactor boundary breach
        actions.push({
          id: `action-decouple-layer-${actionIdCounter++}`,
          type: 'boundary_violation',
          priority: 'critical',
          description: `Decouple ${baseTarget} from ${toDest} to restore layer encapsulation`,
          mcpTool: 'skyhook_create_task',
          arguments: {
            title: `Decouple ${baseTarget} from ${toDest}`,
            description: `Refactor ${targetFile}${v.line ? ':' + v.line : ''} to remove unauthorized import from ${toDest}. Inject dependencies via interface or repository pattern.`,
            type: 'refactor',
            priority: 'critical'
          },
          targetFile,
          line: v.line
        });

        // Action B: Authorize Layer Exception ADR
        actions.push({
          id: `action-exception-adr-${actionIdCounter++}`,
          type: 'boundary_violation',
          priority: 'high',
          description: `Record an accepted ADR granting an architectural exception for ${baseTarget} -> ${toDest}`,
          mcpTool: 'skyhook_record_decision',
          arguments: {
            title: `Authorize Architecture Boundary Exception: ${baseTarget} to ${toDest}`,
            decision: `Authorize direct import in ${targetFile}${v.line ? ':' + v.line : ''} with documented boundary constraints.`,
            context: `Boundary analysis detected cross-layer access from ${v.fromLayer || 'caller'} to ${toDest}.`,
            status: 'accepted',
            category: 'architecture'
          },
          targetFile,
          line: v.line
        });
      }

      // 2c. Circular Dependency violation object
      else if (v.type === 'CIRCULAR_DEPENDENCY' && Array.isArray(v.cycle)) {
        const cycle = v.cycle;
        const cycleDisplay = cycle.map(f => path.basename(f)).join(' ➔ ');
        const alreadyAdded = actions.some(a => a.type === 'circular_dependency' && JSON.stringify(a.cycle) === JSON.stringify(cycle));
        if (!alreadyAdded) {
          actions.push({
            id: `action-break-cycle-${actionIdCounter++}`,
            type: 'circular_dependency',
            priority: 'critical',
            description: `Break circular dependency cycle: ${cycleDisplay}`,
            mcpTool: 'skyhook_create_task',
            arguments: {
              title: `Break circular dependency cycle: ${cycleDisplay}`,
              description: `Refactor mutual imports across circular dependency path: ${cycle.join(' -> ')}. Extract common types, interfaces, or utilities into a shared module.`,
              type: 'refactor',
              priority: 'critical'
            },
            cycle
          });
        }
      }

      // 2d. Semantic Rule Violations
      else if (v.type && v.type.startsWith('SEMANTIC')) {
        const targetFile = v.file || 'unknown';
        const ruleName = v.ruleId || 'semantic-rule';
        actions.push({
          id: `action-semantic-fix-${actionIdCounter++}`,
          type: 'semantic_violation',
          priority: v.severity === 'error' ? 'high' : 'medium',
          description: `Remediate ${ruleName} in ${path.basename(targetFile)}${v.line ? ':' + v.line : ''}`,
          mcpTool: 'skyhook_create_task',
          arguments: {
            title: `Remediate ${ruleName} in ${path.basename(targetFile)}`,
            description: v.suggestion || `Refactor ${targetFile}${v.line ? ':' + v.line : ''} to comply with semantic architectural rule '${ruleName}'.`,
            type: 'refactor',
            priority: v.severity === 'error' ? 'high' : 'medium'
          },
          targetFile,
          line: v.line
        });
      }

      // 2e. ADR Policy Violations
      else if (v.type === 'ADR_POLICY_VIOLATION') {
        const targetFile = v.file || 'unknown';
        actions.push({
          id: `action-adr-policy-fix-${actionIdCounter++}`,
          type: 'adr_policy_violation',
          priority: 'critical',
          description: `Fix ADR policy violation [${v.adrId || 'ADR'}] in ${path.basename(targetFile)}`,
          mcpTool: 'skyhook_create_task',
          arguments: {
            title: `Fix ADR policy violation [${v.adrId || 'ADR'}] in ${path.basename(targetFile)}`,
            description: `Remediate ${targetFile}${v.line ? ':' + v.line : ''}: ${v.message || 'ADR policy violated'}.`,
            type: 'refactor',
            priority: 'critical'
          },
          targetFile,
          line: v.line
        });
      }
    }

    return actions;
  }
}
