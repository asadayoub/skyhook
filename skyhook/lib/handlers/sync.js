import fs from 'fs';
import path from 'path';
import { loadProfile } from '../utils.js';
import { inferFromRepo } from '../inference/InferenceEngine.js';
import { detectDrift } from '../drift-analyzer.js';
import { traceRequirement, analyzeImpact, findUntracedRequirements, generateCoverageHeatmap, indexCodebase } from '../tracer.js';

export async function cmdSync(ctx, args) {
  const projectDir = process.cwd();
  
  // 1. Run Modular Inference Engine
  const facts = await inferFromRepo(projectDir);
  
  // 2. Load Desired State
  const project = ctx.readProjectYaml();
  const techStack = ctx.readTechStack();
  const profile = project.profile ? loadProfile(project.profile) : null;
  
  // 3. Analyze Drift
  const driftResult = detectDrift(facts, techStack, profile);
  
  // 4. Handle auto-adopt
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
    return { drift: postAdoptDrift, facts, adopted: true };
  }
  
  // 5. Format CLI output for drift
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
  
  return { drift: driftResult, facts };
}

export async function cmdTrace(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = process.cwd();
  return traceRequirement(projectDir, args.id);
}

export async function cmdImpact(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = process.cwd();
  return analyzeImpact(projectDir, args.id);
}

export async function cmdUntraced(ctx, args) {
  const projectDir = process.cwd();
  return findUntracedRequirements(projectDir);
}

export async function cmdCoverage(ctx, args) {
  const projectDir = process.cwd();
  return generateCoverageHeatmap(projectDir);
}

export async function cmdMapLegacy(ctx, args) {
  const projectDir = process.cwd();
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
  const projectDir = process.cwd();
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
    mermaid += `    subgraph REQS["📋 Requirements"]\n`;
    mermaid += `        direction TB\n`;
    allReqs.forEach(req => {
      const label = sanitize(`${req.id}: ${req.title}`);
      mermaid += `        ${req.id}["${label}"]:::requirement\n`;
    });
    mermaid += `    end\n`;
  }

  // 2. Render each file as a subgraph containing its symbols
  mermaid += `\n    %% ── Source Files ──\n`;
  for (const [fileId, data] of fileMap) {
    const fileLabel = sanitize(data.file);
    mermaid += `    subgraph ${fileId}["📄 ${fileLabel}"]\n`;
    mermaid += `        direction TB\n`;
    data.symbols.forEach(sym => {
      const symId = "S_" + sym._index;
      const styleClass = sym.traced ? "traced" : "untraced";
      const icon = sym.traced ? "✅" : "❌";
      const symLabel = sanitize(`${icon} ${sym.symbolType} ${sym.symbolName}`);
      mermaid += `        ${symId}["${symLabel}"]:::${styleClass}\n`;
    });
    mermaid += `    end\n\n`;
  }

  // 3. Render edges: Requirement --> traced symbol
  mermaid += `    %% ── Traceability Links ──\n`;
  allSymbols.forEach((sym, index) => {
    if (sym.traced && sym.requirementId) {
      const symId = "S_" + index;
      mermaid += `    ${sym.requirementId} ==> ${symId}\n`;
    }
  });

  // 4. Styling
  mermaid += `\n    %% ── Styling ──\n`;
  mermaid += `    classDef requirement fill:#2d3748,color:#fff,stroke:#4fd1c5,stroke-width:3px,font-size:14px\n`;
  mermaid += `    classDef file fill:#edf2f7,color:#1a202c,stroke:#a0aec0,font-size:12px\n`;
  mermaid += `    classDef traced fill:#c6f6d5,color:#22543d,stroke:#38a169,stroke-width:2px,font-size:13px\n`;
  mermaid += `    classDef untraced fill:#fed7d7,color:#742a2a,stroke:#e53e3e,stroke-width:2px,font-size:13px\n`;

  // Subgraph styling
  mermaid += `\n    style REQS fill:#1a202c,stroke:#4fd1c5,stroke-width:2px,color:#fff,font-size:16px\n`;
  for (const [fileId] of fileMap) {
    mermaid += `    style ${fileId} fill:#f7fafc,stroke:#cbd5e0,stroke-width:1px,color:#2d3748\n`;
  }

  mermaid += `\`\`\`\n`;
  
  const outputPath = path.join(ctx.skyhookDir, 'trace-graph.md');
  fs.writeFileSync(outputPath, mermaid, 'utf-8');
  
  return {
    message: 'Mermaid graph generated successfully.',
    path: outputPath
  };
}



