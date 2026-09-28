import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PlanCompiler } from '../lib/plan/PlanCompiler.js';
import { cmdPlan } from '../lib/handlers/general.js';
import { cmdSync } from '../lib/handlers/sync.js';

function createFullMockContext(tmpDir) {
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const projectYaml = {
    id: 'PROJ-TEST',
    name: 'Plan Compiler Test Project',
    profile: 'web-app',
    description: 'Autonomous agent project with dynamic planning.'
  };

  const funcReqs = {
    requirements: [
      { id: 'REQ-101', title: 'Data Pipeline', category: 'core', priority: 'high', status: 'ready', userStory: 'As an agent I need pipelines' }
    ]
  };

  const nfReqs = {
    requirements: [
      { id: 'NFR-101', title: 'Throughput', metric: 'req/sec', target: '> 1000', category: 'performance', priority: 'medium' }
    ]
  };

  const backlog = {
    epics: [
      { id: 'EPIC-1', title: 'Pipeline Engine', status: 'in-progress', childStories: ['STORY-A', 'STORY-B'] }
    ],
    stories: [
      { id: 'STORY-A', epicId: 'EPIC-1', title: 'Stream Reader', status: 'done', storyPoints: 3, relatedRequirements: ['REQ-101'] },
      { id: 'STORY-B', epicId: 'EPIC-1', title: 'Transformer', status: 'in-progress', dependsOn: ['STORY-A'], storyPoints: 5, relatedRequirements: ['REQ-101'] }
    ]
  };

  const decisions = {
    decisions: [
      { id: 'ADR-101', title: 'Event Streams via Node Transform', status: 'accepted', category: 'architecture', relatedRequirements: ['REQ-101'] }
    ]
  };

  const techStack = {
    technologies: [
      { name: 'Node.js', category: 'Runtime' }
    ]
  };

  const standards = {
    overrides: [],
    adoptions: []
  };

  return {
    skyhookDir,
    readProjectYaml: () => projectYaml,
    readProfile: () => ({ standards: { testing: 'node:test' } }),
    readFunctionalReqs: () => funcReqs,
    readNonFunctionalReqs: () => nfReqs,
    readBacklog: () => backlog,
    readDecisions: () => decisions,
    readTechStack: () => techStack,
    readStandards: () => standards
  };
}

test('PlanCompiler: compiles master PROJECT_PLAN.md with all sections', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-master-plan-'));
  try {
    const ctx = createFullMockContext(tmpDir);
    const mockSymbols = [
      { symbolName: 'createStream', traced: true, requirementId: 'REQ-101', filePath: 'lib/stream.js', line: 10 }
    ];

    const result = await PlanCompiler.compileMasterPlan(ctx, { projectDir: tmpDir, symbols: mockSymbols });
    assert.ok(fs.existsSync(result.path));
    assert.strictEqual(result.stats.storiesCount, 2);
    assert.strictEqual(result.stats.functionalReqsCount, 1);
    assert.ok(result.criticalPath.length > 0);

    const content = fs.readFileSync(result.path, 'utf-8');
    assert.ok(content.includes('# Project Plan: Plan Compiler Test Project'));
    assert.ok(content.includes('Delivery & Capacity Forecast'));
    assert.ok(content.includes('Visual Delivery Roadmap & Timeline'));
    assert.ok(content.includes('```mermaid\ngantt'));
    assert.ok(content.includes('Living Traceability Matrix'));
    assert.ok(content.includes('createStream'));
    assert.ok(content.includes('ADR-101'));
    assert.ok(content.includes('Execution Waves & Milestones'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdPlan: executes master compilation and CLI flags correctly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cmdplan-'));
  try {
    const ctx = createFullMockContext(tmpDir);

    // 1. Default Master Plan
    const r1 = await cmdPlan(ctx, {});
    assert.ok(fs.existsSync(r1.path));
    assert.strictEqual(r1.message, 'Project plan generated successfully');

    // 2. Scoped Requirement
    const r2 = await cmdPlan(ctx, { req: 'REQ-101' });
    assert.ok(fs.existsSync(r2.path));
    assert.strictEqual(r2.type, 'requirement');
    assert.strictEqual(r2.id, 'REQ-101');

    // 3. Scoped Epic
    const r3 = await cmdPlan(ctx, { epic: 'EPIC-1' });
    assert.ok(fs.existsSync(r3.path));
    assert.strictEqual(r3.type, 'epic');
    assert.strictEqual(r3.id, 'EPIC-1');

    // 4. All Plans
    const r4 = await cmdPlan(ctx, { all: true });
    assert.ok(fs.existsSync(r4.path));
    assert.ok(r4.scopedPlans.requirementsCount >= 1);
    assert.ok(r4.scopedPlans.epicsCount >= 1);

    // 5. Raw Mermaid
    const r5 = await cmdPlan(ctx, { format: 'mermaid' });
    assert.strictEqual(r5.format, 'mermaid');
    assert.ok(r5.chart.includes('gantt'));

    // 6. Array args handling (e.g. from command line parser)
    const r6 = await cmdPlan(ctx, ['--req', 'REQ-101']);
    assert.strictEqual(r6.type, 'requirement');
    assert.strictEqual(r6.id, 'REQ-101');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdSync: automatically recompiles plan when plan directory exists', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cmdsync-plan-'));
  try {
    const ctx = createFullMockContext(tmpDir);
    // Create plan directory
    fs.mkdirSync(path.join(ctx.skyhookDir, 'plan'), { recursive: true });

    const syncRes = await cmdSync(ctx, {});
    assert.ok(syncRes.planSync);
    assert.ok(fs.existsSync(syncRes.planSync.path));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
