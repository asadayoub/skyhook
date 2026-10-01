import fs from 'fs';
import path from 'path';
import { loadProfile } from '../utils.js';
import { inferFromRepo } from '../inference/InferenceEngine.js';
import { detectDrift } from '../drift-analyzer.js';
import { traceRequirement, analyzeImpact, findUntracedRequirements, generateCoverageHeatmap, indexCodebase } from '../tracer.js';
import { ADRSyncEngine } from '../adr/ADRSyncEngine.js';
import { PlanCompiler } from '../plan/PlanCompiler.js';
import { DriftAggregator } from '../drift/DriftAggregator.js';
import { DriftAutoFixer } from '../drift/DriftAutoFixer.js';

export async function cmdSync(ctx, args = {}) {
  const projectDir = process.cwd();

  // 1. Run Bi-Directional ADR Synchronization
  let adrSyncResult = null;
  if (ctx.skyhookDir) {
    try {
      const adrEngine = new ADRSyncEngine(ctx.skyhookDir);
      adrSyncResult = adrEngine.sync(ctx);
      if (adrSyncResult.updatedFromMarkdown > 0 || adrSyncResult.addedToIndex > 0) {
        console.log(`\n📝 ADR Sync: Updated ${adrSyncResult.updatedFromMarkdown} decision(s) from Markdown, added ${adrSyncResult.addedToIndex} to index.`);
      }
    } catch (err) {
      // Non-fatal if decisions folder doesn't exist yet
    }
  }

  // 2. Run Modular Inference Engine
  const facts = await inferFromRepo(projectDir);

  // 3. Load Desired State
  const project = ctx.readProjectYaml();
  const techStack = ctx.readTechStack();
  const profile = project.profile ? loadProfile(project.profile) : null;

  // 4. Analyze Drift
  const driftResult = detectDrift(facts, techStack, profile);

  // 5. Handle auto-adopt
  if (driftResult.detected && (args.adopt || args['auto-adopt'])) {
    console.log('\n🔄 Adopting detected architecture changes...');
    if (!techStack.technologies) techStack.technologies = [];

    // Add missing technologies
    if (facts.orm) techStack.technologies.push({ name: facts.orm, category: 'Database & ORM' });
    if (facts.database) techStack.technologies.push({ name: facts.database, category: 'Database' });
    if (facts.styling) techStack.technologies.push({ name: facts.styling, category: 'Styling' });

    // Write back to disk
    ctx.writeTechStack(techStack);

    console.log('✅ Successfully updated .skyhook/tech-stack.yaml');

    // Re-run drift analysis after adoption
    const postAdoptDrift = detectDrift(facts, techStack, profile);
    return { drift: postAdoptDrift, facts, adopted: true, adrSync: adrSyncResult };
  }

  // 6. Format CLI output for drift
  if (driftResult.detected) {
    console.log('\n⚠️ Architecture Drift Detected:');
    driftResult.violations.forEach((v, idx) => {
      console.log(`\n  ${idx + 1}. [${v.type}]`);
      console.log(`     Issue: ${v.message}`);
      console.log(`     Fix:   ${v.recommendation}`);
    });

    // Check if CI mode is enabled
    if (args['ci-check'] || args.ciCheck) {
      console.error('\n❌ Drift detected in CI mode. Exiting with failure.');
      process.exit(1);
    }
  } else {
    console.log('\n✅ No architecture drift detected. Codebase matches declared tech stack.');
  }

  // 7. Run Boundary & Architectural Compliance Analysis
  let driftScorecard = null;
  try {
    const aggregator = new DriftAggregator(ctx, args);
    driftScorecard = await aggregator.analyze();
    console.log(`🛡️ Architectural Compliance Health: ${driftScorecard.healthScore}% (${driftScorecard.summary.criticalCount} critical, ${driftScorecard.summary.warningCount} warnings, ${driftScorecard.summary.circularCyclesCount} cycles)`);
    if (driftScorecard.circularCycles.length > 0) {
      console.log(`⚠️ Warning: ${driftScorecard.circularCycles.length} circular dependency cycle(s) detected. Run 'skyhook drift --boundaries' for details.`);
    }
  } catch {
    // Non-fatal during sync
  }

  // 8. Auto-recompile Living Project Plan if plan directory exists
  let planSyncResult = null;
  if (ctx.skyhookDir && fs.existsSync(path.join(ctx.skyhookDir, 'plan'))) {
    try {
      planSyncResult = await PlanCompiler.compileMasterPlan(ctx, { projectDir });
      console.log('📋 Project Plan recompiled: .skyhook/plan/PROJECT_PLAN.md updated.');
    } catch {
      // Non-fatal if plan recompile encounters incomplete state
    }
  }

  // 9. Synchronize Injected Agent Harness Rules
  let harnessSyncResult = null;
  if (ctx.skyhookDir) {
    try {
      const { HarnessInjector } = await import('../harness/HarnessInjector.js');
      const injector = new HarnessInjector();
      harnessSyncResult = await injector.syncRules(ctx);
      if (harnessSyncResult.count > 0) {
        console.log(`🤖 Agent Harness Sync: Refreshed governance rules across ${harnessSyncResult.count} agent(s) (${harnessSyncResult.syncedHarnesses.join(', ')}).`);
      }
    } catch {
      // Non-fatal if harness sync encounters unconfigured environment
    }
  }

  return { drift: driftResult, facts, adrSync: adrSyncResult, planSync: planSyncResult, driftScorecard, harnessSync: harnessSyncResult };
}

