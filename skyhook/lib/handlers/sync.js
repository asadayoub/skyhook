import fs from 'fs';
import path from 'path';
import { loadProfile } from '../utils.js';
import { inferFromRepo } from '../../skill/lib/inference.js';
import { traceRequirement, analyzeImpact, findUntracedRequirements, generateCoverageHeatmap, indexCodebase } from '../tracer.js';

export async function cmdSync(ctx, args) {
  const projectDir = process.cwd();
  const facts = inferFromRepo(projectDir);
  const project = ctx.readProjectYaml();
  const techStack = ctx.readTechStack();
  
  const drift = {
    detected: false,
    issues: [],
    recommendations: []
  };
  
  if (facts.framework && project.profile) {
    const profile = loadProfile(project.profile);
    if (profile) {
      const expectedFramework = profile.techStack?.frontend?.framework?.default;
      if (expectedFramework && facts.framework.toLowerCase() !== expectedFramework.toLowerCase()) {
        drift.detected = true;
        drift.issues.push('Framework mismatch: profile expects ' + expectedFramework + ', detected ' + facts.framework);
        drift.recommendations.push('Update profile or tech-stack.yaml');
      }
    }
  }
  
  if (facts.orm && techStack.technologies) {
    const hasOrm = techStack.technologies.some(t => t.name?.toLowerCase().includes(facts.orm.toLowerCase()));
    if (!hasOrm) {
      drift.detected = true;
      drift.issues.push('ORM detected (' + facts.orm + ') but not in tech-stack.yaml');
      drift.recommendations.push('Add ' + facts.orm + ' to tech-stack.yaml');
    }
  }
  
  return { drift, facts };
}

export async function cmdTrace(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = process.cwd();
  return traceRequirement(args.id, projectDir);
}

export async function cmdImpact(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = process.cwd();
  return analyzeImpact(args.id, projectDir);
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

  let mermaid = `\`\`\`mermaid\ngraph TD\n`;
  
  // 1. Render Requirements
  mermaid += `    %% Requirements\n`;
  allReqs.forEach(req => {
    mermaid += `    ${req.id}("${req.id}: ${req.title}") :::requirement\n`;
  });
  
  // 2. Render Files and Symbols
  mermaid += `\n    %% Files and Symbols\n`;
  const fileNodes = new Set();
  
  allSymbols.forEach((sym, index) => {
    const fileId = "F_" + sym.file.replace(/[^a-zA-Z0-9]/g, '_');
    if (!fileNodes.has(fileId)) {
      mermaid += `    ${fileId}["${sym.file}"] :::file\n`;
      fileNodes.add(fileId);
    }
    
    const symId = "S_" + index;
    const styleClass = sym.traced ? "traced" : "untraced";
    mermaid += `    ${symId}{"${sym.symbolType} ${sym.symbolName}"} :::${styleClass}\n`;
    
    // Connect File to Symbol
    mermaid += `    ${fileId} --- ${symId}\n`;
    
    // Connect Requirement to Symbol
    if (sym.traced && sym.requirementId) {
      mermaid += `    ${sym.requirementId} --> ${symId}\n`;
    }
  });
  
  // 3. Styling
  mermaid += `\n    %% Styling\n`;
  mermaid += `    classDef requirement fill:#2d3748,color:#fff,stroke:#4fd1c5,stroke-width:4px\n`;
  mermaid += `    classDef file fill:#edf2f7,color:#1a202c,stroke:#a0aec0\n`;
  mermaid += `    classDef traced fill:#c6f6d5,color:#22543d,stroke:#38a169\n`;
  mermaid += `    classDef untraced fill:#fed7d7,color:#742a2a,stroke:#e53e3e\n`;
  mermaid += `\`\`\`\n`;
  
  const outputPath = path.join(ctx.skyhookDir, 'trace-graph.md');
  fs.writeFileSync(outputPath, mermaid, 'utf-8');
  
  return {
    message: 'Mermaid graph generated successfully.',
    path: outputPath
  };
}

