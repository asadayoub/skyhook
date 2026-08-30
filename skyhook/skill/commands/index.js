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

const SKYHOOK_ROOT = path.resolve(__dirname, '..', '..');
const SKYHOOK_VERSION = '1.0.0';

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
    const detailPath = path.join(this.skyhookDir, 'decisions', `${id}.md`);
    if (fs.existsSync(detailPath)) {
      return fs.readFileSync(detailPath, 'utf-8');
    }
    return null;
  }
  
  writeDecision(data) {
    const id = generateULID();
    const detailPath = path.join(this.skyhookDir, 'decisions', `${id}.md`);
    
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
    
    appendChangelog(this.skyhookDir, `- Recorded decision: ${data.title} (${id})`);
    
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
      appendChangelog(this.skyhookDir, `- Story ${storyId}: ${oldStatus} → ${status}`);
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
      createdAt: getTimestamp(),
      updatedAt: getTimestamp()
    };
    
    if (featureData.stories) {
      for (const story of featureData.stories) {
        const storyId = generateULID();
        storyIds.push(storyId);
        epic.childStories.push(storyId);
        backlog.stories.push({
          id: storyId,
          title: story.title,
          description: story.description || '',
          userStory: story.userStory || `As a user, I want ${story.title.toLowerCase()}, so that I can achieve my goal`,
          acceptanceCriteria: story.acceptanceCriteria || [],
          epicId,
          priority: story.priority || 50,
          status: 'backlog',
          relatedRequirements: story.relatedRequirements || [],
          tasks: [],
          definitionOfReady: [],
          definitionOfDone: [],
          createdAt: getTimestamp(),
          updatedAt: getTimestamp()
        });
      }
    }
    
    backlog.epics.push(epic);
    this.writeBacklog(backlog);
    appendChangelog(this.skyhookDir, `- Added feature: ${featureData.title} (${epicId}) with ${storyIds.length} stories`);
    
    return { epicId, storyIds };
  }

  readTechStack() {
    return readYaml(path.join(this.skyhookDir, 'tech-stack.yaml')) || { technologies: [], patterns: [], constraints: [] };
  }

  readContext() {
    return fs.readFileSync(path.join(this.skyhookDir, 'context.md'), 'utf-8');
  }
  
  readVision() {
    return fs.readFileSync(path.join(this.skyhookDir, 'vision.md'), 'utf-8');
  }

  readStandards() {
    const standards = ['software', 'ux', 'accessibility', 'architecture', 'security', 'testing'];
    const result = {};
    for (const std of standards) {
      const projectPath = path.join(this.skyhookDir, 'standards', `${std}.md`);
      const globalPath = path.join(SKYHOOK_ROOT, 'standards', `${std}.md`);
      if (fs.existsSync(projectPath)) {
        result[std] = { source: 'project', content: fs.readFileSync(projectPath, 'utf-8') };
      } else if (fs.existsSync(globalPath)) {
        result[std] = { source: 'builtin', content: fs.readFileSync(globalPath, 'utf-8') };
      }
    }
    return result;
  }
}

// ==================== COMMAND IMPLEMENTATIONS ====================

async function cmdListCurrentFeatures(ctx, args) {
  const backlog = ctx.readBacklog();
  if (!Array.isArray(backlog.epics)) {
    return { features: [], summary: { total: 0, done: 0, inProgress: 0, backlog: 0, blocked: 0 } };
  }
  const statusFilter = args.status || 'all';
  
  const features = backlog.epics.map(epic => {
    const stories = (epic.childStories || []).map(storyId => 
      backlog.stories.find(s => s.id === storyId)
    ).filter(Boolean);
    
    const filteredStories = statusFilter === 'all' 
      ? stories 
      : stories.filter(s => s.status === statusFilter);
    
    if (filteredStories.length === 0 && statusFilter !== 'all') return null;
    
    const storyStatuses = stories.map(s => s.status);
    const featureStatus = storyStatuses.every(s => s === 'done') ? 'done' :
                         storyStatuses.some(s => s === 'in-progress') ? 'in-progress' :
                         storyStatuses.some(s => s === 'blocked') ? 'blocked' : 'backlog';
    
    return {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      status: featureStatus,
      epic: epic.title,
      storyCount: stories.length,
      completedStories: stories.filter(s => s.status === 'done').length,
      stories: filteredStories.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        priority: s.priority
      })),
      blockers: stories.filter(s => s.status === 'blocked').map(s => s.title)
    };
  }).filter(Boolean);
  
  const summary = {
    total: features.length,
    done: features.filter(f => f.status === 'done').length,
    inProgress: features.filter(f => f.status === 'in-progress').length,
    backlog: features.filter(f => f.status === 'backlog').length,
    blocked: features.filter(f => f.status === 'blocked').length
  };
  
  return { features, summary };
}

