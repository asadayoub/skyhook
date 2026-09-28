import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import http from 'http';
import { readYaml, writeYaml, getTimestamp, generateULID, loadProfile, SKYHOOK_ROOT, SKYHOOK_VERSION } from '../utils.js';
import { inferFromRepo } from '../inference/InferenceEngine.js';
import { PlanCompiler } from '../plan/PlanCompiler.js';
import { GanttGenerator } from '../plan/GanttGenerator.js';
import { SkyhookServer } from '../server/SkyhookServer.js';

let activeSkyhookServer = null;
let dashboardServer = null;
const DASHBOARD_PORT = 31415;

export async function cmdDashboard(ctx, args = {}) {
  const action = (typeof args === 'string' ? args : args.action || (Array.isArray(args) ? args[0] : null)) || 'status';
  
  if (action === 'start') {
    if (activeSkyhookServer) {
      return { 
        message: 'Dashboard already running at http://localhost:' + activeSkyhookServer.currentPort,
        port: activeSkyhookServer.currentPort,
        url: 'http://localhost:' + activeSkyhookServer.currentPort
      };
    }
    
    try {
      const workspaceDir = ctx?.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd();
      const serverInstance = new SkyhookServer({
        port: args.port ? Number(args.port) : DASHBOARD_PORT,
        workspaceDir
      });

      const result = await serverInstance.start();
      activeSkyhookServer = serverInstance;
      dashboardServer = serverInstance.server; // Maintain backward compatibility for test checks

      return { 
        message: 'Dashboard started at ' + result.url,
        port: result.port,
        url: result.url
      };
    } catch (e) {
      return { error: 'Failed to start dashboard: ' + e.message };
    }
  }
  
  if (action === 'stop') {
    if (activeSkyhookServer) {
      await activeSkyhookServer.stop();
      activeSkyhookServer = null;
      dashboardServer = null;
      return { message: 'Dashboard stopped' };
    }
    return { message: 'Dashboard not running' };
  }
  
  const currentRunning = !!activeSkyhookServer;
  const currentPort = activeSkyhookServer ? activeSkyhookServer.currentPort : DASHBOARD_PORT;
  return { 
    running: currentRunning,
    port: currentPort,
    url: currentRunning ? 'http://localhost:' + currentPort : null
  };
}

export async function cmdProfile(ctx, args) {
  const name = args.name || 'web-app';
  const profile = loadProfile(name);
  
  if (!profile) {
    const profilesDir = path.join(SKYHOOK_ROOT, 'profiles');
    const available = fs.readdirSync(profilesDir)
      .filter(f => f.endsWith('.yaml'))
      .map(f => f.replace('.yaml', ''));
    return { error: 'Profile not found: ' + name, available };
  }
  
  return {
    profile: {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      category: profile.category,
      extends: profile.extends,
      techStack: profile.techStack,
      variants: profile.variants?.map(v => ({ id: v.id, name: v.name, description: v.description })) || [],
      questionsCount: Object.values(profile.questions || {}).flat().length,
      standards: profile.standards,
      defaultRequirements: profile.defaultRequirements
    }
  };
}

export async function cmdVersion(ctx, args) {
  return {
    version: SKYHOOK_VERSION,
    protocol: 'skyhook-stdio-v1',
    node: process.version,
    platform: process.platform
  };
}

