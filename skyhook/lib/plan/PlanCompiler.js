/**
 * Plan Compiler
 * Master pipeline orchestrating the compilation of living, dynamic project plans.
 * Integrates Mermaid Gantt charts, predictive velocity capacity forecasting,
 * critical path scheduling, and living traceability matrices.
 */

import fs from 'fs';
import path from 'path';
import { getTimestamp, readYaml } from '../utils.js';
import { GanttGenerator } from './GanttGenerator.js';
import { CapacityPlanner } from './CapacityPlanner.js';
import { CriticalPathAnalyzer } from './CriticalPathAnalyzer.js';
import { TraceabilityMatrix } from './TraceabilityMatrix.js';
import { ScopedPlanGenerator } from './ScopedPlanGenerator.js';
import { indexCodebase } from '../tracer.js';

export class PlanCompiler {
  /**
   * Compile the master project plan
   * @param {Object} ctx - SkyhookContext
   * @param {Object} options - { symbols: Array, projectDir: string }
   * @returns {Promise<Object>} Compilation results
   */
  static async compileMasterPlan(ctx, options = {}) {
    const skyhookDir = ctx.skyhookDir;
    const projectDir = options.projectDir || process.cwd();

    // 1. Gather all domains
    const projectYaml = (ctx.readProjectYaml ? ctx.readProjectYaml() : readYaml(path.join(skyhookDir, 'project.yaml'))) || {};
    const profile = ctx.readProfile ? ctx.readProfile(projectYaml.profile || 'web-app') : null;
    const backlog = (ctx.readBacklog ? ctx.readBacklog() : readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'))) || { epics: [], stories: [] };
    const funcReqs = (ctx.readFunctionalReqs ? ctx.readFunctionalReqs() : readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml'))) || { requirements: [] };
    const nfReqs = (ctx.readNonFunctionalReqs ? ctx.readNonFunctionalReqs() : readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml'))) || { requirements: [] };
    const decisions = (ctx.readDecisions ? ctx.readDecisions() : readYaml(path.join(skyhookDir, 'decisions', 'index.yaml'))) || { decisions: [] };
    const standards = (ctx.readStandards ? ctx.readStandards() : readYaml(path.join(skyhookDir, 'standards', 'index.yaml'))) || { overrides: [], adoptions: [] };
    const techStack = (ctx.readTechStack ? ctx.readTechStack() : readYaml(path.join(skyhookDir, 'tech-stack.yaml'))) || { technologies: [] };

    // 2. Scan symbols if not provided
    let symbols = options.symbols;
    if (!symbols) {
      try {
        symbols = await indexCodebase(projectDir);
      } catch {
        symbols = [];
      }
    }

    // 3. Run Analysis Pipelines
    const criticalPathResult = CriticalPathAnalyzer.analyze(backlog.stories || []);
    const capacityResult = CapacityPlanner.plan(skyhookDir, backlog, { windowDays: 14 });
    const ganttChart = GanttGenerator.generateGantt(backlog, {
      criticalPathIds: criticalPathResult.criticalPathSet
    });
    const traceabilityTable = TraceabilityMatrix.generate({
      functionalReqs: funcReqs,
      nonFunctionalReqs: nfReqs,
      backlog,
      decisions,
      symbols
    });

    // 4. Assemble Living Plan Document
    const planDir = path.join(skyhookDir, 'plan');
    if (!fs.existsSync(planDir)) {
      fs.mkdirSync(planDir, { recursive: true });
    }
    const planPath = path.join(planDir, 'PROJECT_PLAN.md');

    let plan = `# Project Plan: ${projectYaml.name || 'Untitled Project'}\n\n`;
    plan += `> **Project ID**: \`${projectYaml.id || 'unknown'}\` | **Profile**: \`${projectYaml.profile || 'web-app'}\`\n`;
    plan += `> **Compiled**: ${getTimestamp()} by Skyhook Dynamic Plan Compiler\n\n`;

    plan += `## Executive Summary\n\n`;
    plan += `${projectYaml.description || 'No project description provided in project.yaml.'}\n\n`;

    // Capacity & Delivery Forecast
    plan += `### 🎯 Delivery & Capacity Forecast\n\n`;
    plan += `| Metric | Current Value | Notes |\n`;
    plan += `|:-------|:--------------|:------|\n`;
    plan += `| **Weekly Velocity** | **${capacityResult.weeklyVelocityPoints} pts/wk** | Derived from 14-day rolling events |\n`;
    plan += `| **Average Cycle Time** | **${capacityResult.averageCycleTimeHours} hours** | Average in-progress to done duration |\n`;
    plan += `| **Backlog Work Remaining** | **${capacityResult.remainingPoints} pts** (${capacityResult.remainingStoriesCount} stories) | Unfinished scope |\n`;
    plan += `| **Expected Completion (P50)** | 📅 **${capacityResult.forecast.projectedCompletionDateP50}** | Standard velocity projection (${capacityResult.forecast.remainingWeeksP50} wks) |\n`;
    plan += `| **Conservative Completion (P90)** | 📅 **${capacityResult.forecast.projectedCompletionDateP90}** | Risk-adjusted delivery date (${capacityResult.forecast.remainingWeeksP90} wks) |\n\n`;

    if (capacityResult.scopeCreep.detected) {
      plan += `> [!WARNING]\n`;
      plan += `> **Scope Creep Alert**: Net backlog growth (+${capacityResult.scopeCreep.netPointsGrowth} pts) exceeds recent completion rate. Delivery target may shift.\n\n`;
    }

    // Visual Gantt Roadmap
    plan += `## 1. Visual Delivery Roadmap & Timeline\n\n`;
    plan += ganttChart + '\n';

    if (criticalPathResult.criticalPath.length > 0) {
      plan += `> [!IMPORTANT]\n`;
      plan += `> **🔥 Critical Path Sequence**: ${criticalPathResult.criticalPath.join(' ➔ ')}\n`;
      plan += `> *Delays to stories on this path directly extend project completion date.*\n\n`;
    }

    // Traceability Matrix
    plan += `## 2. Living Traceability Matrix\n\n`;
    plan += `*Synchronizes requirements, backlog stories, architecture decisions, and active AST code symbols:*\n\n`;
    plan += traceabilityTable + '\n\n';

    // Architecture Decisions
    plan += `## 3. Architecture Decisions (ADRs)\n\n`;
    const decisionList = decisions.decisions || [];
    if (decisionList.length > 0) {
      plan += decisionList.map(d => `- **${d.id}**: ${d.title} (Status: \`${d.status}\`, Category: \`${d.category || 'architecture'}\`)`).join('\n') + '\n\n';
    } else {
      plan += `*No architecture decisions recorded yet. Run \`skyhook adr draft\` or \`skyhook decide\`.*\n\n`;
    }

    // Tech Stack
    plan += `## 4. Declared Tech Stack\n\n`;
    const tech = techStack.technologies || [];
    if (tech.length > 0) {
      plan += tech.map(t => `- **${t.name}** (\`${t.category || 'technology'}\`)`).join('\n') + '\n\n';
    } else {
      plan += `*No technologies listed in tech-stack.yaml.*\n\n`;
    }

    // Granular Scoped Plans
    plan += `## 5. Granular Scoped Plans\n\n`;
    plan += `To inspect deep-dive necessity, user stories, and execution checklists for individual items:\n\n`;
    plan += `- **Requirement Plans**: Available in \`.skyhook/plan/requirements/*.md\` (run \`skyhook plan --req <ID>\`)\n`;
    plan += `- **Epic Plans**: Available in \`.skyhook/plan/epics/*.md\` (run \`skyhook plan --epic <ID>\`)\n`;
    plan += `- **Compile All Plans**: Run \`skyhook plan --all\`\n\n`;

    // Risks & Milestones
    plan += `## 6. Execution Waves & Milestones\n\n`;
    if (criticalPathResult.waves.length > 0) {
      plan += `| Wave | Parallel Execution Stories | Prerequisite |\n`;
      plan += `|:-----|:---------------------------|:-------------|\n`;
      criticalPathResult.waves.forEach((wave, idx) => {
        plan += `| Wave ${idx + 1} | ${wave.join(', ')} | ${idx === 0 ? 'None (Start Immediately)' : `Wave ${idx} Completion`} |\n`;
      });
      plan += '\n';
    }

    plan += `---\n*Generated by Skyhook Dynamic Project Plan Compiler (v1.7.0).*\n`;

    fs.writeFileSync(planPath, plan, 'utf-8');

    return {
      message: 'Project plan generated successfully',
      path: planPath,
      forecast: capacityResult.forecast,
      criticalPath: criticalPathResult.criticalPath,
      stats: {
        epicsCount: backlog.epics?.length || 0,
        storiesCount: backlog.stories?.length || 0,
        functionalReqsCount: funcReqs.requirements?.length || 0,
        nonFunctionalReqsCount: nfReqs.requirements?.length || 0,
        decisionsCount: decisions.decisions?.length || 0,
        weeklyVelocity: capacityResult.weeklyVelocityPoints
      }
    };
  }

  /**
   * Compile a single scoped plan or all scoped plans
   */
  static compileScopedPlan(ctx, type, id, options = {}) {
    if (type === 'requirement' || type === 'req') {
      return ScopedPlanGenerator.generateRequirementPlan(id, ctx, options.symbols || []);
    } else if (type === 'epic') {
      return ScopedPlanGenerator.generateEpicPlan(id, ctx);
    } else if (type === 'all') {
      return ScopedPlanGenerator.generateAllScopedPlans(ctx, options.symbols || []);
    } else {
      throw new Error(`Unknown scoped plan type: ${type}. Expected: req, epic, all`);
    }
  }
}