async function cmdGetFeature(ctx, args) {
  if (!args.id) return { error: 'Feature ID required' };
  
  const backlog = ctx.readBacklog();
  if (!Array.isArray(backlog.epics)) return { error: 'No epics found' };
  
  const epic = backlog.epics.find(e => e.id === args.id);
  if (!epic) return { error: 'Feature not found' };
  
  const stories = (epic.childStories || []).map(storyId => 
    backlog.stories.find(s => s.id === storyId)
  ).filter(Boolean);
  
  const requirements = [
    ...ctx.readFunctionalReqs().requirements,
    ...ctx.readNonFunctionalReqs().requirements
  ].filter(r => r.featureId === args.id || stories.some(s => s.relatedRequirements?.includes(r.id)));
  
  const decisions = ctx.readDecisions().decisions.filter(d => 
    d.relatedRequirements?.some(r => requirements.map(rr => rr.id).includes(r))
  );
  
  return {
    feature: {
      id: epic.id,
      title: epic.title,
      description: epic.description,
      goal: epic.goal,
      successMetrics: epic.successMetrics,
      stories,
      requirements: requirements.map(r => ({ id: r.id, title: r.title, category: r.category })),
      decisions: decisions.map(d => ({ id: d.id, title: d.title, status: d.status }))
    }
  };
}

async function cmdGetNextTask(ctx, args) {
  const backlog = ctx.readBacklog();
  if (!Array.isArray(backlog.stories)) return { message: 'No stories found' };
  
  const readyStories = backlog.stories.filter(s => {
    if (s.status !== 'ready' && s.status !== 'backlog') return false;
    if (s.dependencies) {
      return s.dependencies.every(depId => {
        const dep = backlog.stories.find(s => s.id === depId) || backlog.tasks.find(t => t.id === depId);
        return dep && dep.status === 'done';
      });
    }
    return true;
  });
  
  if (readyStories.length === 0) {
    return { message: 'No ready tasks available' };
  }
  
  readyStories.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const story = readyStories[0];
  
  const epic = backlog.epics.find(e => e.id === story.epicId);
  const requirements = [
    ...ctx.readFunctionalReqs().requirements,
    ...ctx.readNonFunctionalReqs().requirements
  ].filter(r => story.relatedRequirements?.includes(r.id));
  
  const techStack = ctx.readTechStack();
  
  return {
    story: {
      id: story.id,
      title: story.title,
      description: story.description,
      userStory: story.userStory,
      acceptanceCriteria: story.acceptanceCriteria,
      priority: story.priority,
      definitionOfDone: story.definitionOfDone
    },
    context: {
      epic: epic?.title,
      requirements: requirements.map(r => ({ id: r.id, title: r.title, category: r.category })),
      techStack: (techStack.technologies || []).slice(0, 10),
      relatedFiles: []
    }
  };
}

async function cmdGetBlockers(ctx, args) {
  const backlog = ctx.readBacklog();
  if (!Array.isArray(backlog.stories)) return { blockers: [], count: 0 };
  
  const blocked = backlog.stories.filter(s => s.status === 'blocked');
  
  const blockers = blocked.map(story => ({
    story: { id: story.id, title: story.title, epicId: story.epicId },
    reason: story.blockerReason || 'No reason recorded',
    dependencies: story.dependencies || []
  }));
  
  return { blockers, count: blockers.length };
}