export async function cmdHelp(ctx, args) {
  return {
    commands: [
      { name: 'listCurrentFeatures', description: 'List all features with status', args: ['status?: all|backlog|in-progress|done|blocked'] },
      { name: 'getFeature', description: 'Get detailed feature info', args: ['id: string'] },
      { name: 'getNextTask', description: 'Get highest priority ready task', args: ['assignee?: string'] },
      { name: 'getBlockers', description: 'Get all blocked items', args: [] },
      { name: 'recordDecision', description: 'Record architectural decision (auto-generates ADR)', args: ['title, decision, context, status?, category?, alternatives?, relatedRequirements?, consequences?, rationale?'] },
      { name: 'updateStatus', description: 'Update story status', args: ['storyId, status: backlog|ready|in-progress|in-review|done|blocked|cancelled'] },
      { name: 'getContext', description: 'Get relevant context for a topic', args: ['topic?: string'] },
      { name: 'sync', description: 'Check code vs docs drift', args: [] },
      { name: 'addFeature', description: 'Add new feature with stories', args: ['title, description?, goal?, stories?: [{title, userStory, acceptanceCriteria?, priority?}]'] },
      { name: 'trace', description: 'Trace requirement to code (stories, decisions, code refs)', args: ['id: string (requirement ID)'] },
      { name: 'impact', description: 'Analyze impact of changing a requirement', args: ['id: string (requirement ID)'] },
      { name: 'untraced', description: 'Find requirements with no code references', args: [] },
      { name: 'dashboard', description: 'Start/stop web dashboard', args: ['action: start|stop|status'] },
      { name: 'help', description: 'Show this help', args: [] },
      { name: 'init', description: 'Initialize project with profile', args: ['profile?, name?, description?, variant?, force?'] },
      { name: 'discover', description: 'Run phased discovery workflow', args: ['phase?, answers?'] },
      { name: 'question', description: 'Get contextual questions for any phase', args: ['category?, limit?'] },
      { name: 'plan', description: 'Generate PROJECT_PLAN.md', args: [] },
      { name: 'standards', description: 'List applicable standards (with overrides)', args: ['category?'] },
      { name: 'profile', description: 'Show profile details (tech stack, variants, questions)', args: ['name?'] },
      { name: 'version', description: 'Show version info', args: [] },
      { name: 'install', description: 'Install skill globally/locally', args: ['scope?: global|local, force?'] },
      { name: 'setup', description: 'Auto-configure agent harness', args: ['agent: codex|claude|gemini|copilot|antigravity|all'] },
      { name: 'decide', description: 'Shorthand for recordDecision', args: ['title, decision, context, ...'] },
      { name: 'batchCreate', description: 'Bulk create features/stories/requirements/decisions', args: ['items: [{type: feature|story|requirement|decision, data: {...}}]'] },
      { name: 'syncAdr', description: 'Bi-directionally sync ADR markdown files with decisions/index.yaml', args: [] },
      { name: 'verifyAdr', description: 'Verify codebase compliance against accepted ADR policies and prohibited imports', args: ['path?'] },
      { name: 'draftAdr', description: 'Draft an ADR with alternatives and Mermaid diagram for unrecorded libraries or shifts', args: ['title?, decision?, context?'] },
      { name: 'watchAdr', description: 'Watch decisions directory and auto-sync on markdown file save', args: [] },
      { name: 'bootstrapAdr', description: 'Reverse-engineer baseline ADRs for existing/brownfield codebase technologies', args: ['status?, overwrite?'] },
      { name: 'hookInstall', description: 'Install Git pre-commit hook to block commits that violate ADR policies', args: [] },
      { name: 'hookUninstall', description: 'Uninstall Skyhook Git pre-commit hook', args: [] },
      { name: 'hookStatus', description: 'Check Git pre-commit hook status', args: [] },
      { name: 'graph', description: 'Generate visual Mermaid architecture graph & Decision DAG (trace-graph.md)', args: [] },
      { name: 'mapLegacy', description: 'Map unmapped codebase symbols to existing requirements', args: ['limit?'] },
      { name: 'coverage', description: 'Calculate requirements and code traceability coverage metrics', args: [] },
      { name: 'backlogEvents', description: 'View append-only audit trail and lead/cycle time agility metrics', args: ['limit?'] },
      { name: 'releaseLease', description: 'Release an active task lease assigned to an agent', args: ['storyId, agent?, force?'] },
      { name: 'backlogReplay', description: 'Replay events.jsonl to project and reconstruct backlog state', args: ['save?'] }
    ],
    usage: 'echo \'{"command":"listCurrentFeatures","args":{}}\' | node skyhook-cmd.js'
  };
}

export async function cmdGetContext(ctx, args) {
  const topic = args.topic || 'general';
  const project = ctx.readProjectYaml();
  const backlog = ctx.readBacklog();
  const decisions = ctx.readDecisions();
  const funcReqs = ctx.readFunctionalReqs();
  const nfReqs = ctx.readNonFunctionalReqs();
  const techStack = ctx.readTechStack();
  
  let context = {
    project: { id: project.id, name: project.name, type: project.type, profile: project.profile },
    stats: {
      epics: backlog.epics?.length || 0,
      stories: backlog.stories?.length || 0,
      decisions: decisions.decisions?.length || 0,
      requirements: (funcReqs.requirements?.length || 0) + (nfReqs.requirements?.length || 0)
    }
  };
  
  if (topic === 'features') {
    context.activeFeatures = backlog.epics?.filter(e => e.status !== 'done').map(e => ({
      id: e.id, title: e.title, stories: e.childStories?.length || 0
    })) || [];
  } else if (topic === 'decisions') {
    context.recentDecisions = decisions.decisions?.slice(-5).map(d => ({
      id: d.id, title: d.title, status: d.status, category: d.category
    })) || [];
  } else if (topic === 'requirements') {
    context.requirements = [
      ...(funcReqs.requirements?.slice(-10) || []),
      ...(nfReqs.requirements?.slice(-10) || [])
    ];
  } else if (topic === 'tech') {
    context.techStack = techStack;
  }
  
  return context;
}

