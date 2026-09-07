import fs from 'fs';
import path from 'path';
import { generateADR } from '../adr-generator.js';

export async function cmdRecordDecision(ctx, args) {
  const required = ['title', 'decision', 'context'];
  for (const field of required) {
    if (!args[field]) return { error: 'Missing required field: ' + field };
  }
  
  const id = ctx.writeDecision({
    title: args.title,
    decision: args.decision,
    context: args.context,
    status: args.status || 'accepted',
    category: args.category || 'architecture',
    alternatives: args.alternatives,
    relatedRequirements: args.relatedRequirements,
    consequences: args.consequences,
    rationale: args.rationale,
    implementationNotes: args.implementationNotes
  });
  
  const decisionData = ctx.readDecisions().decisions.find(d => d.id === id) || { id, ...args };
  
  const projectContext = ctx.readProjectYaml() || {};
  const profile = ctx.readProfile(projectContext.profile || 'web-app') || {};
  const techStack = ctx.readTechStack() || { technologies: [] };
  
  const fullContext = {
    projectType: profile.name,
    profile: profile.id,
    techStack,
    projectDir: process.cwd()
  };
  
  const adrContent = generateADR(decisionData, fullContext);
  const adrDir = path.join(ctx.skyhookDir, 'decisions', 'records');
  if (!fs.existsSync(adrDir)) {
    fs.mkdirSync(adrDir, { recursive: true });
  }
  
  const adrFile = path.join(adrDir, `${id}.md`);
  fs.writeFileSync(adrFile, adrContent, 'utf-8');
  
  return { decisionId: id, message: 'Decision recorded successfully with auto-generated ADR', file: adrFile };
}

export async function cmdDecide(ctx, args) {
  return cmdRecordDecision(ctx, args);
}