async function cmdRecordDecision(ctx, args) {
  const required = ['title', 'decision', 'context'];
  for (const field of required) {
    if (!args[field]) return { error: `Missing required field: ${field}` };
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
    return { error: 'storyId and status required' };
  }
  
  const validStatuses = ['backlog', 'ready', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'];
  if (!validStatuses.includes(args.status)) {
    return { error: `Invalid status. Valid: ${validStatuses.join(', ')}` };
  }
  
  const success = ctx.updateStoryStatus(args.storyId, args.status);
  if (!success) return { error: 'Story not found' };
  
  return { storyId: args.storyId, status: args.status, message: 'Status updated' };
}

async function cmdGetContext(ctx, args) {
  const topic = args.topic || 'general';
  const topicLower = topic.toLowerCase();
  
  const allReqs = [
    ...ctx.readFunctionalReqs().requirements,
    ...ctx.readNonFunctionalReqs().requirements
  ];
  
  const relevantReqs = allReqs.filter(r => 
    r.category?.toLowerCase().includes(topicLower) ||
    r.title?.toLowerCase().includes(topicLower) ||
    r.tags?.some(t => t.toLowerCase().includes(topicLower))
  );
  
  const decisions = ctx.readDecisions().decisions.filter(d =>
    d.category?.toLowerCase().includes(topicLower) ||
    d.title?.toLowerCase().includes(topicLower)
  );
  
  const techStack = ctx.readTechStack();
  const relevantTech = (techStack.technologies || []).filter(t =>
    t.category?.toLowerCase().includes(topicLower)
  );
  
  return {
    topic,
    context: ctx.readContext(),
    vision: ctx.readVision(),
    requirements: relevantReqs.map(r => ({ id: r.id, title: r.title, description: r.description, priority: r.priority })),
    decisions: decisions.map(d => ({ id: d.id, title: d.title, decision: d.decision, status: d.status })),
    techStack: relevantTech
  };
}

async function cmdSync(ctx, args) {
  const checks = [];
  
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const techStack = ctx.readTechStack();
    
    for (const tech of (techStack.technologies || [])) {
      if (tech.category === 'framework' || tech.category === 'library') {
        const found = Object.keys(deps).some(d => d.toLowerCase().includes(tech.name.toLowerCase()));
        checks.push({
          type: 'tech-stack',
          item: tech.name,
          expected: true,
          actual: found,
          status: found ? 'ok' : 'missing'
        });
      }
    }
  }
  
  const backlog = ctx.readBacklog();
  const allReqs = [
    ...ctx.readFunctionalReqs().requirements,
    ...ctx.readNonFunctionalReqs().requirements
  ];
  
  for (const req of allReqs) {
    if (req.status === 'confirmed' || req.status === 'in-progress') {
      const hasStory = (backlog.stories || []).some(s => s.relatedRequirements?.includes(req.id));
      checks.push({
        type: 'requirement-coverage',
        item: req.title,
        expected: true,
        actual: hasStory,
        status: hasStory ? 'ok' : 'no-story'
      });
    }
  }
  
  const decisions = (ctx.readDecisions().decisions || []).filter(d => d.status === 'accepted');
  for (const decision of decisions) {
    checks.push({
      type: 'decision-tracking',
      item: decision.title,
      status: 'tracked'
    });
  }
  
  const issues = checks.filter(c => c.status !== 'ok' && c.status !== 'tracked');
  
  return {
    checked: checks.length,
    issues: issues.length,
    details: checks,
    summary: issues.length === 0 ? 'No drift detected' : `${issues.length} drift issues found`
  };
}

async function cmdAddFeature(ctx, args) {
  if (!args.title) return { error: 'Feature title required' };
  
  const result = ctx.addFeature({
    title: args.title,
    description: args.description,
    goal: args.goal,
    successMetrics: args.successMetrics,
    targetDate: args.targetDate,
    stories: args.stories
  });
  
  return { ...result, message: 'Feature created successfully' };
}

// ==================== TRACE & IMPACT COMMANDS ====================