export async function cmdInit(ctx, args) {
  const projectDir = (ctx && ctx.projectDir) || (ctx && ctx.skyhookDir ? path.dirname(ctx.skyhookDir) : process.cwd());
  const skyhookDir = (ctx && ctx.skyhookDir) || path.join(projectDir, '.skyhook');
  
  if (fs.existsSync(skyhookDir) && !args.force) {
    return { error: '.skyhook already exists. Use --force to reinitialize.' };
  }
  
  const profileName = args.profile || 'web-app';
  const profile = loadProfile(profileName);
  
  if (!profile) {
    return { error: 'Profile not found: ' + profileName };
  }
  
  // Create directory structure
  const dirs = [
    '.skyhook',
    '.skyhook/requirements',
    '.skyhook/decisions',
    '.skyhook/backlog',
    '.skyhook/ux',
    '.skyhook/standards',
    '.skyhook/plan',
    '.skyhook/extensions'
  ];
  
  for (const dir of dirs) {
    fs.mkdirSync(path.join(projectDir, dir), { recursive: true });
  }
  
  // Generate project.yaml
  const projectId = generateULID();
  const projectData = {
    schemaVersion: '1.0.0',
    id: projectId,
    name: args.name || path.basename(projectDir),
    description: args.description || '',
    type: profile.id,
    profile: profileName,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
    version: '0.1.0',
    repository: { url: '', branch: 'main', provider: 'none' },
    skyhookVersion: SKYHOOK_VERSION,
    configuration: {
      questionThreshold: 'contextual',
      autoPlan: true,
      standardsLevel: 'advisory',
      trackDecisions: true,
      syncOnCommit: false
    },
    metadata: {}
  };
  
  writeYaml(path.join(skyhookDir, 'project.yaml'), projectData);
  
  // Create template files
  const templates = {
    'context.md': '# Project Context\n\n## Problem Statement\n\n\n## Solution Overview\n\n\n## Target Users\n\n\n## Value Proposition\n\n\n*Generated by Skyhook on ' + getTimestamp() + '*',
    'vision.md': '# Product Vision\n\n## Vision Statement\n\n\n## Success Metrics (KPIs)\n\n| Metric | Target | Timeline | Measurement |\n|--------|--------|----------|-------------|\n\n## Non-Goals\n\n\n## Target Personas\n\n\n## High-Level User Journeys\n\n\n*Generated by Skyhook on ' + getTimestamp() + '*',
    'requirements/functional.yaml': 'schemaVersion: "1.0.0"\nrequirements: []',
    'requirements/non-functional.yaml': 'schemaVersion: "1.0.0"\nrequirements: []',
    'requirements/constraints.yaml': 'schemaVersion: "1.0.0"\nconstraints: []',
    'decisions/index.yaml': 'schemaVersion: "1.0.0"\ndecisions: []',
    'backlog/epics.yaml': 'schemaVersion: "1.0.0"\nmetadata:\n  createdAt: "' + getTimestamp() + '"\n  updatedAt: "' + getTimestamp() + '"\n  version: 0.1.0\nepics: []\nstories: []\ntasks: []\nprioritization:\n  method: wsjf\n  criteria: {}',
    'ux/styleguide.md': '# Design System\n\n## Color Palette\n\n| Role | Light | Dark | Usage |\n|------|-------|------|-------|\n\n## Typography\n\n| Element | Font | Size | Weight |\n|---------|------|------|--------|\n\n## Spacing\n\n| Token | Value |\n|-------|-------|\n\n## Components\n\n| Component | Variants | States |\n|-----------|----------|--------|\n\n*Generated by Skyhook on ' + getTimestamp() + '*',
    'changelog.md': '# Changelog\n\n## [Unreleased]\n\n*Generated by Skyhook on ' + getTimestamp() + '*'
  };
  
  for (const [file, content] of Object.entries(templates)) {
    const filePath = path.join(skyhookDir, file);
    if (!fs.existsSync(filePath) || args.force) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
  
  // Create tech-stack.yaml with auto-discovered tech
  const techStackPath = path.join(skyhookDir, 'tech-stack.yaml');
  if (!fs.existsSync(techStackPath) || args.force) {
    const facts = await inferFromRepo(projectDir);
    const techStack = {
      schemaVersion: "1.0.0",
      technologies: [],
      patterns: [],
      constraints: []
    };
    
    if (facts.framework) techStack.technologies.push({ name: facts.framework, category: 'Framework' });
    if (facts.orm) techStack.technologies.push({ name: facts.orm, category: 'Database & ORM' });
    if (facts.database) techStack.technologies.push({ name: facts.database, category: 'Database' });
    if (facts.styling) techStack.technologies.push({ name: facts.styling, category: 'Styling' });
    if (facts.testing) techStack.technologies.push({ name: facts.testing, category: 'Testing' });
    if (facts.deployment) techStack.technologies.push({ name: facts.deployment, category: 'Deployment' });
    if (facts.ci) techStack.technologies.push({ name: facts.ci, category: 'CI/CD' });
    
    writeYaml(techStackPath, techStack);
    
    if (techStack.technologies.length > 0) {
      console.log(`🔍 Auto-discovered ${techStack.technologies.length} technologies for baseline tech stack.`);
    }
  }
  
  // Apply variant if specified
  if (args.variant && profile.variants) {
    const variant = profile.variants.find(v => v.id === args.variant);
    if (variant && variant.autoAnswers) {
      console.log('Applied variant: ' + variant.name);
    }
  }
  
  return { 
    message: 'Skyhook initialized successfully!',
    projectId,
    profile: profileName,
    variant: args.variant || 'none',
    nextSteps: [
      'Edit .skyhook/context.md with your project context',
      'Edit .skyhook/vision.md with your product vision',
      'Run skyhook discover to start requirements gathering',
      'Commit .skyhook/ to version control'
    ]
  };
}

export async function cmdDiscover(ctx, args) {
  const skyhookDir = ctx.skyhookDir;
  const projectYaml = readYaml(path.join(skyhookDir, 'project.yaml'));
  const profile = loadProfile(projectYaml?.profile || 'web-app');
  
  if (!profile) {
    return { error: 'Profile not found' };
  }
  
  const phase = args.phase || 'all';
  const answers = args.answers || {};
  
  const results = {
    project: projectYaml,
    profile: profile.id,
    phases: {},
    questions: [],
    answersReceived: Object.keys(answers).length
  };
  
  // Load existing data
  const existing = {
    functional: readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] },
    nonFunctional: readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] },
    constraints: readYaml(path.join(skyhookDir, 'requirements', 'constraints.yaml')) || { constraints: [] },
    decisions: readYaml(path.join(skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] },
    backlog: readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [], tasks: [] }
  };
  
  // Phase order
  const phases = ['init', 'vision', 'requirements', 'architecture', 'ux', 'tech', 'plan'];
  
  for (const p of phases) {
    if (phase !== 'all' && phase !== p) continue;
    
    const phaseQuestions = profile.questions?.[p] || [];
    results.phases[p] = { questions: phaseQuestions.length, answered: 0 };
    
    for (const q of phaseQuestions) {
      if (answers[q.id]) {
        results.phases[p].answered++;
      } else {
        results.questions.push(q);
      }
    }
  }
  
  // Apply answers if provided
  if (Object.keys(answers).length > 0) {
    // Update project.yaml with answers
    const updatedProject = { ...projectYaml, updatedAt: getTimestamp() };
    for (const [key, value] of Object.entries(answers)) {
      updatedProject[key] = value;
    }
    writeYaml(path.join(skyhookDir, 'project.yaml'), updatedProject);
    results.updated = true;
  }
  
  return results;
}