/**
 * cmdDrift - Unified Architectural Drift, DDD Boundaries, Semantic Rules, and C4 Generator
 */
export async function cmdDrift(ctx, args = {}) {
  const aggregator = new DriftAggregator(ctx, args);
  const scorecard = await aggregator.analyze();

  if (args.json || args.format === 'json') {
    return scorecard;
  }

  // 1. Handle auto-fix / adoption
  if (args.fix || args.adopt) {
    console.log('\n🛠️ Running Architectural Auto-Remediation...');
    const packageDrifts = scorecard.warnings.filter(w => w.type === 'PACKAGE_DRIFT');
    if (packageDrifts.length > 0) {
      const items = packageDrifts.map(p => ({
        name: p.orm || p.database || p.styling || (p.message && p.message.match(/'([^']+)'/)?.[1]) || 'Unknown',
        category: p.type.toLowerCase().includes('database') ? 'Database' : 'Technology'
      }));
      const adoptedResult = DriftAutoFixer.adoptDrift(ctx, items);
      if (adoptedResult.adoptedCount > 0) {
        console.log(`✅ Adopted ${adoptedResult.adoptedCount} technologies into .skyhook/tech-stack.yaml: ${adoptedResult.adopted.join(', ')}`);
      }
    }
  }

  // 2. Display C4 Mermaid diagrams if requested
  if (args.c4) {
    console.log('\n🏛️ Living C4 Architecture - Container Diagram:');
    console.log('```mermaid');
    console.log(scorecard.c4.mermaidContainer);
    console.log('```\n');
    console.log('📦 Living C4 Architecture - Component Diagram:');
    console.log('```mermaid');
    console.log(scorecard.c4.mermaidComponent);
    console.log('```\n');
    return { c4: scorecard.c4 };
  }

  // 3. Display Boundaries if requested
  if (args.boundaries) {
    console.log(`\n🛡️ Architecture Boundary & Layer Governance (Health Score: ${scorecard.healthScore}%):`);
    if (scorecard.circularCycles.length > 0) {
      console.log('\n🔄 Circular Dependency Cycles Detected:');
      scorecard.circularCycles.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.join(' ➔ ')} ➔ ${c[0]}`);
      });
    }
    const layerViolations = scorecard.criticalViolations.filter(v => v.type === 'LAYER_VIOLATION' || v.type === 'ENCAPSULATION_BREACH');
    if (layerViolations.length > 0) {
      console.log('\n⛔ Layer Boundary Violations:');
      layerViolations.forEach((v, idx) => {
        console.log(`  ${idx + 1}. [${v.fromLayer || 'module'}] ➔ [${v.toLayer || v.module}] in ${v.file}:${v.line || 1}`);
        console.log(`     Issue: ${v.message}`);
        console.log(`     Fix:   ${v.recommendation}`);
      });
    } else if (scorecard.circularCycles.length === 0) {
      console.log('✅ Clean architectural boundaries. No layer or encapsulation breaches detected.');
    }
  } else if (args.semantic) {
    console.log(`\n🔍 Semantic AST Pattern Analysis (Score: ${scorecard.healthScore}%):`);
    const semanticIssues = [...scorecard.criticalViolations, ...scorecard.warnings].filter(v => v.type.startsWith('SEMANTIC'));
    if (semanticIssues.length > 0) {
      semanticIssues.forEach((v, idx) => {
        console.log(`  ${idx + 1}. [${v.ruleId}] ${v.file}:${v.line}`);
        console.log(`     Snippet: ${v.snippet}`);
        console.log(`     Issue:   ${v.message}`);
        console.log(`     Fix:     ${v.suggestion}`);
      });
    } else {
      console.log('✅ All semantic architecture rules passed cleanly.');
    }
  } else {
    // Default full overview
    console.log(`\n======================================================`);
    console.log(`🏛️ SKYHOOK ARCHITECTURE DRIFT & COMPLIANCE SCORECARD`);
    console.log(`======================================================`);
    console.log(`Architectural Compliance Health: ${scorecard.healthScore}%`);
    console.log(`Status: ${scorecard.pass ? '✅ PASS' : '❌ VIOLATIONS DETECTED'}`);
    console.log(`Graph Nodes: ${scorecard.summary.nodesCount} | Dependency Edges: ${scorecard.summary.edgesCount} | External Packages: ${scorecard.summary.externalPackagesCount}`);
    console.log(`Critical Violations: ${scorecard.summary.criticalCount} | Warnings: ${scorecard.summary.warningCount} | Circular Cycles: ${scorecard.summary.circularCyclesCount}`);

    if (scorecard.criticalViolations.length > 0) {
      console.log(`\n🚨 Critical Violations:`);
      scorecard.criticalViolations.forEach((v, idx) => {
        console.log(`  ${idx + 1}. [${v.type}] ${v.message} (${v.file || ''})`);
      });
    }

    if (scorecard.circularCycles.length > 0) {
      console.log(`\n🔄 Circular Dependency Cycles:`);
      scorecard.circularCycles.forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.join(' ➔ ')} ➔ ${c[0]}`);
      });
    }

    if (scorecard.warnings.length > 0) {
      console.log(`\n⚠️ Architectural Warnings:`);
      scorecard.warnings.forEach((w, idx) => {
        console.log(`  ${idx + 1}. [${w.type}] ${w.message}`);
      });
    }
  }

  // CI Check Gate
  if ((args['ci-check'] || args.ciCheck) && scorecard.criticalViolations.length > 0) {
    console.error(`\n❌ CI Check Failed: ${scorecard.criticalViolations.length} critical architecture violation(s) detected.`);
    process.exit(1);
  }

  return scorecard;
}