async function cmdTrace(ctx, args) {
  if (!args.id) return { error: 'Requirement ID required' };
  
  const projectDir = process.cwd();
  const result = traceRequirement(projectDir, args.id);
  return result;
}

async function cmdImpact(ctx, args) {
  if (!args.id) return { error: 'Requirement ID required' };
  
  const projectDir = process.cwd();
  const result = analyzeImpact(projectDir, args.id);
  return result;
}

async function cmdUntraced(ctx, args) {
  const projectDir = process.cwd();
  const result = findUntracedRequirements(projectDir);
  return result;
}

// ==================== DASHBOARD COMMANDS ====================

async function cmdDashboard(ctx, args) {
  const action = args.action || 'start';
  
  if (action === 'start') {
    return startDashboard();
  } else if (action === 'stop') {
    return stopDashboard();
  } else if (action === 'status') {
    return getDashboardStatus();
  } else {
    return { error: `Unknown action: ${action}. Use: start, stop, status` };
  }
}

// Dashboard server state (in-memory)
let dashboardServer = null;
const DASHBOARD_PORT = 4343;

// Cache for discovered projects
let projectsCache = null;
let projectsCacheTime = 0;
const PROJECTS_CACHE_TTL = 5000; // 5 seconds

/**
 * Discover all Skyhook projects by searching for .skyhook directories
 */
async function discoverProjects() {
  const now = Date.now();
  if (projectsCache && (now - projectsCacheTime) < PROJECTS_CACHE_TTL) {
    return projectsCache;
  }

  const projects = [];
  // Only search specific known locations, not entire filesystem
  const searchRoots = [
    process.cwd(),
    process.env.HOME ? path.join(process.env.HOME, 'Documents') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Projects') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Code') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Workspace') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Dev') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Repos') : null,
    '/workspace',
    '/projects',
  ].filter(Boolean);

  // Also check current directory and parent directories
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    searchRoots.unshift(dir);
    dir = path.dirname(dir);
  }

  const seen = new Set();

  async function scanDir(root, depth = 0) {
    if (depth > 3) return; // Limit recursion depth
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        
        // Skip hidden dirs, node_modules, etc.
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }

        if (entry.isDirectory()) {
          // Check if this dir has .skyhook
          const skyhookPath = path.join(fullPath, '.skyhook');
          if (fs.existsSync(skyhookPath) && fs.existsSync(path.join(skyhookPath, 'project.yaml'))) {
            const projectYaml = readYaml(path.join(skyhookPath, 'project.yaml')) || {};
            if (!seen.has(fullPath)) {
              seen.add(fullPath);
              projects.push({
                path: fullPath,
                name: projectYaml.name || path.basename(fullPath),
                type: projectYaml.type || 'unknown',
                profile: projectYaml.profile || 'unknown',
                skyhookDir: skyhookPath
              });
            }
          } else if (entry.name !== '.git') {
            // Recurse but limit depth
            try { await scanDir(fullPath, depth + 1); } catch {}
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  for (const root of searchRoots) {
    if (fs.existsSync(root)) {
      await scanDir(root);
    }
  }

  projectsCache = projects;
  projectsCacheTime = now;
  return projects;
}

/**
 * Get project data for a specific project path
 */
function getProjectData(projectPath) {
  const skyhookDir = path.join(projectPath, '.skyhook');
  if (!fs.existsSync(skyhookDir)) {
    return { error: 'No Skyhook project found at path' };
  }

  const projectYaml = readYaml(path.join(skyhookDir, 'project.yaml')) || {};
  const backlog = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [] };
  const functionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  const nonFunctionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  const decisions = readYaml(path.join(skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] };
  const techStack = readYaml(path.join(skyhookDir, 'tech-stack.yaml')) || { technologies: [] };

  // Calculate next task
  let nextTask = { message: 'No ready tasks available' };
  if (backlog.stories && Array.isArray(backlog.stories)) {
    const readyStories = backlog.stories.filter(s => {
      if (s.status !== 'ready' && s.status !== 'backlog') return false;
      if (s.dependencies) {
        return s.dependencies.every(depId => {
          const dep = backlog.stories.find(s => s.id === depId) || backlog.tasks?.find(t => t.id === depId);
          return dep && dep.status === 'done';
        });
      }
      return true;
    });
    readyStories.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (readyStories.length > 0) {
      const story = readyStories[0];
      const epic = backlog.epics.find(e => e.id === story.epicId);
      const requirements = [
        ...functionalReqs.requirements,
        ...nonFunctionalReqs.requirements
      ].filter(r => story.relatedRequirements?.includes(r.id));
      nextTask = {
        id: story.id,
        title: story.title,
        description: story.description,
        userStory: story.userStory,
        acceptanceCriteria: story.acceptanceCriteria,
        priority: story.priority,
        definitionOfDone: story.definitionOfDone,
        epic: epic?.title,
        requirements: requirements.map(r => ({ id: r.id, title: r.title, category: r.category }))
      };
    }
  }

  // Calculate blockers
  let blockers = { blockers: [], count: 0 };
  if (backlog.stories && Array.isArray(backlog.stories)) {
    const blocked = backlog.stories.filter(s => s.status === 'blocked');
    blockers = {
      blockers: blocked.map(story => ({
        story: { id: story.id, title: story.title, epicId: story.epicId },
        reason: story.blockerReason || 'No reason recorded',
        dependencies: story.dependencies || []
      })),
      count: blocked.length
    };
  }

  return {
    project: projectYaml,
    backlog,
    requirements: {
      functional: functionalReqs.requirements,
      nonFunctional: nonFunctionalReqs.requirements
    },
    decisions: decisions.decisions,
    techStack: techStack.technologies,
    nextTask,
    blockers
  };
}