export async function cmdQuestion(ctx, args) {
  const skyhookDir = ctx.skyhookDir;
  const projectYaml = readYaml(path.join(skyhookDir, 'project.yaml'));
  const profile = loadProfile(projectYaml?.profile || 'web-app');
  
  if (!profile) return { error: 'Profile not found' };
  
  const category = args.category || 'all';
  const limit = args.limit || 10;
  
  const questions = [];
  const phases = Object.keys(profile.questions || {});
  
  for (const phase of phases) {
    if (category !== 'all' && category !== phase) continue;
    for (const q of profile.questions[phase]) {
      questions.push({ ...q, phase });
    }
  }
  
  return { questions: questions.slice(0, limit), total: questions.length };
}

export async function cmdPlan(ctx, args = {}) {
  // Normalize args if array or object
  let parsedArgs = args;
  if (Array.isArray(args)) {
    parsedArgs = { _: [] };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('--')) {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          parsedArgs[key] = next;
          i++;
        } else {
          parsedArgs[key] = true;
        }
      } else if (a.startsWith('-')) {
        parsedArgs[a.slice(1)] = true;
      } else {
        parsedArgs._.push(a);
      }
    }
  } else if (!parsedArgs || typeof parsedArgs !== 'object') {
    parsedArgs = {};
  }

  const projectDir = path.dirname(ctx.skyhookDir);

  // Raw Mermaid format requested
  if (parsedArgs.format === 'mermaid') {
    const backlog = ctx.readBacklog();
    const chart = GanttGenerator.generateGantt(backlog);
    return { format: 'mermaid', chart };
  }

  // Scoped Requirement Plan
  if (parsedArgs.req || parsedArgs.requirement) {
    let reqId = parsedArgs.req || parsedArgs.requirement;
    if (reqId === true && parsedArgs._ && parsedArgs._.length > 0) {
      reqId = parsedArgs._[0];
    }
    const result = PlanCompiler.compileScopedPlan(ctx, 'req', reqId, { projectDir });
    return {
      message: `Requirement plan generated for ${result.req.id}`,
      path: result.path,
      type: 'requirement',
      id: result.req.id,
      content: result.content
    };
  }

  // Scoped Epic Plan
  if (parsedArgs.epic) {
    let epicId = parsedArgs.epic;
    if (epicId === true && parsedArgs._ && parsedArgs._.length > 0) {
      epicId = parsedArgs._[0];
    }
    const result = PlanCompiler.compileScopedPlan(ctx, 'epic', epicId, { projectDir });
    return {
      message: `Epic plan generated for ${result.epic.id}`,
      path: result.path,
      type: 'epic',
      id: result.epic.id,
      content: result.content
    };
  }

  // All plans (master plan + all scoped plans)
  if (parsedArgs.all) {
    const masterRes = await PlanCompiler.compileMasterPlan(ctx, { projectDir });
    const scopedRes = PlanCompiler.compileScopedPlan(ctx, 'all', null, { projectDir });
    return {
      message: 'Master project plan and all scoped requirement/epic plans compiled successfully',
      path: masterRes.path,
      forecast: masterRes.forecast,
      criticalPath: masterRes.criticalPath,
      stats: masterRes.stats,
      scopedPlans: scopedRes
    };
  }

  // Default: compile master plan
  return await PlanCompiler.compileMasterPlan(ctx, { projectDir });
}

