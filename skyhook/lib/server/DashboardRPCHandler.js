/**
 * Dashboard RPC Handler
 * Handles data aggregation, file inspection, and bi-directional RPC commands
 * from the dashboard UI (story transitions, lease releases, drift adoption, editor launch).
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { readYaml, writeYaml, generateULID, getTimestamp } from '../utils.js';
import { createSkyhookContext } from '../context.js';
import { TaskLeaseManager } from '../backlog/TaskLeaseManager.js';
import { BacklogLock } from '../backlog/BacklogLock.js';
import { EventLedger } from '../backlog/EventLedger.js';
import { CapacityPlanner } from '../plan/CapacityPlanner.js';
import { PlanCompiler } from '../plan/PlanCompiler.js';
import { indexCodebase } from '../tracer.js';
import { DarkMatterAnalyzer } from '../tracer/DarkMatterAnalyzer.js';
import { inferFromRepo } from '../inference/InferenceEngine.js';
import { detectDrift } from '../drift-analyzer.js';
import { DriftAggregator } from '../drift/DriftAggregator.js';
import { DriftAutoFixer } from '../drift/DriftAutoFixer.js';
import { ASTImportGraph } from '../drift/ASTImportGraph.js';
import { ModuleBoundaryGuard } from '../drift/ModuleBoundaryGuard.js';
import { C4ArchitectureGenerator } from '../drift/C4ArchitectureGenerator.js';
import { ADRSupersessionEngine } from '../adr/ADRSupersessionEngine.js';
import { ADRPolicyCompiler } from '../adr/ADRPolicyCompiler.js';
import { ADRInterceptionDaemon } from '../adr/ADRInterceptionDaemon.js';
import { inferArchitecturalDiff, generateComparativeDiagram } from '../adr/ADRComparativeDiagramGenerator.js';
import { parseADRMarkdown } from '../adr/ADRMarkdownParser.js';
import { AgentDetector } from '../harness/AgentDetector.js';
import { HarnessInjector } from '../harness/HarnessInjector.js';

export class DashboardRPCHandler {
  /**
  /**
   * Register a project directory into the global Skyhook catalog
   * @param {string} targetDir
   * @returns {Object}
   */
  static registerProject(targetDir) {
    if (!targetDir) {
      throw new Error('Project directory path is required');
    }
    const resolved = path.resolve(targetDir);
    const localSkyhook = fs.existsSync(path.join(resolved, '.skyhook'))
      ? path.join(resolved, '.skyhook')
      : (fs.existsSync(path.join(resolved, 'project.yaml')) ? resolved : path.join(resolved, '.skyhook'));

    if (!fs.existsSync(localSkyhook)) {
      throw new Error(`No .skyhook directory found in "${resolved}". Run 'skyhook init' first or choose a valid Skyhook project.`);
    }

    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skyhookHome = path.join(home, '.skyhook');
    if (!fs.existsSync(skyhookHome)) {
      try { fs.mkdirSync(skyhookHome, { recursive: true }); } catch (_) {}
    }

    const registryFile = path.join(skyhookHome, 'projects.json');
    let registry = [];
    if (fs.existsSync(registryFile)) {
      try {
        registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
        if (!Array.isArray(registry)) registry = [];
      } catch (_) {
        registry = [];
      }
    }

    const projYamlPath = path.join(localSkyhook, 'project.yaml');
    const projYaml = fs.existsSync(projYamlPath) ? (readYaml(projYamlPath) || {}) : {};
    const id = projYaml.id || path.basename(resolved);
    const name = projYaml.name || id;
    const profile = projYaml.profile || 'web-app';

    const projectEntry = {
      id,
      name,
      profile,
      projectDir: path.basename(localSkyhook) === '.skyhook' ? path.dirname(localSkyhook) : localSkyhook,
      skyhookDir: localSkyhook
    };

    const existingIdx = registry.findIndex(p => p.id === id || p.projectDir === projectEntry.projectDir);
    if (existingIdx >= 0) {
      registry[existingIdx] = { ...registry[existingIdx], ...projectEntry };
    } else {
      registry.push(projectEntry);
    }

    try {
      fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2), 'utf8');
    } catch (_) {}

    return projectEntry;
  }

  /**
   * Discover projects from workspace, ~/.skyhook/projects.json, and ~/.skyhook catalog
   * @param {string} currentWorkspaceDir
   * @returns {Array<Object>}
   */
  static getProjects(currentWorkspaceDir = process.cwd()) {
    const projects = [];
    const seenDirs = new Set();
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skyhookHome = path.join(home, '.skyhook');

    // 1. Current workspace project (primary)
    const localSkyhook = path.join(currentWorkspaceDir, '.skyhook');
    if (fs.existsSync(localSkyhook) && fs.existsSync(path.join(localSkyhook, 'project.yaml'))) {
      const projYaml = readYaml(path.join(localSkyhook, 'project.yaml')) || {};
      const id = projYaml.id || path.basename(currentWorkspaceDir);
      const curEntry = {
        id,
        name: projYaml.name || id,
        profile: projYaml.profile || 'web-app',
        skyhookDir: localSkyhook,
        projectDir: currentWorkspaceDir,
        isCurrentWorkspace: true
      };
      projects.push(curEntry);
      seenDirs.add(localSkyhook);

      // Auto-register current workspace into global registry for future switching
      try {
        DashboardRPCHandler.registerProject(currentWorkspaceDir);
      } catch (_) {}
    }

    // 2. Global ~/.skyhook/projects.json registered projects
    const registryFile = path.join(skyhookHome, 'projects.json');
    if (fs.existsSync(registryFile)) {
      try {
        const registered = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
        if (Array.isArray(registered)) {
          for (const reg of registered) {
            if (!reg || !reg.skyhookDir || seenDirs.has(reg.skyhookDir)) continue;
            if (fs.existsSync(reg.skyhookDir)) {
              projects.push({
                id: reg.id || path.basename(reg.projectDir || reg.skyhookDir),
                name: reg.name || reg.id,
                profile: reg.profile || 'web-app',
                skyhookDir: reg.skyhookDir,
                projectDir: reg.projectDir || path.dirname(reg.skyhookDir),
                isCurrentWorkspace: false
              });
              seenDirs.add(reg.skyhookDir);
            }
          }
        }
      } catch (_) {}
    }

    // 3. Global ~/.skyhook catalog subdirectories
    if (fs.existsSync(skyhookHome)) {
      try {
        const entries = fs.readdirSync(skyhookHome);
        for (const entry of entries) {
          const entryDir = path.join(skyhookHome, entry);
          if (seenDirs.has(entryDir)) continue;
          if (!fs.statSync(entryDir).isDirectory()) continue;

          const projYamlPath = path.join(entryDir, 'project.yaml');
          if (fs.existsSync(projYamlPath)) {
            const projYaml = readYaml(projYamlPath) || {};
            projects.push({
              id: entry,
              name: projYaml.name || entry,
              profile: projYaml.profile || 'web-app',
              skyhookDir: entryDir,
              projectDir: path.dirname(entryDir),
              isCurrentWorkspace: false
            });
            seenDirs.add(entryDir);
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return projects;
  }

  /**
   * Get complete aggregated state for a project
   * @param {string} skyhookDir
   * @param {string} projectDir
   * @returns {Promise<Object>}
   */
  static async getProjectData(skyhookDir, projectDir) {
    if (!skyhookDir || !fs.existsSync(skyhookDir)) {
      throw new Error(`Skyhook directory not found: ${skyhookDir}`);
    }

    const projDir = projectDir || path.dirname(skyhookDir);

    // Read YAML domains
    const project = readYaml(path.join(skyhookDir, 'project.yaml')) || {};
    const backlog = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [], tasks: [] };
    const decisions = readYaml(path.join(skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] };
    const requirements = {
      functional: readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] },
      nonFunctional: readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] },
      constraints: readYaml(path.join(skyhookDir, 'requirements', 'constraints.yaml')) || { constraints: [] }
    };
    const techStack = readYaml(path.join(skyhookDir, 'tech-stack.yaml')) || { technologies: [] };
    const standards = readYaml(path.join(skyhookDir, 'standards', 'index.yaml')) || { overrides: [], adoptions: [] };

    // Read Recent Events
    const events = EventLedger.readEvents(skyhookDir, 50);

    // Capacity & Delivery Forecast
    const capacity = CapacityPlanner.plan(skyhookDir, backlog, { windowDays: 14 });

    // Read Master Plan content if available
    let planMarkdown = '';
    const masterPlanPath = path.join(skyhookDir, 'plan', 'PROJECT_PLAN.md');
    if (fs.existsSync(masterPlanPath)) {
      planMarkdown = fs.readFileSync(masterPlanPath, 'utf-8');
    }

    // AST Code Symbols
    let symbols = [];
    try {
      symbols = await indexCodebase(projDir);
    } catch {
      symbols = [];
    }

    // Architecture Drift Analysis
    let drift = { detected: false, violations: [] };
    try {
      const facts = await inferFromRepo(projDir);
      drift = detectDrift(facts, techStack, null);
    } catch {
      // Non-fatal
    }

    return {
      project,
      backlog,
      decisions,
      requirements,
      techStack,
      standards,
      events,
      capacity,
      planMarkdown,
      symbols,
      drift,
      skyhookDir,
      projectDir: projDir
    };
  }

  /**
   * Safely read file content with traversal protection
   * @param {string} targetPath
   * @param {string} allowedRoot
   * @returns {Object}
   */
  static getFileContent(targetPath, allowedRoot = process.cwd()) {
    const resolvedPath = path.resolve(targetPath);

    // Check directory traversal: must be in allowed root or home ~/.skyhook
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skyhookHome = path.join(home, '.skyhook');
    const isAllowed = resolvedPath.startsWith(path.resolve(allowedRoot)) || (home && resolvedPath.startsWith(path.resolve(skyhookHome)));

    if (!isAllowed) {
      throw new Error(`Access forbidden: File path outside allowed workspace.`);
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${targetPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(resolvedPath);
      return { isDirectory: true, files, path: resolvedPath };
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const lines = content.split('\n');

    return {
      isDirectory: false,
      content,
      totalLines: lines.length,
      extension: path.extname(resolvedPath),
      path: resolvedPath
    };
  }

  /**
   * Update story status via BacklogStateMachine
   */
  static updateStoryStatus(skyhookDir, storyId, status, metadata = {}) {
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const success = ctx.updateStoryStatus(storyId, status, metadata);
    if (!success) throw new Error(`Story ${storyId} not found`);

    return { success: true, storyId, status };
  }

  /**
   * Release active agent lease
   */
  static releaseLease(skyhookDir, storyId, force = true) {
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const backlog = ctx.readBacklog();
    const story = (backlog.stories || []).find(s => s.id === storyId);
    if (!story) throw new Error(`Story ${storyId} not found`);

    TaskLeaseManager.releaseLease(story, story.leasedTo || 'unknown', force);
    ctx.writeBacklog(backlog);

    return { success: true, storyId };
  }

  /**
   * Adopt architectural drift into tech-stack.yaml
   */
  static adoptDrift(skyhookDir, technologies = []) {
    const techStackPath = path.join(skyhookDir, 'tech-stack.yaml');
    const techStack = readYaml(techStackPath) || { schemaVersion: '1.0.0', technologies: [] };
    if (!techStack.technologies) techStack.technologies = [];

    const existingNames = new Set(techStack.technologies.map(t => t.name.toLowerCase()));

    for (const tech of technologies) {
      if (!existingNames.has(tech.name.toLowerCase())) {
        techStack.technologies.push(tech);
        existingNames.add(tech.name.toLowerCase());
      }
    }

    writeYaml(techStackPath, techStack);
    return { success: true, technologiesCount: techStack.technologies.length };
  }

  /**
   * Recompile master project plan
   */
  static async recompilePlan(skyhookDir) {
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');
    const result = await PlanCompiler.compileMasterPlan(ctx);
    return { success: true, ...result };
  }

  /**
   * Handle deep-linking to code editor
   */
  static openInEditor(filePath, line = 1, preference = 'vscode') {
    const absPath = path.resolve(filePath);

    // Deep link URLs
    const urls = {
      vscode: `vscode://file/${absPath}:${line}`,
      cursor: `cursor://file/${absPath}:${line}`,
      sublime: `subl://${absPath}:${line}`
    };

    const targetUrl = urls[preference] || urls.vscode;

    // Also attempt CLI launch as server fallback
    try {
      const cmd = preference === 'cursor' ? `cursor -g "${absPath}:${line}"` : `code -g "${absPath}:${line}"`;
      exec(cmd, () => {
        // Fire and forget CLI invocation
      });
    } catch {
      // Non-fatal
    }

    return {
      success: true,
      url: targetUrl,
      path: absPath,
      line
    };
  }

  /**
   * Get complete architectural compliance scorecard
   */
  static async getDriftScorecard(projectDir = process.cwd()) {
    const ctx = createSkyhookContext(projectDir) || {
      projectDir,
      skyhookDir: path.join(projectDir, '.skyhook')
    };
    const aggregator = new DriftAggregator(ctx);
    return aggregator.analyze();
  }

  /**
   * Get dependency matrix and graph nodes/edges
   */
  static async getDriftGraph(projectDir = process.cwd()) {
    const graph = new ASTImportGraph(projectDir);
    await graph.build();
    const circularCycles = graph.findCircularDependencies();
    return {
      success: true,
      nodes: Array.from(graph.nodes.values()),
      edges: graph.edges,
      externalPackages: Array.from(graph.externalPackages.entries()).map(([pkg, files]) => ({
        package: pkg,
        usedIn: Array.from(files)
      })),
      circularCycles
    };
  }

  /**
   * Get DDD boundary rules and violations
   */
  static async getDriftBoundaries(projectDir = process.cwd()) {
    const ctx = createSkyhookContext(projectDir) || {
      projectDir,
      skyhookDir: path.join(projectDir, '.skyhook')
    };
    const graph = new ASTImportGraph(projectDir);
    await graph.build();
    const guard = new ModuleBoundaryGuard(projectDir);
    const result = guard.validate(graph, ctx);
    return {
      success: true,
      ...result
    };
  }

  /**
   * Get living C4 architecture model and target diff
   */
  static async getDriftC4(projectDir = process.cwd()) {
    const graph = new ASTImportGraph(projectDir);
    await graph.build();
    const c4Gen = new C4ArchitectureGenerator(projectDir, graph);
    const inferred = await c4Gen.inferArchitecture();
    const mermaidContainer = c4Gen.toMermaidContainerDiagram(inferred);
    const mermaidComponent = c4Gen.toMermaidComponentDiagram(inferred);
    const diff = c4Gen.diffWithTarget(inferred);
    return {
      success: true,
      inferred,
      mermaidContainer,
      mermaidComponent,
      diff
    };
  }

  /**
   * Get dark matter and codebase coverage metrics
   */
  static async getDarkMatterData(projectDir = process.cwd()) {
    const symbols = await indexCodebase(projectDir);
    const analysis = DarkMatterAnalyzer.analyze(symbols);
    return {
      success: true,
      projectDir,
      ...analysis
    };
  }

  /**
   * 1-Click Draft ADR from detected architectural drift
   */
  static draftADRFromDrift(projectDir = process.cwd(), driftItem = {}) {
    const ctx = createSkyhookContext(projectDir) || {
      projectDir,
      skyhookDir: path.join(projectDir, '.skyhook')
    };
    return DriftAutoFixer.draftADRFromDrift(ctx, driftItem);
  }

  /**
   * Get Decision Lifecycle & Lineage DAG
   */
  static getADRDAG(projectDir = process.cwd()) {
    const skyhookDir = path.join(projectDir, '.skyhook');
    const engine = new ADRSupersessionEngine(skyhookDir, projectDir);
    const indexData = engine.readIndex();
    const mermaid = engine.generateMermaidDAG(indexData.decisions);
    return {
      success: true,
      decisions: indexData.decisions || [],
      mermaid
    };
  }

  /**
   * Get Before vs After comparative visual diff for a decision
   */
  static getADRDiff(projectDir = process.cwd(), decisionId) {
    const skyhookDir = path.join(projectDir, '.skyhook');
    const engine = new ADRSupersessionEngine(skyhookDir, projectDir);
    const indexData = engine.readIndex();
    const decision = (indexData.decisions || []).find(d => d.id === decisionId) || { id: decisionId, title: decisionId };

    // Try reading record markdown
    const recordPath = engine.resolveRecordFilePath(decisionId, decision);
    if (recordPath && fs.existsSync(recordPath)) {
      try {
        const parsed = parseADRMarkdown(fs.readFileSync(recordPath, 'utf-8'));
        Object.assign(decision, parsed);
      } catch {
        // use basic decision
      }
    }

    const diff = inferArchitecturalDiff(decision);
    const mermaid = generateComparativeDiagram(decision);

    return {
      success: true,
      decisionId,
      title: decision.title || decisionId,
      diff,
      mermaid
    };
  }

  /**
   * Transition decision lifecycle status
   */
  static transitionADR(projectDir = process.cwd(), { decisionId, targetStatus, reason, force }) {
    const skyhookDir = path.join(projectDir, '.skyhook');
    const engine = new ADRSupersessionEngine(skyhookDir, projectDir);
    return engine.transitionStatus(decisionId, targetStatus, { reason, force });
  }

  /**
   * Supersede an old decision with a new decision
   */
  static supersedeADR(projectDir = process.cwd(), { oldId, newId, reason }) {
    const skyhookDir = path.join(projectDir, '.skyhook');
    const engine = new ADRSupersessionEngine(skyhookDir, projectDir);
    return engine.supersede(oldId, newId, { reason });
  }

  /**
   * Compile active ADR policies into machine boundaries & ESLint rules
   */
  static compileADRPolicies(projectDir = process.cwd(), options = {}) {
    const skyhookDir = path.join(projectDir, '.skyhook');
    const compiler = new ADRPolicyCompiler(skyhookDir, projectDir);
    return compiler.compile(options);
  }

  /**
   * Run proactive interception sweep
   */
  static interceptADR(projectDir = process.cwd()) {
    const skyhookDir = path.join(projectDir, '.skyhook');
    const daemon = new ADRInterceptionDaemon(skyhookDir, projectDir);
    const drafts = daemon.scan();
    return {
      success: true,
      count: drafts.length,
      drafts
    };
  }

  /**
   * Scan workspace for installed AI agents
   */
  static async detectHarnesses(workspaceDir = process.cwd(), options = {}) {
    const detector = new AgentDetector();
    return detector.scan(workspaceDir, options);
  }

  /**
   * Get injection status for all agent harnesses
   */
  static async getHarnessStatus(workspaceDir = process.cwd()) {
    const injector = new HarnessInjector();
    return injector.status(workspaceDir);
  }

  /**
   * Inject Skyhook configurations into agent harnesses
   */
  static async injectHarness(workspaceDir = process.cwd(), options = {}) {
    const injector = new HarnessInjector();
    return injector.inject(workspaceDir, options);
  }

  /**
   * Remove Skyhook configurations from agent harnesses
   */
  static async removeHarness(workspaceDir = process.cwd(), options = {}) {
    const injector = new HarnessInjector();
    return injector.remove(workspaceDir, options);
  }

  // =========================================================================
  // --- Backlog & Story CRUD Operations ---
  // =========================================================================

  /**
   * Create a new story in backlog/epics.yaml
   */
  static async createStory(skyhookDir, storyData = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');
    
    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.stories)) backlog.stories = [];
      if (!Array.isArray(backlog.epics)) backlog.epics = [];

      let maxNum = 0;
      for (const s of backlog.stories) {
        const match = String(s.id).match(/^STORY-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const nextId = `STORY-${String(maxNum + 1).padStart(3, '0')}`;
      const now = getTimestamp();

      const newStory = {
        id: storyData.id || nextId,
        title: storyData.title || 'Untitled Story',
        description: storyData.description || '',
        epicId: storyData.epicId || (backlog.epics[0]?.id || 'EPIC-001'),
        status: storyData.status || 'backlog',
        storyPoints: storyData.storyPoints !== undefined ? Number(storyData.storyPoints) : 1,
        priority: storyData.priority || 'medium',
        relatedRequirements: Array.isArray(storyData.relatedRequirements) ? storyData.relatedRequirements : [],
        createdAt: now,
        updatedAt: now
      };

      backlog.stories.push(newStory);
      writeYaml(epicsPath, backlog);

      EventLedger.appendEvent(skyhookDir, {
        type: 'STORY_CREATED',
        actor: 'user-dashboard',
        payload: { storyId: newStory.id, title: newStory.title }
      });

      return { success: true, story: newStory };
    });
  }

  /**
   * Update an existing story in backlog/epics.yaml
   */
  static async updateStory(skyhookDir, storyId, updates = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    if (!storyId) throw new Error('storyId is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.stories)) backlog.stories = [];
      
      const story = backlog.stories.find(s => s.id === storyId);
      if (!story) throw new Error(`Story '${storyId}' not found`);

      if (updates.title !== undefined) story.title = updates.title;
      if (updates.description !== undefined) story.description = updates.description;
      if (updates.epicId !== undefined) story.epicId = updates.epicId;
      if (updates.status !== undefined) story.status = updates.status;
      if (updates.storyPoints !== undefined) story.storyPoints = Number(updates.storyPoints);
      if (updates.priority !== undefined) story.priority = updates.priority;
      if (updates.relatedRequirements !== undefined) story.relatedRequirements = updates.relatedRequirements;
      story.updatedAt = getTimestamp();

      writeYaml(epicsPath, backlog);

      EventLedger.appendEvent(skyhookDir, {
        type: 'STORY_UPDATED',
        actor: 'user-dashboard',
        payload: { storyId, updates }
      });

      return { success: true, story };
    });
  }

  /**
   * Delete a story from backlog/epics.yaml
   */
  static async deleteStory(skyhookDir, storyId) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    if (!storyId) throw new Error('storyId is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.stories)) backlog.stories = [];

      const initialCount = backlog.stories.length;
      backlog.stories = backlog.stories.filter(s => s.id !== storyId);
      if (backlog.stories.length === initialCount) {
        throw new Error(`Story '${storyId}' not found`);
      }

      writeYaml(epicsPath, backlog);

      EventLedger.appendEvent(skyhookDir, {
        type: 'STORY_DELETED',
        actor: 'user-dashboard',
        payload: { storyId }
      });

      return { success: true, storyId };
    });
  }

  // =========================================================================
  // --- Epic CRUD Operations ---
  // =========================================================================

  /**
   * Create an epic in backlog/epics.yaml
   */
  static async createEpic(skyhookDir, epicData = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.epics)) backlog.epics = [];

      let maxNum = 0;
      for (const e of backlog.epics) {
        const match = String(e.id).match(/^EPIC-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const nextId = `EPIC-${String(maxNum + 1).padStart(3, '0')}`;
      const now = getTimestamp();

      const newEpic = {
        id: epicData.id || nextId,
        title: epicData.title || 'Untitled Epic',
        description: epicData.description || '',
        status: epicData.status || 'planned',
        priority: epicData.priority || 'medium',
        goal: epicData.goal || '',
        createdAt: now,
        updatedAt: now
      };

      backlog.epics.push(newEpic);
      writeYaml(epicsPath, backlog);

      return { success: true, epic: newEpic };
    });
  }

  /**
   * Update an epic in backlog/epics.yaml
   */
  static async updateEpic(skyhookDir, epicId, updates = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.epics)) backlog.epics = [];

      const epic = backlog.epics.find(e => e.id === epicId);
      if (!epic) throw new Error(`Epic '${epicId}' not found`);

      if (updates.title !== undefined) epic.title = updates.title;
      if (updates.description !== undefined) epic.description = updates.description;
      if (updates.status !== undefined) epic.status = updates.status;
      if (updates.priority !== undefined) epic.priority = updates.priority;
      if (updates.goal !== undefined) epic.goal = updates.goal;
      epic.updatedAt = getTimestamp();

      writeYaml(epicsPath, backlog);
      return { success: true, epic };
    });
  }

  /**
   * Delete an epic from backlog/epics.yaml
   */
  static async deleteEpic(skyhookDir, epicId) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.epics)) backlog.epics = [];

      const initialCount = backlog.epics.length;
      backlog.epics = backlog.epics.filter(e => e.id !== epicId);
      if (backlog.epics.length === initialCount) {
        throw new Error(`Epic '${epicId}' not found`);
      }

      writeYaml(epicsPath, backlog);
      return { success: true, epicId };
    });
  }

  // =========================================================================
  // --- Architectural Decision Records (ADR) CRUD Operations ---
  // =========================================================================

  /**
   * Create a new ADR record file and register it in decisions/index.yaml
   */
  static createADR(skyhookDir, adrData = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const engine = new ADRSupersessionEngine(skyhookDir);
    const indexData = engine.readIndex();
    if (!Array.isArray(indexData.decisions)) indexData.decisions = [];

    let maxNum = 0;
    for (const d of indexData.decisions) {
      const match = String(d.id).match(/^ADR-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextNum = maxNum + 1;
    const adrId = `ADR-${String(nextNum).padStart(3, '0')}`;
    const slug = (adrData.title || 'decision').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'decision';
    const filename = `${adrId}-${slug}.md`;
    const recordsDir = path.join(skyhookDir, 'decisions', 'records');
    if (!fs.existsSync(recordsDir)) fs.mkdirSync(recordsDir, { recursive: true });

    const recordPath = path.join(recordsDir, filename);
    const now = getTimestamp().split('T')[0];

    const posConsequences = Array.isArray(adrData.consequences?.positive) ? adrData.consequences.positive : ['Documented and agreed upon by team.'];
    const negConsequences = Array.isArray(adrData.consequences?.negative) ? adrData.consequences.negative : ['Requires adoption and adherence.'];
    const alternatives = Array.isArray(adrData.alternatives) ? adrData.alternatives : [];
    const relatedReqs = Array.isArray(adrData.relatedRequirements) ? adrData.relatedRequirements : [];

    const markdownContent = `# ${adrId}: ${adrData.title || 'Untitled Decision'}

**Status**: ${adrData.status || 'accepted'}  
**Date**: ${now}  
**Author**: ${adrData.author || 'User Dashboard'}  
**Category**: ${adrData.category || 'Architecture'}  

## Context
${adrData.context || 'Context and problem statement.'}

## Decision
${adrData.decision || 'The change that we are committing to.'}

## Consequences
### Positive
${posConsequences.map(p => `- ${p}`).join('\n')}

### Negative / Trade-offs
${negConsequences.map(n => `- ${n}`).join('\n')}

## Alternatives Considered
${alternatives.length > 0 ? alternatives.map(a => `### ${a.name || 'Alternative'}\n- Pros: ${(a.pros || []).join(', ')}\n- Cons: ${(a.cons || []).join(', ')}`).join('\n\n') : 'None recorded.'}

## Related Requirements
${relatedReqs.length > 0 ? relatedReqs.map(r => `- ${r}`).join('\n') : 'None recorded.'}
`;

    fs.writeFileSync(recordPath, markdownContent, 'utf-8');

    const newEntry = {
      id: adrId,
      title: adrData.title || 'Untitled Decision',
      status: adrData.status || 'accepted',
      date: now,
      file: `decisions/records/${filename}`,
      relatedRequirements: relatedReqs,
      category: adrData.category || 'Architecture'
    };

    indexData.decisions.push(newEntry);
    engine.writeIndex(indexData);

    return { success: true, adr: newEntry, filePath: recordPath };
  }

  /**
   * Update an existing ADR record file and metadata
   */
  static updateADR(skyhookDir, adrId, updates = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const engine = new ADRSupersessionEngine(skyhookDir);
    const indexData = engine.readIndex();
    const entry = indexData.decisions.find(d => d.id === adrId);
    if (!entry) throw new Error(`Decision '${adrId}' not found`);

    if (updates.title) entry.title = updates.title;
    if (updates.status) entry.status = updates.status;
    if (updates.category) entry.category = updates.category;
    if (updates.relatedRequirements) entry.relatedRequirements = updates.relatedRequirements;
    entry.updatedAt = getTimestamp();

    engine.writeIndex(indexData);

    const recPath = engine.resolveRecordFilePath(adrId, entry);
    if (recPath && fs.existsSync(recPath) && updates.status) {
      let content = fs.readFileSync(recPath, 'utf-8');
      content = content.replace(/\*\*Status\*\*:\s*[^\n\r]+/i, `**Status**: ${updates.status}`);
      fs.writeFileSync(recPath, content, 'utf-8');
    }

    return { success: true, adr: entry };
  }

  /**
   * Delete an ADR record and remove from decisions/index.yaml
   */
  static deleteADR(skyhookDir, adrId) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const engine = new ADRSupersessionEngine(skyhookDir);
    const indexData = engine.readIndex();
    const entry = indexData.decisions.find(d => d.id === adrId);
    if (!entry) throw new Error(`Decision '${adrId}' not found`);

    const recPath = engine.resolveRecordFilePath(adrId, entry);
    if (recPath && fs.existsSync(recPath)) {
      try { fs.unlinkSync(recPath); } catch (_) {}
    }

    indexData.decisions = indexData.decisions.filter(d => d.id !== adrId);
    engine.writeIndex(indexData);

    return { success: true, adrId };
  }

  // =========================================================================
  // --- Requirements CRUD Operations ---
  // =========================================================================

  /**
   * Create requirement in functional, non-functional, or constraints YAML
   */
  static createRequirement(skyhookDir, type = 'functional', reqData = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const fileMap = {
      functional: 'functional.yaml',
      nonFunctional: 'non-functional.yaml',
      constraints: 'constraints.yaml'
    };
    const filename = fileMap[type] || 'functional.yaml';
    const reqPath = path.join(skyhookDir, 'requirements', filename);
    const data = readYaml(reqPath) || { requirements: [] };
    const listKey = type === 'constraints' ? 'constraints' : 'requirements';
    if (!Array.isArray(data[listKey])) data[listKey] = [];

    const prefix = type === 'constraints' ? 'CON' : (type === 'nonFunctional' ? 'NFR' : 'REQ');
    let maxNum = 0;
    for (const r of data[listKey]) {
      const match = String(r.id).match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextId = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
    const now = getTimestamp();

    const newReq = {
      id: reqData.id || nextId,
      statement: reqData.statement || reqData.title || 'Untitled Requirement',
      rationale: reqData.rationale || '',
      priority: reqData.priority || 'medium',
      createdAt: now,
      updatedAt: now
    };

    data[listKey].push(newReq);
    writeYaml(reqPath, data);

    return { success: true, requirement: newReq, type };
  }

  /**
   * Update a requirement in functional, non-functional, or constraints YAML
   */
  static updateRequirement(skyhookDir, type = 'functional', reqId, updates = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const fileMap = {
      functional: 'functional.yaml',
      nonFunctional: 'non-functional.yaml',
      constraints: 'constraints.yaml'
    };
    const filename = fileMap[type] || 'functional.yaml';
    const reqPath = path.join(skyhookDir, 'requirements', filename);
    const data = readYaml(reqPath) || { requirements: [] };
    const listKey = type === 'constraints' ? 'constraints' : 'requirements';
    if (!Array.isArray(data[listKey])) data[listKey] = [];

    const item = data[listKey].find(r => r.id === reqId);
    if (!item) throw new Error(`Requirement '${reqId}' not found`);

    if (updates.statement !== undefined) item.statement = updates.statement;
    if (updates.rationale !== undefined) item.rationale = updates.rationale;
    if (updates.priority !== undefined) item.priority = updates.priority;
    item.updatedAt = getTimestamp();

    writeYaml(reqPath, data);
    return { success: true, requirement: item, type };
  }

  /**
   * Delete a requirement from functional, non-functional, or constraints YAML
   */
  static deleteRequirement(skyhookDir, type = 'functional', reqId) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const fileMap = {
      functional: 'functional.yaml',
      nonFunctional: 'non-functional.yaml',
      constraints: 'constraints.yaml'
    };
    const filename = fileMap[type] || 'functional.yaml';
    const reqPath = path.join(skyhookDir, 'requirements', filename);
    const data = readYaml(reqPath) || { requirements: [] };
    const listKey = type === 'constraints' ? 'constraints' : 'requirements';
    if (!Array.isArray(data[listKey])) data[listKey] = [];

    data[listKey] = data[listKey].filter(r => r.id !== reqId);
    writeYaml(reqPath, data);
    return { success: true, reqId, type };
  }

  // =========================================================================
  // --- Universal Actions & Codebase Re-indexing ---
  // =========================================================================

  /**
   * Force re-index of all codebase AST symbols
   */
  static async reindexSymbols(projectDir = process.cwd()) {
    const symbols = await indexCodebase(projectDir);
    return { success: true, count: symbols.length, symbolsCount: symbols.length };
  }
}