export async function cmdTrace(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = ctx?.projectDir || (ctx?.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
  return traceRequirement(projectDir, args.id, { lineage: Boolean(args.lineage) });
}

export async function cmdImpact(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = ctx?.projectDir || (ctx?.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
  return analyzeImpact(projectDir, args.id);
}

export async function cmdUntraced(ctx, args) {
  const projectDir = ctx?.projectDir || (ctx?.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
  return findUntracedRequirements(projectDir);
}

export async function cmdCoverage(ctx, args) {
  const projectDir = ctx?.projectDir || (ctx?.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
  return generateCoverageHeatmap(projectDir);
}

export async function cmdMapLegacy(ctx, args) {
  const projectDir = (ctx && ctx.projectDir) || process.cwd();
  const allSymbols = await indexCodebase(projectDir);
  const legacySymbols = allSymbols.filter(s => !s.traced);

  return {
    message: `Found ${legacySymbols.length} un-mapped legacy symbols across the codebase.`,
    legacySymbols: legacySymbols.map(s => ({
      file: s.file,
      symbolName: s.symbolName,
      symbolType: s.symbolType,
      line: s.line
    }))
  };
}

export async function cmdGraph(ctx, args) {
  const projectDir = (ctx && ctx.projectDir) || process.cwd();
  const allSymbols = await indexCodebase(projectDir);

  const funcReqs = ctx.readFunctionalReqs().requirements || [];
  const nonFuncReqs = ctx.readNonFunctionalReqs().requirements || [];
  const allReqs = [...funcReqs, ...nonFuncReqs];

  // Helper to sanitize labels for Mermaid (strip quotes and special chars)
  function sanitize(str) {
    return str.replace(/["<>{}|#&]/g, '').replace(/\\/g, '/');
  }

  // Group symbols by file
  const fileMap = new Map();
  allSymbols.forEach((sym, index) => {
    const fileId = "F_" + sym.file.replace(/[^a-zA-Z0-9]/g, '_');
    if (!fileMap.has(fileId)) {
      fileMap.set(fileId, { file: sym.file, symbols: [] });
    }
    fileMap.get(fileId).symbols.push({ ...sym, _index: index });
  });

  let mermaid = `\`\`\`mermaid\nflowchart TB\n`;

  // 1. Render Requirements layer
  if (allReqs.length > 0) {
    mermaid += `\n    %% ── Requirements ──\n`;
    allReqs.forEach(req => {
      const label = sanitize(`${req.id}: ${req.title}`);
      mermaid += `    ${req.id}["🎯 ${label}"]:::requirement\n`;
    });
  }

  // 2. Render each file and its symbols
  mermaid += `\n    %% ── Source Files & Symbols ──\n`;
  let prevFileId = null;
  for (const [fileId, data] of fileMap) {
    const fileLabel = sanitize(data.file);
    mermaid += `    ${fileId}["📄 ${fileLabel}"]:::file\n`;

    // Force vertical stacking by linking this file to the previous file invisibly
    if (prevFileId) {
      mermaid += `    ${prevFileId} ~~~ ${fileId}\n`;
    }
    prevFileId = fileId;

    data.symbols.forEach(sym => {
      const symId = "S_" + sym._index;
      const styleClass = sym.traced ? "traced" : "untraced";
      const icon = sym.traced ? "✅" : "❌";
      const symLabel = sanitize(`${icon} ${sym.symbolType} ${sym.symbolName}`);
      mermaid += `    ${symId}["${symLabel}"]:::${styleClass}\n`;

      // Connect file to its symbol
      mermaid += `    ${fileId} --> ${symId}\n`;
    });
    mermaid += `\n`;
  }

  // 3. Render edges: Requirement --> traced symbol
  mermaid += `    %% ── Traceability Links ──\n`;
  allSymbols.forEach((sym, index) => {
    if (sym.traced && sym.requirementId) {
      const symId = "S_" + index;
      mermaid += `    ${sym.requirementId} == "satisfies" ==> ${symId}\n`;
    }
  });

  // 4. Render Architectural Decisions (DAG) layer
  const decisionsData = (typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : {}) || { decisions: [] };
  const allDecisions = decisionsData.decisions || [];

  if (allDecisions.length > 0) {
    mermaid += `\n    %% ── Architectural Decisions (DAG) ──\n`;
    let prevAdrId = null;
    allDecisions.forEach(d => {
      const safeId = "ADR_" + d.id.replace(/[^a-zA-Z0-9]/g, '_');
      const statusIcon = d.status === 'accepted' ? '🏛️' : d.status === 'superseded' ? '⚠️' : '📝';
      const label = sanitize(`${statusIcon} ${d.id}: ${d.title} (${d.status || 'accepted'})`);
      const styleClass = d.status === 'superseded' ? 'adrSuperseded' : d.status === 'draft' ? 'adrDraft' : 'adrAccepted';
      mermaid += `    ${safeId}["${label}"]:::${styleClass}\n`;

      if (prevAdrId) {
        mermaid += `    ${prevAdrId} ~~~ ${safeId}\n`;
      }
      prevAdrId = safeId;
    });

    // Render superseding and governance links
    allDecisions.forEach(d => {
      const safeId = "ADR_" + d.id.replace(/[^a-zA-Z0-9]/g, '_');
      if (d.supersedes && Array.isArray(d.supersedes)) {
        d.supersedes.forEach(supId => {
          const safeSupId = "ADR_" + supId.replace(/[^a-zA-Z0-9]/g, '_');
          mermaid += `    ${safeSupId} == "superseded by" ==> ${safeId}\n`;
        });
      }
      if (d.relatedRequirements && Array.isArray(d.relatedRequirements)) {
        d.relatedRequirements.forEach(reqId => {
          mermaid += `    ${safeId} -. "governs" .-> ${reqId}\n`;
        });
      }
    });
  }

  // 5. Styling
  mermaid += `\n    %% ── Styling ──\n`;
  mermaid += `    classDef requirement fill:#2b6cb0,color:#fff,stroke:#2c5282,stroke-width:3px,font-size:14px,rx:10,ry:10\n`;
  mermaid += `    classDef file fill:#edf2f7,color:#2d3748,stroke:#a0aec0,stroke-width:2px,font-size:13px\n`;
  mermaid += `    classDef traced fill:#c6f6d5,color:#22543d,stroke:#38a169,stroke-width:2px,font-size:13px\n`;
  mermaid += `    classDef untraced fill:#fed7d7,color:#742a2a,stroke:#e53e3e,stroke-width:2px,font-size:13px\n`;
  mermaid += `    classDef adrAccepted fill:#e6fffa,color:#234e52,stroke:#319795,stroke-width:2px,font-size:13px,rx:8,ry:8\n`;
  mermaid += `    classDef adrSuperseded fill:#edf2f7,color:#718096,stroke:#a0aec0,stroke-width:2px,stroke-dasharray: 5 5,font-size:13px,rx:8,ry:8\n`;
  mermaid += `    classDef adrDraft fill:#fefcbf,color:#744210,stroke:#d69e2e,stroke-width:2px,font-size:13px,rx:8,ry:8\n`;

  mermaid += `\`\`\`\n`;

  const outputPath = path.join(ctx.skyhookDir, 'trace-graph.md');
  fs.writeFileSync(outputPath, mermaid, 'utf-8');

  return {
    message: 'Mermaid graph generated successfully.',
    path: outputPath
  };
}



