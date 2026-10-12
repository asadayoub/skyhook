import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PlanCompiler } from '../lib/plan/PlanCompiler.js';
import { GanttGenerator } from '../lib/plan/GanttGenerator.js';
import { cmdPlan } from '../lib/handlers/general.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { registerPlanTools } from '../lib/harness/mcp/tools/planTools.js';

function createMockBacklogContext(tmpDir, backlog) {
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const projectYaml = {
    id: 'PROJ-WINDOW-TEST',
    name: 'Plan Scope Windowing Test',
    profile: 'web-app',
    description: 'Testing scope windowing for active vs all plans.'
  };

  const funcReqs = {
    requirements: [
      { id: 'REQ-101', title: 'Data Pipeline', category: 'core', priority: 'high', status: 'ready' }
    ]
  };

  const nfReqs = { requirements: [] };
  const decisions = { decisions: [] };
  const techStack = { technologies: [] };
  const standards = { overrides: [], adoptions: [] };

  return {
    skyhookDir,
    projectDir: tmpDir,
    readProjectYaml: () => projectYaml,
    readProfile: () => ({ standards: {} }),
    readFunctionalReqs: () => funcReqs,
    readNonFunctionalReqs: () => nfReqs,
    readBacklog: () => backlog,
    readDecisions: () => decisions,
    readTechStack: () => techStack,
    readStandards: () => standards
  };
}