export async function cmdStandards(ctx, args) {
  const skyhookDir = ctx.skyhookDir;
  const projectYaml = readYaml(path.join(skyhookDir, 'project.yaml'));
  const profile = loadProfile(projectYaml?.profile || 'web-app');
  const standards = ctx.readStandards();
  
  const builtin = profile?.standards || {};
  const overrides = projectYaml?.configuration?.standardsOverrides || {};
  const adoptions = standards.adoptions || [];
  
  const allStandards = new Set([...Object.keys(builtin), ...Object.keys(overrides), ...adoptions.map(a => a.standard)]);
  
  const result = [];
  for (const std of allStandards) {
    const level = overrides[std] || builtin[std] || 'advisory';
    const adoption = adoptions.find(a => a.standard === std);
    result.push({
      standard: std,
      level,
      source: overrides[std] ? 'project-override' : builtin[std] ? 'profile-default' : 'adopted',
      adoptedAt: adoption?.adoptedAt,
      notes: adoption?.notes
    });
  }
  
  return { standards: result };
}

export async function cmdInstall(ctx, args) {
  const scope = args.scope || 'global';
  const force = args.force || false;
  
  if (scope === 'global') {
    const home = process.env.HOME || process.env.USERPROFILE;
    const targetDir = path.join(home, '.skyhook', 'skill');
    
    if (fs.existsSync(targetDir) && !force) {
      return { error: 'Already installed globally. Use --force to reinstall.' };
    }
    
    // Copy skill directory
    const srcDir = SKYHOOK_ROOT;
    fs.cpSync(srcDir, targetDir, { recursive: true });
    
    return { 
      message: 'Skyhook skill installed globally',
      path: targetDir,
      usage: 'Add to your agent config or run via skyhook-cmd'
    };
  }
  
  return { error: 'Unknown scope. Use "global" or "local".' };
}

