import fs from 'fs';
import path from 'path';
import { generateADR } from '../adr-generator.js';
import { ADRSyncEngine } from '../adr/ADRSyncEngine.js';
import { ADRPolicyGuard } from '../adr/ADRPolicyGuard.js';
import { ADRSynthesizer } from '../adr/ADRSynthesizer.js';
import { ADRWatcher } from '../adr/ADRWatcher.js';

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
    implementationNotes: args.implementationNotes,
    supersedes: args.supersedes,
    enforcement: args.enforcement,
    diagram: args.diagram
  });
  
  const readDecisions = (typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : {}) || { decisions: [] };
  const decisionData = (readDecisions.decisions || []).find(d => d.id === id) || { id, ...args };
  
  const projectContext = (typeof ctx.readProjectYaml === 'function' ? ctx.readProjectYaml() : {}) || {};
  const profile = (typeof ctx.readProfile === 'function' ? ctx.readProfile(projectContext.profile || 'web-app') : {}) || {};
  const techStack = (typeof ctx.readTechStack === 'function' ? ctx.readTechStack() : { technologies: [] }) || { technologies: [] };
  
  const fullContext = {
    projectType: profile.name,
    profile: profile.id,
    techStack,
    projectDir: process.cwd()
  };
  
  const adrContent = generateADR({ ...decisionData, ...args, id }, fullContext);
  const adrDir = path.join(ctx.skyhookDir, 'decisions', 'records');
  if (!fs.existsSync(adrDir)) {
    fs.mkdirSync(adrDir, { recursive: true });
  }
  
  const adrFile = path.join(adrDir, `${id}.md`);
  fs.writeFileSync(adrFile, adrContent, 'utf-8');

  // Trigger sync engine to ensure two-way alignment
  if (ctx.skyhookDir) {
    const syncEngine = new ADRSyncEngine(ctx.skyhookDir);
    syncEngine.sync(ctx);
  }
  
  return {
    decisionId: id,
    message: 'Decision recorded successfully with auto-generated ADR and diagram',
    file: adrFile,
    status: args.status || 'accepted'
  };
}

export async function cmdDecide(ctx, args) {
  return cmdRecordDecision(ctx, args);
}

/**
 * Bi-directionally synchronize ADR markdown files with decisions/index.yaml
 */
export async function cmdSyncADR(ctx, args = {}) {
  if (!ctx.skyhookDir) {
    return { error: 'Not in a Skyhook project (missing .skyhook directory)' };
  }

  const syncEngine = new ADRSyncEngine(ctx.skyhookDir);
  const results = syncEngine.sync(ctx);

  return {
    message: 'ADRs synchronized bi-directionally successfully.',
    ...results
  };
}

/**
 * Verify codebase compliance against accepted ADR enforcement policies
 */
export async function cmdVerifyADR(ctx, args = {}) {
  if (!ctx.skyhookDir) {
    return { error: 'Not in a Skyhook project' };
  }

  const decisionsData = (typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : {}) || { decisions: [] };
  const guard = new ADRPolicyGuard(ctx.skyhookDir, process.cwd());
  const result = await guard.verifyPolicies(decisionsData.decisions || []);

  return result;
}

/**
 * Proactively synthesize and draft an ADR based on codebase changes or parameters
 */
export async function cmdDraftADR(ctx, args = {}) {
  if (!ctx.skyhookDir) {
    return { error: 'Not in a Skyhook project' };
  }

  const synthesizer = new ADRSynthesizer(ctx);

  if (args.title || args.name) {
    const drafted = synthesizer.draftForShift({
      name: args.name || args.title,
      title: args.title,
      decision: args.decision,
      context: args.context,
      category: args.category || 'technology'
    });
    return {
      message: 'Draft ADR synthesized successfully.',
      ...drafted
    };
  }

  // Detect shifts automatically
  const shifts = await synthesizer.detectShifts(process.cwd());
  if (shifts.length === 0) {
    return {
      message: 'No unrecorded architectural or technology shifts detected.',
      drafts: []
    };
  }

  const drafts = [];
  for (const shift of shifts) {
    const drafted = synthesizer.draftForShift(shift);
    drafts.push(drafted);
  }

  return {
    message: `Synthesized ${drafts.length} draft ADR(s) from detected codebase shifts.`,
    drafts
  };
}

/**
 * Start live background file watcher for ADR markdown files
 */
export async function cmdWatchADR(ctx, args = {}) {
  if (!ctx.skyhookDir) {
    return { error: 'Not in a Skyhook project' };
  }

  const watcher = new ADRWatcher(ctx.skyhookDir, {
    onChange: ({ filename, syncResult }) => {
      console.log(`\n⚡ [Skyhook Live ADR Watcher] Detected edit in: ${filename}`);
      console.log(`   Updated: ${syncResult.updatedFromMarkdown} decision(s), Indexed: ${syncResult.addedToIndex}`);
    }
  });

  const startRes = watcher.start(ctx);
  console.log(`\n👀 Skyhook Live ADR Watcher active on: ${startRes.directory}`);
  console.log('   Edit any .md file in your editor; index.yaml will update automatically.');
  console.log('   Press Ctrl+C to stop.\n');

  // Keep process alive if called from interactive CLI
  if (args.interactive !== false && !args.testMode) {
    await new Promise(() => {}); // runs until SIGINT
  }

  return {
    message: 'ADR Live Watcher initialized.',
    watching: true,
    watcher
  };
}