test('PlanCompiler: filters cancelled and old completed stories under scope: active', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-plan-scope-'));
  try {
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const backlog = {
      epics: [
        { id: 'EPIC-1', title: 'Core Features', status: 'in-progress', childStories: ['S-ACTIVE', 'S-RECENT', 'S-OLD', 'S-CANCELLED'] },
        { id: 'EPIC-OLD', title: 'Old Epic', status: 'done', completedAt: thirtyDaysAgo, childStories: ['S-OLD'] },
        { id: 'EPIC-CANCELLED', title: 'Cancelled Epic', status: 'cancelled', childStories: [] }
      ],
      stories: [
        { id: 'S-ACTIVE', epicId: 'EPIC-1', title: 'Active Story', status: 'ready', storyPoints: 3 },
        { id: 'S-RECENT', epicId: 'EPIC-1', title: 'Recent Story', status: 'done', completedAt: twoDaysAgo, storyPoints: 2 },
        { id: 'S-OLD', epicId: 'EPIC-1', title: 'Old Story', status: 'done', completedAt: thirtyDaysAgo, storyPoints: 5 },
        { id: 'S-CANCELLED', epicId: 'EPIC-1', title: 'Cancelled Story', status: 'cancelled', storyPoints: 1 }
      ],
      tasks: [
        { id: 'T-ACTIVE', parentId: 'EPIC-1', parentType: 'epic', title: 'Active Task', status: 'in-progress' },
        { id: 'T-OLD', parentId: 'EPIC-1', parentType: 'epic', title: 'Old Task', status: 'done', completedAt: thirtyDaysAgo },
        { id: 'T-CANCELLED', parentId: 'EPIC-1', parentType: 'epic', title: 'Cancelled Task', status: 'cancelled' }
      ]
    };

    const ctx = createMockBacklogContext(tmpDir, backlog);

    // 1. scope: 'active'
    const activeRes = await PlanCompiler.compileMasterPlan(ctx, { scope: 'active' });
    assert.strictEqual(activeRes.stats.scope, 'active');
    assert.strictEqual(activeRes.stats.storiesCount, 2); // S-ACTIVE and S-RECENT
    assert.strictEqual(activeRes.stats.tasksCount, 1);   // T-ACTIVE
    assert.strictEqual(activeRes.stats.epicsCount, 1);   // EPIC-1 retained, EPIC-OLD and EPIC-CANCELLED pruned

    const activeContent = fs.readFileSync(activeRes.path, 'utf-8');
    assert.ok(activeContent.includes('**Scope**: `active`'));

    // 2. scope: 'all'
    const allRes = await PlanCompiler.compileMasterPlan(ctx, { scope: 'all' });
    assert.strictEqual(allRes.stats.scope, 'all');
    assert.strictEqual(allRes.stats.storiesCount, 4); // all 4 stories retained
    assert.strictEqual(allRes.stats.tasksCount, 3);   // all 3 tasks retained
    assert.strictEqual(allRes.stats.epicsCount, 3);   // all 3 epics retained

    const allContent = fs.readFileSync(allRes.path, 'utf-8');
    assert.ok(allContent.includes('**Scope**: `all`'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GanttGenerator: filters cancelled items by default and supports scope: active', () => {
  const now = Date.now();
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const backlog = {
    epics: [
      { id: 'EPIC-1', title: 'Auth Epic', status: 'in-progress', childStories: ['S-ACTIVE', 'S-CANCELLED', 'S-OLD'] },
      { id: 'EPIC-CANCELLED', title: 'Dropped Epic', status: 'cancelled', childStories: [] }
    ],
    stories: [
      { id: 'S-ACTIVE', epicId: 'EPIC-1', title: 'Active Story', status: 'in-progress', createdAt: twoDaysAgo },
      { id: 'S-CANCELLED', epicId: 'EPIC-1', title: 'Cancelled Story', status: 'cancelled', createdAt: twoDaysAgo },
      { id: 'S-OLD', epicId: 'EPIC-1', title: 'Old Story', status: 'done', completedAt: thirtyDaysAgo, createdAt: thirtyDaysAgo }
    ],
    tasks: [
      { id: 'T-CANCELLED', epicId: 'EPIC-1', parentId: 'EPIC-1', parentType: 'epic', title: 'Cancelled Task', status: 'cancelled' }
    ]
  };

  // 1. Default (excludes cancelled items)
  const defaultChart = GanttGenerator.generateGantt(backlog);
  assert.ok(defaultChart.includes('Active Story'));
  assert.ok(defaultChart.includes('Old Story'));
  assert.ok(!defaultChart.includes('Cancelled Story'), 'Cancelled story should be excluded');
  assert.ok(!defaultChart.includes('Dropped Epic'), 'Cancelled epic should be excluded');
  assert.ok(!defaultChart.includes('Cancelled Task'), 'Cancelled task should be excluded');

  // 2. scope: 'active' (excludes cancelled AND completed > 14 days ago)
  const activeChart = GanttGenerator.generateGantt(backlog, { scope: 'active' });
  assert.ok(activeChart.includes('Active Story'));
  assert.ok(!activeChart.includes('Old Story'), 'Old story (>14 days) should be excluded in active scope');
  assert.ok(!activeChart.includes('Cancelled Story'));

  // 3. includeCancelled: true
  const allChart = GanttGenerator.generateGantt(backlog, { includeCancelled: true });
  assert.ok(allChart.includes('Cancelled Story'));
  assert.ok(allChart.includes('Dropped Epic'));
});

test('cmdPlan: respects scope parameter from arguments object and CLI flags', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cmdplan-scope-'));
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const backlog = {
      epics: [
        { id: 'EPIC-1', title: 'Module 1', status: 'in-progress', childStories: ['S1', 'S2'] }
      ],
      stories: [
        { id: 'S1', epicId: 'EPIC-1', title: 'Live Story', status: 'ready', storyPoints: 2 },
        { id: 'S2', epicId: 'EPIC-1', title: 'Old Done Story', status: 'done', completedAt: thirtyDaysAgo, storyPoints: 3 }
      ]
    };
    const ctx = createMockBacklogContext(tmpDir, backlog);

    // Default: active scope
    const defaultRes = await cmdPlan(ctx, {});
    assert.strictEqual(defaultRes.stats.scope, 'active');
    assert.strictEqual(defaultRes.stats.storiesCount, 1);

    // Explicit scope: all
    const allRes = await cmdPlan(ctx, { scope: 'all' });
    assert.strictEqual(allRes.stats.scope, 'all');
    assert.strictEqual(allRes.stats.storiesCount, 2);

    // Array CLI args: --scope all
    const cliRes = await cmdPlan(ctx, ['--scope', 'all']);
    assert.strictEqual(cliRes.stats.scope, 'all');
    assert.strictEqual(cliRes.stats.storiesCount, 2);

    // Format mermaid with scope
    const mermaidRes = await cmdPlan(ctx, { format: 'mermaid', scope: 'active' });
    assert.strictEqual(mermaidRes.format, 'mermaid');
    assert.ok(mermaidRes.chart.includes('Live Story'));
    assert.ok(!mermaidRes.chart.includes('Old Done Story'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MCP plan tools: skyhook_recompile_plan and skyhook_get_plan support scope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-plan-scope-'));
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const backlog = {
      epics: [
        { id: 'EPIC-1', title: 'MCP Epic', status: 'in-progress', childStories: ['S-A', 'S-B'] }
      ],
      stories: [
        { id: 'S-A', epicId: 'EPIC-1', title: 'Active S-A', status: 'in-progress', storyPoints: 3 },
        { id: 'S-B', epicId: 'EPIC-1', title: 'Historic S-B', status: 'done', completedAt: thirtyDaysAgo, storyPoints: 5 }
      ]
    };
    const ctx = createMockBacklogContext(tmpDir, backlog);

    const registry = new MCPToolRegistry();
    registerPlanTools(registry);

    const recompileTool = registry.getTool('skyhook_recompile_plan');
    assert.ok(recompileTool);

    // 1. Recompile with scope: active
    const activeMcpRes = await recompileTool.execute({ scope: 'active', all: false }, ctx);
    assert.ok(!activeMcpRes.isError);
    const activeData = JSON.parse(activeMcpRes.content[0].text);
    assert.strictEqual(activeData.stats.scope, 'active');
    assert.strictEqual(activeData.stats.storiesCount, 1);

    // 2. Recompile with scope: all
    const allMcpRes = await recompileTool.execute({ scope: 'all', all: false }, ctx);
    assert.ok(!allMcpRes.isError);
    const allData = JSON.parse(allMcpRes.content[0].text);
    assert.strictEqual(allData.stats.scope, 'all');
    assert.strictEqual(allData.stats.storiesCount, 2);

    // 3. Get plan mermaid with scope: active
    const getPlanTool = registry.getTool('skyhook_get_plan');
    assert.ok(getPlanTool);
    const mermaidMcpRes = await getPlanTool.execute({ format: 'mermaid', scope: 'active' }, ctx);
    assert.ok(!mermaidMcpRes.isError);
    const mermaidData = JSON.parse(mermaidMcpRes.content[0].text);
    assert.ok(mermaidData.chart.includes('Active S-A'));
    assert.ok(!mermaidData.chart.includes('Historic S-B'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
