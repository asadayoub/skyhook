/**
 * Dashboard RPC Handler
 * Handles data aggregation, file inspection, and bi-directional RPC commands
 * from the dashboard UI (story transitions, lease releases, drift adoption, editor launch).
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { readYaml, writeYaml } from '../utils.js';
import { createSkyhookContext } from '../context.js';
import { TaskLeaseManager } from '../backlog/TaskLeaseManager.js';
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
}
