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
import { inferFromRepo } from '../inference/InferenceEngine.js';
import { detectDrift } from '../drift-analyzer.js';

export class DashboardRPCHandler {
  /**
   * Discover projects from workspace and ~/.skyhook
   * @param {string} currentWorkspaceDir
   * @returns {Array<Object>}
   */
  static getProjects(currentWorkspaceDir = process.cwd()) {
    const projects = [];
    const seenDirs = new Set();

    // 1. Current workspace project (primary)
    const localSkyhook = path.join(currentWorkspaceDir, '.skyhook');
    if (fs.existsSync(localSkyhook) && fs.existsSync(path.join(localSkyhook, 'project.yaml'))) {
      const projYaml = readYaml(path.join(localSkyhook, 'project.yaml')) || {};
      const id = projYaml.id || path.basename(currentWorkspaceDir);
      projects.push({
        id,
        name: projYaml.name || id,
        profile: projYaml.profile || 'web-app',
        skyhookDir: localSkyhook,
        projectDir: currentWorkspaceDir,
        isCurrentWorkspace: true
      });
      seenDirs.add(localSkyhook);
    }

    // 2. Global ~/.skyhook catalog
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skyhookHome = path.join(home, '.skyhook');
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
}