export async function cmdSetup(ctx, args) {
  const agent = args.agent || 'codex';
  const cwd = process.cwd();
  
  const skyhookRoot = SKYHOOK_ROOT;
  const skyhookCmd = path.join(skyhookRoot, 'cli', 'skyhook.js');
  
  switch (agent) {
    case 'codex': {
      const agentsPath = path.join(cwd, '.codex', 'agents.md');
      const agentsDir = path.dirname(agentsPath);
      if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
      
      const agentsMd = '# Skyhook Agents\n\n' +
'This project uses Skyhook for persistent, structured project intelligence.\n\n' +
'## Available Commands\n\n' +
'All Skyhook commands are available via `skyhook-cmd` binary (stdio JSON protocol).\n\n' +
'### Key Slash Commands\n\n' +
'- `/skyhook-listCurrentFeatures` - List all features with status\n' +
'- `/skyhook-getFeature --id=EPIC-XXX` - Get detailed feature info\n' +
'- `/skyhook-getNextTask` - Get highest priority ready task\n' +
'- `/skyhook-getBlockers` - Get all blocked items\n' +
'- `/skyhook-recordDecision` - Record architectural decision (auto-generates ADR)\n' +
'- `/skyhook-updateStatus` - Update story status\n' +
'- `/skyhook-getContext` - Get relevant context for a topic\n' +
'- `/skyhook-sync` - Check code vs documentation drift\n' +
'- `/skyhook-addFeature` - Add new feature with stories\n' +
'- `/skyhook-trace --id=REQ-XXX` - Trace requirement to code\n' +
'- `/skyhook-impact --id=REQ-XXX` - Analyze impact of changing a requirement\n' +
'- `/skyhook-untraced` - Find requirements with no code references\n' +
'- `/skyhook-dashboard start` - Start web dashboard (http://localhost:4343)\n' +
'- `/skyhook-init` - Initialize project with profile\n' +
'- `/skyhook-discover` - Run discovery workflow\n' +
'- `/skyhook-question` - Get contextual questions\n' +
'- `/skyhook-plan` - Generate project plan\n' +
'- `/skyhook-standards` - Show applicable standards\n' +
'- `/skyhook-profile` - Show profile details\n' +
'- `/skyhook-version` - Show version info\n' +
'- `/skyhook-decide` - Shorthand for recordDecision\n' +
'- `/skyhook-batchCreate` - Bulk create features/stories/requirements/decisions\n' +
'- `/skyhook-setup` - Auto-configure agent harness\n' +
'- `/skyhook-help` - Show this help\n\n' +
'## Traceability\n\n' +
'Use `@skyhook-implements REQ-XXX` comments in code:\n\n' +
'```typescript\n// @skyhook-implements REQ-003\nexport function RevenueChart() { ... }\n```\n\n' +
'Then use:\n' +
'- `/skyhook-trace --id=REQ-003` - Find code implementing a requirement\n' +
'- `/skyhook-impact --id=REQ-003` - Analyze change impact\n' +
'- `/skyhook-untraced` - Find requirements with no code refs\n\n' +
'## Setup\n\n' +
'Run `skyhook setup codex` to create this file.\n';
      fs.writeFileSync(agentsPath, agentsMd);
      return { success: true, files: ['.codex/agents.md'] };
    }
    
    case 'claude': {
      const claudeDir = path.join(cwd, '.claude', 'commands');
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      
      const commands = [
        { name: 'skyhook-listCurrentFeatures', description: 'List all features with status', args: 'status?: all|backlog|in-progress|done|blocked' },
        { name: 'skyhook-getFeature', description: 'Get detailed feature info', args: 'id: string' },
        { name: 'skyhook-getNextTask', description: 'Get highest priority ready task', args: 'assignee?: string' },
        { name: 'skyhook-getBlockers', description: 'Get all blocked items', args: '' },
        { name: 'skyhook-recordDecision', description: 'Record architectural decision', args: 'title, decision, context, status?, category?, alternatives?, relatedRequirements?, consequences?, rationale?' },
        { name: 'skyhook-updateStatus', description: 'Update story status', args: 'storyId, status: backlog|ready|in-progress|in-review|done|blocked|cancelled' },
        { name: 'skyhook-getContext', description: 'Get relevant context for a topic', args: 'topic?: string' }
      ];
      
      for (const cmd of commands) {
        const cmdFile = path.join(claudeDir, cmd.name + '.md');
        let content = '---\ndescription: ' + cmd.description + '\n---\n';
        content += '# /' + cmd.name + '\n\n';
        if (cmd.args) {
          content += 'Args: ' + cmd.args + '\n\n';
        }
        content += 'Run: `echo \'{"command":"' + cmd.name.replace('skyhook-', '') + '","args":{}}\' | node ' + (process.env.SKYHOOK_ROOT || skyhookRoot) + '/skill/commands/index.js`';
        fs.writeFileSync(cmdFile, content);
      }
      
      return { success: true, files: commands.map(c => '.claude/commands/' + c.name + '.md') };
    }
    
    case 'gemini': {
      const geminiDir = path.join(cwd, '.gemini', 'functions');
      if (!fs.existsSync(geminiDir)) fs.mkdirSync(geminiDir, { recursive: true });
      
      const functionsJs = '/**\n' +
' * Skyhook Functions for Gemini CLI\n' +
' * Auto-generated by `skyhook setup gemini`\n' +
' */\n\n' +
'const { execSync } = require(\'child_process\');\n' +
'const path = require(\'path\');\n\n' +
'const SKYHOOK_ROOT = process.env.SKYHOOK_ROOT || \'' + skyhookRoot.replace(/\\/g, '\\\\') + '\';\n\n' +
'function runSkyhook(command, args = {}) {\n' +
'  const input = JSON.stringify({ command, args });\n' +
'  try {\n' +
'    const result = execSync(`node ${SKYHOOK_ROOT}/skill/commands/index.js`, {\n' +
'      input,\n' +
'      encoding: \'utf-8\',\n' +
'      maxBuffer: 10 * 1024 * 1024,\n' +
'      cwd: process.cwd()\n' +
'    });\n' +
'    return JSON.parse(result);\n' +
'  } catch (e) {\n' +
'    return { error: e.message, stdout: e.stdout, stderr: e.stderr };\n' +
'  }\n' +
'}\n\n' +
'module.exports = {\n' +
'  skyhook_list_features: {\n' +
'    description: \'List all features with status\',\n' +
'    parameters: { type: \'object\', properties: { status: { type: \'string\', enum: [\'all\', \'backlog\', \'in-progress\', \'done\', \'blocked\'] } } },\n' +
'    execute: async ({ status = \'all\' }) => runSkyhook(\'listCurrentFeatures\', { status })\n' +
'  },\n' +
'  skyhook_get_feature: {\n' +
'    description: \'Get detailed feature info\',\n' +
'    parameters: { type: \'object\', properties: { id: { type: \'string\' } }, required: [\'id\'] },\n' +
'    execute: async ({ id }) => runSkyhook(\'getFeature\', { id })\n' +
'  },\n' +
'  skyhook_next_task: {\n' +
'    description: \'Get highest priority ready task\',\n' +
'    parameters: { type: \'object\', properties: { assignee: { type: \'string\' } } },\n' +
'    execute: async ({ assignee = \'default\' }) => runSkyhook(\'getNextTask\', { assignee })\n' +
'  },\n' +
'  skyhook_get_blockers: {\n' +
'    description: \'Get all blocked items\',\n' +
'    parameters: { type: \'object\', properties: {} },\n' +
'    execute: async () => runSkyhook(\'getBlockers\', {})\n' +
'  },\n' +
'  skyhook_record_decision: {\n' +
'    description: \'Record architectural decision (auto-generates ADR)\',\n' +
'    parameters: { type: \'object\', properties: { title: { type: \'string\' }, decision: { type: \'string\' }, context: { type: \'string\' }, status: { type: \'string\' }, category: { type: \'string\' }, alternatives: { type: \'array\' }, relatedRequirements: { type: \'array\' }, consequences: { type: \'array\' }, rationale: { type: \'string\' } }, required: [\'title\', \'decision\', \'context\'] },\n' +
'    execute: async (args) => runSkyhook(\'recordDecision\', args)\n' +
'  },\n' +
'  skyhook_sync: {\n' +
'    description: \'Check code vs documentation drift\',\n' +
'    parameters: { type: \'object\', properties: {} },\n' +
'    execute: async () => runSkyhook(\'sync\', {})\n' +
'  },\n' +
'  skyhook_get_context: {\n' +
'    description: \'Get relevant context for a topic\',\n' +
'    parameters: { type: \'object\', properties: { topic: { type: \'string\' } } },\n' +
'    execute: async ({ topic = \'general\' }) => runSkyhook(\'getContext\', { topic })\n' +
'  },\n' +
'  skyhook_dashboard: {\n' +
'    description: \'Control the on-demand web dashboard\',\n' +
'    parameters: { type: \'object\', properties: { action: { type: \'string\', enum: [\'start\', \'stop\', \'status\'] } }, required: [\'action\'] },\n' +
'    execute: async ({ action }) => runSkyhook(\'dashboard\', { action })\n' +
'  }\n' +
'};\n';
      fs.writeFileSync(path.join(geminiDir, 'skyhook.js'), functionsJs);
      
      // Also create settings.json
      const settingsPath = path.join(cwd, '.gemini', 'settings.json');
      let settings = { functions: {}, permissions: { allow: [] } };
      if (fs.existsSync(settingsPath)) {
        try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch (e) { console.error(e); }
      }
      settings.functions.skyhook = '.gemini/functions/skyhook.js';
      settings.permissions.allow = [...new Set([...(settings.permissions.allow || []), 'skyhook_*'])];
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      
      return { success: true, files: ['.gemini/functions/skyhook.js', '.gemini/settings.json'] };
    }
    
    case 'copilot': {
      const copilotPath = path.join(cwd, '.github', 'copilot-instructions.md');
      const copilotDir = path.dirname(copilotPath);
      if (!fs.existsSync(copilotDir)) fs.mkdirSync(copilotDir, { recursive: true });
      
      const copilotMd = '# Skyhook Project Intelligence\n\n' +
'This project uses Skyhook for persistent, structured project intelligence.\n\n' +
'## Skyhook Commands\n\n' +
'All Skyhook commands are available via `skyhook-cmd` binary (stdio JSON protocol).\n\n' +
'### Key Commands for Copilot\n\n' +
'- **List features**: `echo \'{"command":"listCurrentFeatures","args":{}}\' | skyhook-cmd`\n' +
'- **Next task**: `echo \'{"command":"getNextTask","args":{}}\' | skyhook-cmd`\n' +
'- **Blockers**: `echo \'{"command":"getBlockers","args":{}}\' | skyhook-cmd`\n' +
'- **Trace requirement**: `echo \'{"command":"trace","args":{"id":"REQ-001"}}\' | skyhook-cmd`\n' +
'- **Impact analysis**: `echo \'{"command":"impact","args":{"id":"REQ-001"}}\' | skyhook-cmd`\n' +
'- **Record decision**: `echo \'{"command":"recordDecision","args":{"title":"...","decision":"...","context":"..."}}\' | skyhook-cmd`\n' +
'- **Sync check**: `echo \'{"command":"sync","args":{}}\' | skyhook-cmd`\n' +
'- **Get context**: `echo \'{"command":"getContext","args":{"topic":"authentication"}}\' | skyhook-cmd`\n' +
'- **Dashboard**: `skyhook-cmd dashboard start` (opens http://localhost:4343)\n\n' +
'## Traceability\n\n' +
'Use `@skyhook-implements REQ-XXX` comments in code:\n\n' +
'```typescript\n// @skyhook-implements REQ-003\nexport function RevenueChart() { ... }\n```\n\n' +
'Then use:\n' +
'- `/skyhook-trace --id=REQ-003` - Find code implementing a requirement\n' +
'- `/skyhook-impact --id=REQ-003` - Analyze change impact\n' +
'- `/skyhook-untraced` - Find requirements with no code refs\n';
      fs.writeFileSync(copilotPath, copilotMd);
      
      // VS Code tasks
      const vscodeDir = path.join(cwd, '.vscode');
      if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
      
      const tasksJson = {
        version: '2.0.0',
        tasks: [
          {
            label: 'Skyhook: Start Dashboard',
            type: 'shell',
            command: 'skyhook-cmd dashboard start',
            isBackground: true,
            presentation: { reveal: 'never' }
          }
        ]
      };
      fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), JSON.stringify(tasksJson, null, 2));
      
      return { success: true, files: ['.github/copilot-instructions.md', '.vscode/tasks.json'] };
    }
    
    case 'antigravity': {
      const home = process.env.HOME || process.env.USERPROFILE;
      const pluginsDir = path.join(home, '.gemini', 'config', 'plugins');
      if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
      
      const targetLink = path.join(pluginsDir, 'skyhook-plugin');
      try { fs.rmSync(targetLink, { recursive: true, force: true }); } catch (e) { /* ignore */ }
      
      const antigravityPluginDir = path.join(skyhookRoot, 'antigravity-plugin');
      fs.symlinkSync(antigravityPluginDir, targetLink, 'junction');
      return { success: true, message: `Linked Skyhook plugin to ${targetLink}` };
    }
    
    case 'all': {
      const results = [];
      for (const a of ['codex', 'claude', 'gemini', 'copilot', 'antigravity']) {
        const result = await cmdSetup(ctx, { agent: a });
        results.push({ agent: a, ...result });
      }
      return { results };
    }
    
    default:
      return { error: 'Unknown agent: ' + agent };
  }
}

