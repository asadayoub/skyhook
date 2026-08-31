#!/usr/bin/env node

/**
 * Skyhook Slash Command Handler - Uses simple-yaml (no external deps)
 * Local-only: runs via CLI, communicates via stdio JSON.
 */

const fs = require('fs');
const path = require('path');
const { parseYaml, stringifyYaml } = require('./simple-yaml.js');
const { traceRequirement, analyzeImpact, findUntracedRequirements } = require('./trace.js');
const { generateADR } = require('./adr.js');
const { inferFromRepo } = require('../lib/inference.js');

const SKYHOOK_ROOT = path.resolve(__dirname, '..', '..');
const SKYHOOK_VERSION = '1.3.0';

// ==================== UTILITIES ====================

function findSkyhookDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.skyhook'))) {
      return path.join(dir, '.skyhook');
    }
    dir = path.dirname(dir);
  }
  return null;
}

function readYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

function writeYaml(filePath, data) {
  fs.writeFileSync(filePath, stringifyYaml(data), 'utf-8');
}

function generateULID() {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let id = '';
  for (let i = 0; i < 26; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function getTimestamp() {
  return new Date().toISOString();
}

function appendChangelog(skyhookDir, entry) {
  const changelogPath = path.join(skyhookDir, 'changelog.md');
  let content = fs.readFileSync(changelogPath, 'utf-8');
  const lines = content.split('\n');
  const insertIdx = lines.findIndex(l => l.includes('## [Unreleased]')) + 1;
  lines.splice(insertIdx, 0, entry);
  fs.writeFileSync(changelogPath, lines.join('\n'), 'utf-8');
}

// ==================== PROFILE LOADING ====================

function loadProfile(profileName) {
  const profilePath = path.join(SKYHOOK_ROOT, 'profiles', profileName + '.yaml');
  if (fs.existsSync(profilePath)) {
    return readYaml(profilePath);
  }
  return null;
}

// ==================== SKYHOOK CONTEXT ====================

class SkyhookContext {
  constructor(skyhookDir) {
    this.skyhookDir = skyhookDir;
  }

  readFunctionalReqs() {
    return readYaml(path.join(this.skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  }
  
  readNonFunctionalReqs() {
    return readYaml(path.join(this.skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  }
  
  readConstraints() {
    return readYaml(path.join(this.skyhookDir, 'requirements', 'constraints.yaml')) || { constraints: [] };
  }

  readDecisions() {
    return readYaml(path.join(this.skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] };
  }
  
  readDecisionDetail(id) {
    const detailPath = path.join(this.skyhookDir, 'decisions', id + '.md');
    if (fs.existsSync(detailPath)) {
      return fs.readFileSync(detailPath, 'utf-8');
    }
    return null;
  }
  
  writeDecision(data) {
    const id = generateULID();
    const detailPath = path.join(this.skyhookDir, 'decisions', id + '.md');
    
    // Generate full ADR with auto-fill
    const projectDir = process.cwd();
    const projectYaml = readYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
    const context = {
      projectDir,
      projectType: projectYaml.type,
      profile: projectYaml.profile,
      techStack: this.readTechStack()
    };
    
    const adrContent = generateADR({ ...data, id }, context);
    
    fs.writeFileSync(detailPath, adrContent, 'utf-8');
    
    // Update index
    const indexPath = path.join(this.skyhookDir, 'decisions', 'index.yaml');
    const index = readYaml(indexPath) || { schemaVersion: "1.0.0", decisions: [] };
    index.decisions.push({
      id, title: data.title, status: data.status || 'accepted',
      category: data.category || 'architecture', createdAt: getTimestamp()
    });
    writeYaml(indexPath, index);
    
    appendChangelog(this.skyhookDir, '- Recorded decision: ' + data.title + ' (' + id + ')');
    
    return id;
  }

  readBacklog() {
    return readYaml(path.join(this.skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [], tasks: [] };
  }
  
  writeBacklog(data) {
    writeYaml(path.join(this.skyhookDir, 'backlog', 'epics.yaml'), data);
  }
  
  updateStoryStatus(storyId, status) {
    const backlog = this.readBacklog();
    const story = backlog.stories.find(s => s.id === storyId);
    if (story) {
      const oldStatus = story.status;
      story.status = status;
      story.updatedAt = getTimestamp();
      if (status === 'in-progress' && !story.startedAt) story.startedAt = getTimestamp();
      if (status === 'done' && !story.completedAt) story.completedAt = getTimestamp();
      this.writeBacklog(backlog);
      appendChangelog(this.skyhookDir, '- Story ' + storyId + ': ' + oldStatus + ' to ' + status);
      return true;
    }
    return false;
  }
  
  addFeature(featureData) {
    const backlog = this.readBacklog();
    const epicId = generateULID();
    const storyIds = [];
    
    const epic = {
      id: epicId,
      title: featureData.title,
      description: featureData.description || '',
      goal: featureData.goal || featureData.title,
      successMetrics: featureData.successMetrics || [],
      childStories: [],
      targetDate: featureData.targetDate || null,
      status: 'backlog',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp()
    };
    
    if (featureData.stories && Array.isArray(featureData.stories)) {
      for (const story of featureData.stories) {
        const storyId = generateULID();
        backlog.stories.push({
          id: storyId,
          epicId,
          title: story.title,
          userStory: story.userStory || '',
          acceptanceCriteria: story.acceptanceCriteria || [],
          priority: story.priority || 'medium',
          status: 'backlog',
          storyPoints: story.storyPoints || null,
          dependsOn: story.dependsOn || [],
          createdAt: getTimestamp(),
          updatedAt: getTimestamp()
        });
        epic.childStories.push(storyId);
        storyIds.push(storyId);
      }
    }
    
    backlog.epics.push(epic);
    backlog.metadata = backlog.metadata || {};
    backlog.metadata.updatedAt = getTimestamp();
    this.writeBacklog(backlog);
    
    appendChangelog(this.skyhookDir, '- Added feature: ' + featureData.title + ' (' + epicId + ') with ' + storyIds.length + ' stories');
    
    return { epicId, storyIds };
  }

  readTechStack() {
    return readYaml(path.join(this.skyhookDir, 'tech-stack.yaml')) || { technologies: [], patterns: [], constraints: [] };
  }
  
  writeTechStack(data) {
    writeYaml(path.join(this.skyhookDir, 'tech-stack.yaml'), data);
  }

  readStandards() {
    return readYaml(path.join(this.skyhookDir, 'standards', 'index.yaml')) || { overrides: [], adoptions: [] };
  }

  readProjectYaml() {
    return readYaml(path.join(this.skyhookDir, 'project.yaml')) || {};
  }
}

// ==================== EXISTING COMMANDS ====================

async function cmdListCurrentFeatures(ctx, args) {
  const backlog = ctx.readBacklog();
  const filter = args.status || 'all';
  
  // Ensure arrays
  let epics = backlog.epics || [];
  if (!Array.isArray(epics)) epics = Object.values(epics);
  let stories = backlog.stories || [];
  if (!Array.isArray(stories)) stories = Object.values(stories);
  
  if (filter !== 'all') {
    stories = stories.filter(s => s.status === filter);
  }
  
  // Group by epic
  const result = epics.map(epic => ({
    epic: { id: epic.id, title: epic.title, status: epic.status },
    stories: stories.filter(s => s.epicId === epic.id).map(s => ({
      id: s.id, title: s.title, status: s.status, priority: s.priority
    }))
  }));
  
  return { features: result };
}

async function cmdGetFeature(ctx, args) {
  const backlog = ctx.readBacklog();
  const feature = backlog.epics.find(e => e.id === args.id);
  if (!feature) return { error: 'Feature not found: ' + args.id };
  
  const stories = backlog.stories.filter(s => s.epicId === args.id);
  return { feature, stories };
}

async function cmdGetNextTask(ctx, args) {
  const backlog = ctx.readBacklog();
  const assignee = args.assignee || 'default';
  
  const readyStories = backlog.stories
    .filter(s => s.status === 'ready')
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
  
  if (readyStories.length === 0) {
    return { message: 'No ready tasks found', task: null };
  }
  
  const task = readyStories[0];
  return { task };
}

async function cmdGetBlockers(ctx, args) {
  const backlog = ctx.readBacklog();
  const blocked = backlog.stories.filter(s => s.status === 'blocked');
  return { blockers: blocked };
}

async function cmdRecordDecision(ctx, args) {
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
  
  return { decisionId: id, message: 'Decision recorded successfully with auto-generated ADR' };
}

async function cmdUpdateStatus(ctx, args) {
  if (!args.storyId || !args.status) {
    return { error: 'Missing required: storyId, status' };
  }
  
  const validStatuses = ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'];
  if (!validStatuses.includes(args.status)) {
    return { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') };
  }
  
  const success = ctx.updateStoryStatus(args.storyId, args.status);
  if (!success) return { error: 'Story not found: ' + args.storyId };
  
  return { success: true, storyId: args.storyId, status: args.status };
}

async function cmdGetContext(ctx, args) {
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

async function cmdSync(ctx, args) {
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

async function cmdAddFeature(ctx, args) {
  if (!args.title) return { error: 'Missing required: title' };
  
  const result = ctx.addFeature({
    title: args.title,
    description: args.description,
    goal: args.goal,
    successMetrics: args.successMetrics,
    stories: args.stories,
    targetDate: args.targetDate
  });
  
  return { success: true, ...result };
}

async function cmdTrace(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = process.cwd();
  return traceRequirement(args.id, projectDir);
}

async function cmdImpact(ctx, args) {
  if (!args.id) return { error: 'Missing required: id (requirement ID)' };
  const projectDir = process.cwd();
  return analyzeImpact(args.id, projectDir);
}

async function cmdUntraced(ctx, args) {
  const projectDir = process.cwd();
  return findUntracedRequirements(projectDir);
}

// ==================== DASHBOARD ====================

const DASHBOARD_PORT = 4343;
let dashboardServer = null;
let projectsCache = null;
let projectsCacheTime = 0;

async function scanProjects() {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) return [];
  
  const skyhookDir = path.join(home, '.skyhook');
  if (!fs.existsSync(skyhookDir)) return [];
  
  const projects = [];
  const entries = fs.readdirSync(skyhookDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projDir = path.join(skyhookDir, entry.name);
    const projectYaml = path.join(projDir, 'project.yaml');
    if (fs.existsSync(projectYaml)) {
      const data = readYaml(projectYaml);
      if (data) {
        projects.push({
          id: data.id || entry.name,
          name: data.name || entry.name,
          description: data.description || '',
          type: data.type || 'unknown',
          profile: data.profile || 'unknown',
          path: projDir,
          updatedAt: data.updatedAt || data.createdAt || ''
        });
      }
    }
  }
  return projects;
}

async function cmdDashboard(ctx, args) {
  const action = args.action || 'status';
  
  if (action === 'start') {
    if (dashboardServer) {
      return { message: 'Dashboard already running at http://localhost:' + DASHBOARD_PORT };
    }
    
    try {
      const http = require('http');
      const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }
        
        if (req.url === '/api/projects') {
          const now = Date.now();
          if (!projectsCache || now - projectsCacheTime > 30000) {
            projectsCache = await scanProjects();
            projectsCacheTime = now;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ projects: projectsCache }));
          return;
        }
        
        if (req.url.startsWith('/api/data/')) {
          const projectId = req.url.split('/api/data/')[1];
          const home = process.env.HOME || process.env.USERPROFILE;
          const projDir = path.join(home, '.skyhook', projectId);
          
          if (!fs.existsSync(projDir)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Project not found' }));
            return;
          }
          
          const data = {
            project: readYaml(path.join(projDir, 'project.yaml')),
            backlog: readYaml(path.join(projDir, 'backlog', 'epics.yaml')),
            decisions: readYaml(path.join(projDir, 'decisions', 'index.yaml')),
            requirements: {
              functional: readYaml(path.join(projDir, 'requirements', 'functional.yaml')),
              nonFunctional: readYaml(path.join(projDir, 'requirements', 'non-functional.yaml')),
              constraints: readYaml(path.join(projDir, 'requirements', 'constraints.yaml'))
            },
            techStack: readYaml(path.join(projDir, 'tech-stack.yaml')),
            standards: readYaml(path.join(projDir, 'standards', 'index.yaml'))
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }
        
        // Serve static files
        const publicDir = path.join(SKYHOOK_ROOT, 'dashboard', 'public');
        let filePath = path.join(publicDir, req.url === '/' ? 'index.html' : req.url);
        
        // Prevent directory traversal
        if (!filePath.startsWith(publicDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        
        try {
          const content = fs.readFileSync(filePath);
          const ext = path.extname(filePath);
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
          };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
          res.end(content);
        } catch (e) {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      server.listen(DASHBOARD_PORT, '127.0.0.1', () => {
        dashboardServer = server;
      });
      
      return { message: 'Dashboard started at http://localhost:' + DASHBOARD_PORT, port: DASHBOARD_PORT };
    } catch (e) {
      return { error: 'Failed to start dashboard: ' + e.message };
    }
  }
  
  if (action === 'stop') {
    if (dashboardServer) {
      dashboardServer.close();
      dashboardServer = null;
      projectsCache = null;
      return { message: 'Dashboard stopped' };
    }
    return { message: 'Dashboard not running' };
  }
  
  return { 
    running: !!dashboardServer, 
    port: DASHBOARD_PORT,
    url: dashboardServer ? 'http://localhost:' + DASHBOARD_PORT : null
  };
}

// ==================== NEW COMMANDS ====================

async function cmdInit(ctx, args) {
  const projectDir = process.cwd();
  const skyhookDir = path.join(projectDir, '.skyhook');
  
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
    'tech-stack.yaml': 'schemaVersion: "1.0.0"\ntechnologies: []\npatterns: []\nconstraints: []',
    'ux/styleguide.md': '# Design System\n\n## Color Palette\n\n| Role | Light | Dark | Usage |\n|------|-------|------|-------|\n\n## Typography\n\n| Element | Font | Size | Weight |\n|---------|------|------|--------|\n\n## Spacing\n\n| Token | Value |\n|-------|-------|\n\n## Components\n\n| Component | Variants | States |\n|-----------|----------|--------|\n\n*Generated by Skyhook on ' + getTimestamp() + '*',
    'changelog.md': '# Changelog\n\n## [Unreleased]\n\n*Generated by Skyhook on ' + getTimestamp() + '*'
  };
  
  for (const [file, content] of Object.entries(templates)) {
    const filePath = path.join(skyhookDir, file);
    if (!fs.existsSync(filePath) || args.force) {
      fs.writeFileSync(filePath, content, 'utf-8');
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

async function cmdDiscover(ctx, args) {
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

async function cmdQuestion(ctx, args) {
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

async function cmdPlan(ctx, args) {
  const skyhookDir = ctx.skyhookDir;
  const projectYaml = readYaml(path.join(skyhookDir, 'project.yaml'));
  const profile = loadProfile(projectYaml?.profile || 'web-app');
  const backlog = ctx.readBacklog();
  const funcReqs = ctx.readFunctionalReqs();
  const nfReqs = ctx.readNonFunctionalReqs();
  const decisions = ctx.readDecisions();
  
  const planPath = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');
  
  let funcReqsList = 'No functional requirements defined.';
  if (funcReqs.requirements && funcReqs.requirements.length > 0) {
    funcReqsList = funcReqs.requirements.map(r => '- **' + (r.id || 'NEW') + '**: ' + (r.userStory || r.title) + ' [' + (r.priority || 'medium') + ']').join('\n');
  }
  
  let nfReqsList = 'No non-functional requirements defined.';
  if (nfReqs.requirements && nfReqs.requirements.length > 0) {
    nfReqsList = nfReqs.requirements.map(r => '- **' + (r.id || 'NEW') + '**: ' + r.category + ' - ' + r.metric + ': ' + r.target + ' [' + (r.priority || 'medium') + ']').join('\n');
  }
  
  let epicsList = 'No epics defined.';
  if (backlog.epics && backlog.epics.length > 0) {
    epicsList = backlog.epics.map(e => '- **' + e.id + '**: ' + e.title + ' (' + (e.childStories?.length || 0) + ' stories) [' + (e.status || 'backlog') + ']').join('\n');
  }
  
  let storiesByPriority = '';
  const byPriority = { critical: [], high: [], medium: [], low: [] };
  for (const s of backlog.stories || []) {
    let priority = s.priority || 'medium';
    // Convert numeric priority to string
    if (typeof priority === 'number') {
      if (priority >= 90) priority = 'critical';
      else if (priority >= 75) priority = 'high';
      else if (priority >= 50) priority = 'medium';
      else priority = 'low';
    }
    if (!byPriority[priority]) priority = 'medium';
    byPriority[priority].push(s);
  }
  for (const [p, stories] of Object.entries(byPriority)) {
    if (stories.length > 0) {
      storiesByPriority += '#### ' + p.charAt(0).toUpperCase() + p.slice(1) + ' (' + stories.length + ')\n';
      storiesByPriority += stories.map(s => '- **' + s.id + '**: ' + s.title + ' [' + s.status + ']').join('\n');
      storiesByPriority += '\n\n';
    }
  }
  if (!storiesByPriority) storiesByPriority = 'No stories defined.';
  
  let standardsList = 'No standards defined.';
  if (profile?.standards) {
    standardsList = Object.entries(profile.standards).map(([k, v]) => '- **' + k + '**: ' + v).join('\n');
  }
  
  let overridesList = 'No overrides.';
  if (projectYaml?.configuration?.standardsOverrides) {
    overridesList = Object.entries(projectYaml.configuration.standardsOverrides).map(([k, v]) => '- **' + k + '**: ' + v + ' (override)').join('\n');
  }
  
  let archDecisions = 'No architecture decisions recorded.';
  if (decisions.decisions && decisions.decisions.length > 0) {
    const arch = decisions.decisions.filter(d => d.category === 'architecture');
    if (arch.length > 0) {
      archDecisions = arch.map(d => '- **' + d.id + '**: ' + d.title + ' (' + d.status + ')').join('\n');
    }
  }
  
  const plan = '# Project Plan: ' + (projectYaml?.name || 'Untitled') + '\n\n' +
'**Project ID**: ' + (projectYaml?.id || 'unknown') + '\n' +
'**Profile**: ' + (projectYaml?.profile || 'unknown') + '\n' +
'**Generated**: ' + getTimestamp() + '\n\n' +
'## Executive Summary\n\n' +
(projectYaml?.description || 'No description provided.') + '\n\n' +
'## Phase 1: Foundation\n\n' +
'### Architecture Decisions\n' +
archDecisions + '\n\n' +
'### Tech Stack\n' +
'- **Language**: TypeScript\n' +
'- **Framework**: ' + (profile?.techStack?.frontend?.framework?.default || 'TBD') + '\n' +
'- **Database**: ' + (profile?.techStack?.backend?.database?.default || 'TBD') + '\n' +
'- **ORM**: ' + (profile?.techStack?.backend?.orm?.default || 'TBD') + '\n' +
'- **Auth**: ' + (profile?.techStack?.backend?.auth?.default || 'TBD') + '\n' +
'- **Deployment**: ' + (profile?.techStack?.deployment?.platform?.default || 'TBD') + '\n\n' +
'## Phase 2: Requirements\n\n' +
'### Functional Requirements (' + (funcReqs.requirements?.length || 0) + ')\n' +
funcReqsList + '\n\n' +
'### Non-Functional Requirements (' + (nfReqs.requirements?.length || 0) + ')\n' +
nfReqsList + '\n\n' +
'## Phase 3: Backlog\n\n' +
'### Epics (' + (backlog.epics?.length || 0) + ')\n' +
epicsList + '\n\n' +
'### Stories by Priority\n' +
storiesByPriority + '\n' +
'## Phase 4: Standards\n\n' +
'### Adopted Standards\n' +
standardsList + '\n\n' +
'### Project Overrides\n' +
overridesList + '\n\n' +
'## Phase 5: Timeline & Milestones\n\n' +
'| Milestone | Target Date | Status | Dependencies |\n' +
'|-----------|-------------|--------|--------------|\n' +
'| Project Initialized | ' + (projectYaml?.createdAt || 'TBD') + ' | Done | - |\n' +
'| Requirements Complete | TBD | Pending | Discovery |\n' +
'| Architecture Decisions | TBD | Pending | Requirements |\n' +
'| MVP Development | TBD | Pending | Architecture |\n' +
'| Beta Release | TBD | Pending | MVP |\n' +
'| Production Launch | TBD | Pending | Beta |\n\n' +
'## Phase 6: Risks & Mitigations\n\n' +
'| Risk | Likelihood | Impact | Mitigation |\n' +
'|------|------------|--------|------------|\n\n' +
'---\n\n' +
'*Generated by Skyhook. Edit this file to customize your plan.*';
  
  fs.writeFileSync(planPath, plan, 'utf-8');
  
  return { 
    message: 'Project plan generated successfully',
    path: planPath,
    stats: {
      epics: backlog.epics?.length || 0,
      stories: backlog.stories?.length || 0,
      functionalReqs: funcReqs.requirements?.length || 0,
      nonFunctionalReqs: nfReqs.requirements?.length || 0,
      decisions: decisions.decisions?.length || 0
    }
  };
}

async function cmdStandards(ctx, args) {
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

async function cmdProfile(ctx, args) {
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

async function cmdVersion(ctx, args) {
  return {
    version: SKYHOOK_VERSION,
    protocol: 'skyhook-stdio-v1',
    node: process.version,
    platform: process.platform
  };
}

async function cmdInstall(ctx, args) {
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

async function cmdSetup(ctx, args) {
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
        try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
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
        version: "2.0.0",
        tasks: [
          { label: "Skyhook: Next Task", type: "shell", command: "echo '{\"command\":\"getNextTask\",\"args\":{}}' | skyhook-cmd", presentation: { reveal: "always", panel: "new" } },
          { label: "Skyhook: List Features", type: "shell", command: "echo '{\"command\":\"listCurrentFeatures\",\"args\":{}}' | skyhook-cmd", presentation: { reveal: "always", panel: "new" } },
          { label: "Skyhook: Check Drift", type: "shell", command: "echo \'{\"command\":\"sync\",\"args\":{}}\' | skyhook-cmd", presentation: { reveal: "always", panel: "new" } },
          { label: "Skyhook: Start Dashboard", type: "shell", command: "skyhook-cmd dashboard start", presentation: { reveal: "always", panel: "new" } }
        ]
      };
      fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), JSON.stringify(tasksJson, null, 2));
      
      return { success: true, files: ['.github/copilot-instructions.md', '.vscode/tasks.json'] };
    }
    
    case 'all': {
      const results = [];
      for (const a of ['codex', 'claude', 'gemini', 'copilot']) {
        const result = await cmdSetup(ctx, { agent: a });
        results.push({ agent: a, ...result });
      }
      return { results };
    }
    
    default:
      return { error: 'Unknown agent: ' + agent };
  }
}

async function cmdDecide(ctx, args) {
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
  
  return { decisionId: id, message: 'Decision recorded successfully with auto-generated ADR' };
}

async function cmdBatchCreate(ctx, args) {
  const items = args.items || [];
  const results = [];
  
  for (const item of items) {
    try {
      let result;
      switch (item.type) {
        case 'feature':
          result = ctx.addFeature(item.data);
          break;
        case 'story':
          // Add story to existing epic
          const backlog = ctx.readBacklog();
          const storyId = generateULID();
          if (!backlog.stories) backlog.stories = [];
          backlog.stories.push({ ...item.data, id: storyId, createdAt: getTimestamp(), updatedAt: getTimestamp() });
          ctx.writeBacklog(backlog);
          result = { storyId };
          break;
        case 'requirement':
          // Add to functional requirements
          const funcReqs = ctx.readFunctionalReqs();
          const reqId = generateULID();
          if (!funcReqs.requirements) funcReqs.requirements = [];
          funcReqs.requirements.push({ ...item.data, id: reqId, createdAt: getTimestamp(), updatedAt: getTimestamp() });
          writeYaml(path.join(ctx.skyhookDir, 'requirements', 'functional.yaml'), funcReqs);
          result = { requirementId: reqId };
          break;
        case 'decision':
          const decisionId = ctx.writeDecision(item.data);
          result = { decisionId: decisionId };
          break;
        default:
          result = { error: 'Unknown type: ' + item.type };
      }
      results.push({ type: item.type, success: !result.error, ...result });
    } catch (e) {
      results.push({ type: item.type, success: false, error: e.message });
    }
  }
  
  return { results, success: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
}

async function cmdHelp(ctx, args) {
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
      { name: 'setup', description: 'Auto-configure agent harness', args: ['agent: codex|claude|gemini|copilot|all'] },
      { name: 'decide', description: 'Shorthand for recordDecision', args: ['title, decision, context, ...'] },
      { name: 'batchCreate', description: 'Bulk create features/stories/requirements/decisions', args: ['items: [{type: feature|story|requirement|decision, data: {...}}]'] }
    ],
    usage: 'echo \'{"command":"listCurrentFeatures","args":{}}\' | node skyhook-cmd.js'
  };
}

// ==================== MAIN ====================

async function main() {
  const skyhookDir = findSkyhookDir();
  if (!skyhookDir) {
    console.error(JSON.stringify({ error: 'No .skyhook directory found. Run skyhook init first.' }));
    process.exit(1);
  }
  
  const ctx = new SkyhookContext(skyhookDir);
  
  let input = { command: 'help', args: {} };
  
  const args = process.argv.slice(2);
  if (args.length > 0) {
    input.command = args[0];
    input.args = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const [key, value] = args[i].slice(2).split('=');
        input.args[key] = value === 'true' ? true : value === 'false' ? false : value;
      }
    }
  } else {
    const stdin = await new Promise(resolve => {
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
    try {
      input = JSON.parse(stdin.trim());
    } catch {
      console.error(JSON.stringify({ error: 'Invalid JSON input' }));
      process.exit(1);
    }
  }
  
  const commands = {
    listCurrentFeatures: cmdListCurrentFeatures,
    getFeature: cmdGetFeature,
    getNextTask: cmdGetNextTask,
    getBlockers: cmdGetBlockers,
    recordDecision: cmdRecordDecision,
    updateStatus: cmdUpdateStatus,
    getContext: cmdGetContext,
    sync: cmdSync,
    addFeature: cmdAddFeature,
    trace: cmdTrace,
    impact: cmdImpact,
    untraced: cmdUntraced,
    dashboard: cmdDashboard,
    help: cmdHelp,
    // New commands
    init: cmdInit,
    discover: cmdDiscover,
    question: cmdQuestion,
    plan: cmdPlan,
    standards: cmdStandards,
    profile: cmdProfile,
    version: cmdVersion,
    install: cmdInstall,
    setup: cmdSetup,
    decide: cmdDecide,
    batchCreate: cmdBatchCreate
  };
  
  const handler = commands[input.command];
  if (!handler) {
    console.error(JSON.stringify({ error: 'Unknown command: ' + input.command }));
    process.exit(1);
  }
  
  try {
    const result = await handler(ctx, input.args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

main();
