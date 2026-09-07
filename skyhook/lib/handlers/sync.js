import fs from 'fs';
import path from 'path';
import { loadProfile } from '../utils.js';
import { inferFromRepo } from '../../skill/lib/inference.js';
import { traceRequirement, analyzeImpact, findUntracedRequirements } from '../tracer.js';

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