function startDashboard() {
  if (dashboardServer) {
    return { message: `Dashboard already running at http://localhost:${DASHBOARD_PORT}`, port: DASHBOARD_PORT };
  }
  
  try {
    const http = require('http');
    const fs = require('fs');
    const path = require('path');
    
    // Find skyhook root for dashboard assets
    const skyhookRoot = path.resolve(__dirname, '..', '..');
    const dashboardDir = path.join(skyhookRoot, 'dashboard');
    
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`);
      
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      // API endpoints
      if (url.pathname === '/api/projects') {
        try {
          const projects = await discoverProjects();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ projects }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }
      
      if (url.pathname === '/api/data') {
        const projectPath = url.searchParams.get('project');
        if (!projectPath) {
          // Default to current working directory
          const projectDir = process.cwd();
          const skyhookDir = findSkyhookDir(projectDir);
          if (!skyhookDir) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No Skyhook project found. Use ?project=<path> parameter.' }));
            return;
          }
          const data = getProjectData(path.dirname(skyhookDir));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }
        
        const data = getProjectData(projectPath);
        if (data.error) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }
      
      // Serve static files
      let filePath = path.join(dashboardDir, 'public', url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      
      if (!fs.existsSync(filePath)) {
        filePath = path.join(dashboardDir, 'public', 'index.html');
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
      console.log(`Dashboard started at http://localhost:${DASHBOARD_PORT}`);
    });
    
    return { message: `Dashboard started at http://localhost:${DASHBOARD_PORT}`, port: DASHBOARD_PORT };
  } catch (e) {
    return { error: `Failed to start dashboard: ${e.message}` };
  }
}

function stopDashboard() {
  projectsCache = null;
  projectsCacheTime = 0;
  if (dashboardServer) {
    dashboardServer.close();
    dashboardServer = null;
    return { message: 'Dashboard stopped' };
  }
  return { message: 'Dashboard not running' };
}

function getDashboardStatus() {
  return { 
    running: !!dashboardServer, 
    port: DASHBOARD_PORT,
    url: dashboardServer ? `http://localhost:${DASHBOARD_PORT}` : null
  };
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
      { name: 'help', description: 'Show this help', args: [] }
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
    help: cmdHelp
  };
  
  const handler = commands[input.command];
  if (!handler) {
    console.error(JSON.stringify({ error: `Unknown command: ${input.command}` }));
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
