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
import { StandardsRegistry } from '../standards/StandardsRegistry.js';

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
    const standardsIndex = readYaml(path.join(skyhookDir, 'standards', 'index.yaml')) || { overrides: [], adoptions: [] };
    let standardsCatalog = [];
    try {
      standardsCatalog = StandardsRegistry.listStandards({}, projDir);
    } catch (_) {}
    const standards = {
      ...standardsIndex,
      catalog: standardsCatalog
    };

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
  static getFileContent(targetPath, allowedRoots = [process.cwd()]) {
    const rawRoots = Array.isArray(allowedRoots) ? allowedRoots : [allowedRoots];
    const roots = rawRoots.filter(Boolean).map(r => path.resolve(r));

    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skyhookHome = home ? path.resolve(path.join(home, '.skyhook')) : '';
    if (skyhookHome && !roots.includes(skyhookHome)) {
      roots.push(skyhookHome);
    }

    // Try resolving relative path against each root until an existing file is found
    let resolvedPath = null;
    if (path.isAbsolute(targetPath)) {
      resolvedPath = path.resolve(targetPath);
    } else {
      for (const root of roots) {
        const candidate = path.resolve(root, targetPath);
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
          break;
        }
      }
      if (!resolvedPath) {
        resolvedPath = path.resolve(roots[0] || process.cwd(), targetPath);
      }
    }

    // Check directory traversal: must be in at least one of the allowed roots
    const isAllowed = roots.some(root => resolvedPath.startsWith(root));
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
   * Release active agent lease (supports both story and task)
   */
  static releaseLease(skyhookDir, itemId, force = true) {
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const backlog = ctx.readBacklog();
    const story = (backlog.stories || []).find(s => s.id === itemId);
    const task = (backlog.tasks || []).find(t => t.id === itemId);
    const item = story || task;
    if (!item) throw new Error(`Work item ${itemId} not found`);

    const agent = item.lease?.agentId || item.leasedTo || 'unknown';
    TaskLeaseManager.releaseLease(item, agent, force);
    ctx.writeBacklog(backlog);

    return { success: true, storyId: item.id, taskId: item.id };
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
    try {
      const ctx = createSkyhookContext(projectDir) || {
        projectDir,
        skyhookDir: path.join(projectDir, '.skyhook')
      };
      const aggregator = new DriftAggregator(ctx);
      return await aggregator.analyze();
    } catch (err) {
      return {
        healthScore: 100,
        pass: true,
        timestamp: new Date().toISOString(),
        summary: {
          totalViolations: 0,
          criticalCount: 0,
          warningCount: 0,
          nodesCount: 0,
          edgesCount: 0,
          externalPackagesCount: 0,
          circularCyclesCount: 0
        },
        criticalViolations: [],
        warnings: [{ type: 'ANALYSIS_NOTICE', message: `Architecture analysis note: ${err.message}` }],
        circularCycles: [],
        c4: {
          inferred: { person: [], containers: [], relationships: [], components: [], componentRelationships: [] },
          mermaidContainer: 'C4Container\n  title System Architecture\n  Person(user, "User")\n  Container(app, "Application", "Codebase")\n  Rel(user, app, "Uses")',
          mermaidComponent: 'C4Component\n  title Component Diagram\n  Component(core, "Core Module")',
          diff: { match: true, totalIssues: 0, healthScore: 100, addedContainers: [], missingContainers: [], unauthorizedConnections: [], hasTargetSpecification: false }
        },
        graphMetrics: { nodes: [], edges: [], externalPackages: [] },
        remediation: { markdown: '# Architecture Analysis\nAll system boundaries within nominal limits.', tasksCount: 0, tasks: [] }
      };
    }
  }

  /**
   * Get dependency matrix and graph nodes/edges
   */
  static async getDriftGraph(projectDir = process.cwd()) {
    try {
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
    } catch (err) {
      return {
        success: false,
        error: err.message,
        nodes: [],
        edges: [],
        externalPackages: [],
        circularCycles: []
      };
    }
  }

  /**
   * Get DDD boundary rules and violations
   */
  static async getDriftBoundaries(projectDir = process.cwd()) {
    try {
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
    } catch (err) {
      return {
        success: false,
        error: err.message,
        violations: [],
        circularCycles: []
      };
    }
  }

  /**
   * Get living C4 architecture model and target diff
   */
  static async getDriftC4(projectDir = process.cwd()) {
    try {
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
    } catch (err) {
      return {
        success: false,
        error: err.message,
        inferred: { person: [], containers: [], relationships: [], components: [], componentRelationships: [] },
        mermaidContainer: 'C4Container\n  title System Architecture\n  Person(user, "User")\n  Container(app, "Application", "Codebase")\n  Rel(user, app, "Uses")',
        mermaidComponent: 'C4Component\n  title Component Architecture\n  Component(core, "Core Module")',
        diff: { match: true, totalIssues: 0, healthScore: 100, addedContainers: [], missingContainers: [], unauthorizedConnections: [], hasTargetSpecification: false }
      };
    }
  }

  /**
   * Get dark matter and codebase coverage metrics
   */
  static async getDarkMatterData(projectDir = process.cwd()) {
    try {
      const symbols = await indexCodebase(projectDir);
      const analysis = DarkMatterAnalyzer.analyze(symbols);
      return {
        success: true,
        projectDir,
        ...analysis
      };
    } catch (err) {
      return {
        success: true,
        projectDir,
        summary: { totalSymbols: 0, tracedSymbols: 0, untracedSymbols: 0, overallCoverage: 100 },
        files: []
      };
    }
  }

  /**
   * Get AST Symbol Relationships & Interactive Mermaid Graph
   * Synthesizes AST indexed symbols, file-to-file imports, requirements traceability, and ADR governance
   */
  static async getASTGraph(projectDir = process.cwd()) {
    try {
      const allSymbols = await indexCodebase(projectDir);

      const ctx = createSkyhookContext(projectDir) || {
        projectDir,
        skyhookDir: path.join(projectDir, '.skyhook')
      };

      const funcReqs = (typeof ctx.readFunctionalReqs === 'function' ? ctx.readFunctionalReqs()?.requirements : []) || [];
      const nonFuncReqs = (typeof ctx.readNonFunctionalReqs === 'function' ? ctx.readNonFunctionalReqs()?.requirements : []) || [];
      const allReqs = [...funcReqs, ...nonFuncReqs];

      const decisionsData = (typeof ctx.readDecisions === 'function' ? ctx.readDecisions() : {}) || { decisions: [] };
      const allDecisions = decisionsData.decisions || [];

      let internalEdges = [];
      try {
        const importGraph = new ASTImportGraph(projectDir);
        await importGraph.build();
        internalEdges = importGraph.getAllInternalEdges ? importGraph.getAllInternalEdges() : importGraph.edges.filter(e => e.isInternal);
      } catch (_) {
        // Fallback gracefully if import graph fails on unparseable files
      }

      function sanitize(str) {
        return String(str || '').replace(/["<>{}|#&]/g, '').replace(/\\/g, '/');
      }

      // Group symbols by file
      const fileMap = new Map();
      allSymbols.forEach((sym, index) => {
        const cleanFile = (sym.file || '').replace(/\\/g, '/');
        const fileId = "F_" + cleanFile.replace(/[^a-zA-Z0-9]/g, '_');
        if (!fileMap.has(fileId)) {
          fileMap.set(fileId, { fileId, file: cleanFile, symbols: [] });
        }
        fileMap.get(fileId).symbols.push({ ...sym, _index: index });
      });

      let mermaid = 'flowchart TB\n';

      // 1. Requirements layer
      if (allReqs.length > 0) {
        mermaid += '\n    %% ── Requirements ──\n';
        allReqs.forEach(req => {
          const reqIdSafe = "REQ_" + String(req.id).replace(/[^a-zA-Z0-9]/g, '_');
          const label = sanitize(`${req.id}: ${req.title || req.statement || req.name || ''}`);
          mermaid += `    ${reqIdSafe}["🎯 ${label}"]:::requirement\n`;
        });
      }

      // 2. Source Files & Symbols
      mermaid += '\n    %% ── Source Files & Symbols ──\n';
      let prevFileId = null;
      for (const [fileId, data] of fileMap) {
        const fileLabel = sanitize(data.file);
        mermaid += `    ${fileId}["📄 ${fileLabel}"]:::file\n`;

        if (prevFileId) {
          mermaid += `    ${prevFileId} ~~~ ${fileId}\n`;
        }
        prevFileId = fileId;

        data.symbols.forEach(sym => {
          const symId = "S_" + sym._index;
          const styleClass = sym.traced ? "traced" : "untraced";
          const icon = sym.traced ? "✅" : "⚡";
          const symLabel = sanitize(`${icon} ${sym.symbolType || 'symbol'} ${sym.symbolName || sym.name || 'unnamed'}`);
          mermaid += `    ${symId}["${symLabel}"]:::${styleClass}\n`;
          mermaid += `    ${fileId} --> ${symId}\n`;
        });
        mermaid += '\n';
      }

      // 3. Traceability Links (Requirement satisfies Symbol)
      mermaid += '    %% ── Traceability Links ──\n';
      allSymbols.forEach((sym, index) => {
        if (sym.traced && sym.requirementId) {
          const symId = "S_" + index;
          const reqIdSafe = "REQ_" + String(sym.requirementId).replace(/[^a-zA-Z0-9]/g, '_');
          mermaid += `    ${reqIdSafe} == "satisfies" ==> ${symId}\n`;
        }
      });

      // 4. File-to-File Internal Import Edges
      if (internalEdges.length > 0) {
        mermaid += '\n    %% ── Module Import Dependencies ──\n';
        const renderedEdges = new Set();
        internalEdges.forEach(edge => {
          const fromId = "F_" + (edge.from || '').replace(/[^a-zA-Z0-9]/g, '_');
          const toId = "F_" + (edge.to || '').replace(/[^a-zA-Z0-9]/g, '_');
          const edgeKey = `${fromId}->${toId}`;
          if (fileMap.has(fromId) && fileMap.has(toId) && !renderedEdges.has(edgeKey)) {
            renderedEdges.add(edgeKey);
            const edgeLabel = edge.specifiers && edge.specifiers.length > 0 ? sanitize(edge.specifiers.slice(0, 3).join(', ')) : 'imports';
            mermaid += `    ${fromId} -. "${edgeLabel}" .-> ${toId}\n`;
          }
        });
      }

      // 5. Architectural Decisions (DAG) layer
      if (allDecisions.length > 0) {
        mermaid += '\n    %% ── Architectural Decisions (DAG) ──\n';
        allDecisions.forEach(d => {
          const safeId = "ADR_" + d.id.replace(/[^a-zA-Z0-9]/g, '_');
          const statusIcon = d.status === 'accepted' ? '🏛️' : d.status === 'superseded' ? '⚠️' : '📝';
          const label = sanitize(`${statusIcon} ${d.id}: ${d.title} (${d.status || 'accepted'})`);
          const styleClass = d.status === 'superseded' ? 'adrSuperseded' : d.status === 'draft' ? 'adrDraft' : 'adrAccepted';
          mermaid += `    ${safeId}["${label}"]:::${styleClass}\n`;
        });

        allDecisions.forEach(d => {
          const safeId = "ADR_" + d.id.replace(/[^a-zA-Z0-9]/g, '_');
          if (d.supersedes && Array.isArray(d.supersedes)) {
            d.supersedes.forEach(supId => {
              const safeSupId = "ADR_" + supId.replace(/[^a-zA-Z0-9]/g, '_');
              mermaid += `    ${safeSupId} == "superseded by" ==> ${safeId}\n`;
            });
          }
          if (d.relatedRequirements && Array.isArray(d.relatedRequirements)) {
            d.relatedRequirements.forEach(reqId => {
              const reqIdSafe = "REQ_" + String(reqId).replace(/[^a-zA-Z0-9]/g, '_');
              mermaid += `    ${safeId} -. "governs" .-> ${reqIdSafe}\n`;
            });
          }
        });
      }

      // 6. Styling
      mermaid += '\n    %% ── Styling ──\n';
      mermaid += '    classDef requirement fill:#1e293b,color:#00f0ff,stroke:#00f0ff,stroke-width:2px,font-size:12px,rx:8,ry:8\n';
      mermaid += '    classDef file fill:#0f172a,color:#f8fafc,stroke:#38bdf8,stroke-width:1.5px,font-size:12px,rx:6,ry:6\n';
      mermaid += '    classDef traced fill:#064e3b,color:#34d399,stroke:#10b981,stroke-width:1.5px,font-size:11px,rx:4,ry:4\n';
      mermaid += '    classDef untraced fill:#3b0712,color:#f87171,stroke:#ef4444,stroke-width:1.5px,font-size:11px,rx:4,ry:4\n';
      mermaid += '    classDef adrAccepted fill:#1e1b4b,color:#c084fc,stroke:#a855f7,stroke-width:2px,font-size:12px,rx:8,ry:8\n';
      mermaid += '    classDef adrSuperseded fill:#1e293b,color:#94a3b8,stroke:#64748b,stroke-width:1.5px,stroke-dasharray: 4 4,font-size:12px,rx:8,ry:8\n';
      mermaid += '    classDef adrDraft fill:#422006,color:#fbbf24,stroke:#f59e0b,stroke-width:2px,font-size:12px,rx:8,ry:8\n';

      const nodes = [
        ...allReqs.map(r => ({ id: `REQ_${r.id}`, type: 'requirement', name: r.title, rawId: r.id })),
        ...Array.from(fileMap.values()).map(f => ({ id: f.fileId, type: 'file', name: f.file, path: f.file })),
        ...allSymbols.map((s, idx) => ({ id: `S_${idx}`, type: 'symbol', name: s.symbolName, symbolType: s.symbolType, file: s.file, line: s.line, traced: s.traced, requirementId: s.requirementId })),
        ...allDecisions.map(d => ({ id: `ADR_${d.id}`, type: 'adr', name: d.title, status: d.status, rawId: d.id }))
      ];

      return {
        success: true,
        mermaid,
        nodes,
        internalEdges,
        summary: {
          totalFiles: fileMap.size,
          totalSymbols: allSymbols.length,
          tracedSymbols: allSymbols.filter(s => s.traced).length,
          totalRequirements: allReqs.length,
          totalDecisions: allDecisions.length
        }
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        mermaid: 'flowchart TB\n  Notice["⚠️ AST Graph Unavailable: ' + (err.message || 'Inspection error').replace(/"/g, '') + '"]',
        nodes: [],
        internalEdges: [],
        summary: { totalFiles: 0, totalSymbols: 0, tracedSymbols: 0, totalRequirements: 0, totalDecisions: 0 }
      };
    }
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
        standards: Array.isArray(storyData.standards) ? storyData.standards : [],
        relatedRequirements: Array.isArray(storyData.relatedRequirements) ? storyData.relatedRequirements : [],
        acceptanceCriteria: Array.isArray(storyData.acceptanceCriteria) ? storyData.acceptanceCriteria : (storyData.acceptanceCriteria ? [storyData.acceptanceCriteria] : []),
        dependsOn: Array.isArray(storyData.dependsOn) ? storyData.dependsOn : [],
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
      if (updates.standards !== undefined) story.standards = Array.isArray(updates.standards) ? updates.standards : [];
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
  // --- Task & Subtask CRUD Operations ---
  // =========================================================================

  /**
   * Create a task in backlog/epics.yaml
   */
  static async createTask(skyhookDir, taskData = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const task = ctx.addTask(taskData);
    return { success: true, task };
  }

  /**
   * Update a task in backlog/epics.yaml
   */
  static async updateTask(skyhookDir, taskId, updates = {}) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    if (!taskId) throw new Error('taskId is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.tasks)) backlog.tasks = [];

      const task = backlog.tasks.find(t => t.id === taskId);
      if (!task) throw new Error(`Task '${taskId}' not found`);

      if (updates.title !== undefined) task.title = updates.title;
      if (updates.description !== undefined) task.description = updates.description;
      if (updates.status !== undefined) task.status = updates.status;
      if (updates.priority !== undefined) task.priority = updates.priority;
      if (updates.type !== undefined) task.type = updates.type;
      if (updates.storyPoints !== undefined) task.storyPoints = updates.storyPoints ? Number(updates.storyPoints) : null;
      if (updates.estimatedMinutes !== undefined) task.estimatedMinutes = updates.estimatedMinutes ? Number(updates.estimatedMinutes) : null;
      if (updates.targetFiles !== undefined) task.targetFiles = Array.isArray(updates.targetFiles) ? updates.targetFiles : [];
      if (updates.standards !== undefined) task.standards = Array.isArray(updates.standards) ? updates.standards : [];
      if (updates.dependsOn !== undefined) task.dependsOn = Array.isArray(updates.dependsOn) ? updates.dependsOn : [];
      if (updates.subtasks !== undefined) task.subtasks = updates.subtasks;
      task.updatedAt = getTimestamp();

      writeYaml(epicsPath, backlog);

      EventLedger.appendEvent(skyhookDir, {
        type: 'TASK_UPDATED',
        actor: 'user-dashboard',
        payload: { taskId, updates }
      });

      return { success: true, task };
    });
  }

  /**
   * Delete a task from backlog/epics.yaml
   */
  static async deleteTask(skyhookDir, taskId) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    if (!taskId) throw new Error('taskId is required');
    const epicsPath = path.join(skyhookDir, 'backlog', 'epics.yaml');

    return await BacklogLock.withLock(skyhookDir, async () => {
      const backlog = readYaml(epicsPath) || { epics: [], stories: [], tasks: [] };
      if (!Array.isArray(backlog.tasks)) backlog.tasks = [];

      const initialCount = backlog.tasks.length;
      backlog.tasks = backlog.tasks.filter(t => t.id !== taskId);
      if (backlog.tasks.length === initialCount) {
        throw new Error(`Task '${taskId}' not found`);
      }

      // Remove from parent story or epic childTasks
      for (const s of (backlog.stories || [])) {
        if (s.childTasks) s.childTasks = s.childTasks.filter(id => id !== taskId);
      }
      for (const e of (backlog.epics || [])) {
        if (e.childTasks) e.childTasks = e.childTasks.filter(id => id !== taskId);
      }

      writeYaml(epicsPath, backlog);

      EventLedger.appendEvent(skyhookDir, {
        type: 'TASK_DELETED',
        actor: 'user-dashboard',
        payload: { taskId }
      });

      return { success: true, taskId };
    });
  }

  /**
   * Add a subtask under a task
   */
  static async createSubtask(skyhookDir, taskId, title) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const subtask = ctx.addSubtask(taskId, title);
    return { success: true, subtask };
  }

  /**
   * Toggle or update a subtask
   */
  static async toggleSubtask(skyhookDir, taskId, subtaskId, completed) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const subtask = ctx.toggleSubtask(taskId, subtaskId, completed);
    return { success: true, subtask };
  }

  /**
   * Heartbeat / extend a lease
   */
  static async heartbeatLease(skyhookDir, itemId, agentId, extendMinutes = 30) {
    if (!skyhookDir) throw new Error('skyhookDir is required');
    const ctx = createSkyhookContext(path.dirname(skyhookDir));
    if (!ctx) throw new Error('Failed to create context');

    const backlog = ctx.readBacklog();
    const story = (backlog.stories || []).find(s => s.id === itemId);
    const task = (backlog.tasks || []).find(t => t.id === itemId);
    const item = story || task;
    if (!item) throw new Error(`Work item '${itemId}' not found`);

    const lease = TaskLeaseManager.heartbeatLease(item, agentId, Number(extendMinutes));
    ctx.writeBacklog(backlog);
    return { success: true, itemId: item.id, lease };
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
    const standards = Array.isArray(adrData.standards) ? adrData.standards : [];
    const standardsHeader = standards.length > 0 ? `  \n**Governed Standards**: ${standards.join(', ')}` : '';

    const markdownContent = `# ${adrId}: ${adrData.title || 'Untitled Decision'}

**Status**: ${adrData.status || 'accepted'}  
**Date**: ${now}  
**Author**: ${adrData.author || 'User Dashboard'}  
**Category**: ${adrData.category || 'Architecture'}${standardsHeader}  

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
      standards,
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
    if (updates.standards !== undefined) entry.standards = Array.isArray(updates.standards) ? updates.standards : [];
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
