import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSkyhookContext, SkyhookContext } from '../lib/context.js';
import { cmdInit, cmdStandards, cmdGetContext } from '../lib/handlers/general.js';
import { cmdGetNextTask, cmdAddFeature, cmdUpdateStatus, cmdReleaseLease } from '../lib/handlers/backlog.js';
import { cmdRecordDecision } from '../lib/handlers/adr.js';
import { ADRMarkdownParser } from '../lib/adr/ADRMarkdownParser.js';
import { ADRSyncEngine } from '../lib/adr/ADRSyncEngine.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, 'fixtures', 'standards_relational_test');

describe('Standards Relational Architecture Suite', () => {
  let ctx = null;
  const skyhookDir = path.join(TEST_DIR, '.skyhook');

  before(async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    ctx = new SkyhookContext(skyhookDir);
    await cmdInit(ctx, { name: 'Standards Relational Project', profile: 'web-app', force: true });
  });

  after(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (_) {}
  });

  test('Backlog story with standards references primes cmdGetNextTask with governingStandards briefing', async () => {
    // 1. Add feature with a story citing standards
    const addRes = await cmdAddFeature(ctx, {
      title: 'Authentication Module',
      stories: [
        {
          title: 'Secure JWT Authentication Endpoint',
          userStory: 'As a user I want secure JWT login',
          priority: 'critical',
          acceptanceCriteria: ['Valid JWT token returned on login'],
          standards: ['STD-SEC-001', 'STD-SEC-003']
        }
      ]
    });
    assert.ok(addRes.epicId);
    assert.strictEqual(addRes.storyIds.length, 1);
    const storyId = addRes.storyIds[0];

    // Transition story to ready
    const statusRes = await cmdUpdateStatus(ctx, { storyId, status: 'ready' });
    assert.strictEqual(statusRes.status, 'ready');

    // 2. Agent claims next task via cmdGetNextTask
    const taskRes = await cmdGetNextTask(ctx, { agent: 'claude-agent-1', lease: 30 });
    assert.ok(taskRes.task, 'Should return ready task');
    assert.strictEqual(taskRes.task.id, storyId);

    // Verify governing standards briefing is attached directly to the task
    assert.ok(Array.isArray(taskRes.task.governingStandards), 'Task must have governingStandards array');
    assert.strictEqual(taskRes.task.governingStandards.length, 2);

    const stdSec001 = taskRes.task.governingStandards.find(s => s.id === 'STD-SEC-001');
    assert.ok(stdSec001);
    assert.strictEqual(stdSec001.title, 'Secure JWT Authentication & Token Handling');
    assert.ok(stdSec001.criticalRules.length > 0);

    // Release lease so subsequent tests can re-claim task
    await cmdReleaseLease(ctx, { storyId, force: true });
  });

  test('MCP skyhook_get_next_task surfaces governingStandards to AI agents', async () => {
    const mcpRegistry = MCPToolRegistry.createDefault();
    const nextTaskTool = mcpRegistry.getTool('skyhook_get_next_task');
    assert.ok(nextTaskTool);

    const result = await nextTaskTool.execute({ assignee: 'antigravity-worker' }, ctx);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);

    assert.ok(parsed.task);
    assert.ok(Array.isArray(parsed.task.governingStandards));
    assert.strictEqual(parsed.task.governingStandards.length, 2);
  });

  test('MCP skyhook_get_context supports topic: standards', async () => {
    const mcpRegistry = MCPToolRegistry.createDefault();
    const contextTool = mcpRegistry.getTool('skyhook_get_context');
    assert.ok(contextTool);

    const result = await contextTool.execute({ topic: 'standards' }, ctx);
    const parsed = JSON.parse(result.content[0].text);

    assert.ok(parsed.standards);
    assert.ok(Array.isArray(parsed.standards.standards));
    assert.ok(parsed.stats.standards >= 16);
  });

  test('cmdRecordDecision attaches standards to ADR Markdown and decisions/index.yaml', async () => {
    const decisionRes = await cmdRecordDecision(ctx, {
      title: 'Enforce DDD Layer Boundary Isolation',
      decision: 'Presentation layer cannot communicate directly with database models.',
      context: 'Maintain architectural decoupling as codebase scales.',
      category: 'architecture',
      status: 'accepted',
      standards: ['STD-ARCH-001', 'STD-ARCH-002']
    });

    assert.ok(decisionRes.decisionId);
    assert.ok(fs.existsSync(decisionRes.file));

    // 1. Verify Markdown file contains Governed Standards header and section
    const markdown = fs.readFileSync(decisionRes.file, 'utf-8');
    assert.ok(markdown.includes('**Governed Standards**: STD-ARCH-001, STD-ARCH-002'), 'Header metadata must be present');
    assert.ok(markdown.includes('## Governing Standards'), 'Section header must be present');
    assert.ok(markdown.includes('- **STD-ARCH-001**'));
    assert.ok(markdown.includes('- **STD-ARCH-002**'));

    // 2. Verify decisions/index.yaml contains standards array
    const decisions = ctx.readDecisions();
    const recorded = decisions.decisions.find(d => d.id === decisionRes.decisionId);
    assert.ok(recorded);
    assert.deepStrictEqual(recorded.standards, ['STD-ARCH-001', 'STD-ARCH-002']);

    // 3. Verify ADRMarkdownParser parses standards
    const parser = new ADRMarkdownParser();
    const parsedADR = parser.parse(markdown);
    assert.deepStrictEqual(parsedADR.standards, ['STD-ARCH-001', 'STD-ARCH-002']);

    // 4. Verify ADRSyncEngine preserves standards
    const syncEngine = new ADRSyncEngine(skyhookDir);
    const syncRes = syncEngine.sync(ctx);
    assert.ok(syncRes);
  });

  test('DashboardRPCHandler supports standards across Stories, ADRs, and ProjectData', async () => {
    // 1. DashboardRPCHandler.createStory with standards
    const createStoryRes = await DashboardRPCHandler.createStory(skyhookDir, {
      title: 'Accessible Checkout Form',
      standards: ['STD-A11Y-001', 'STD-A11Y-002']
    });
    assert.ok(createStoryRes.success);
    assert.deepStrictEqual(createStoryRes.story.standards, ['STD-A11Y-001', 'STD-A11Y-002']);

    // 2. DashboardRPCHandler.updateStory updating standards
    const updateStoryRes = await DashboardRPCHandler.updateStory(skyhookDir, createStoryRes.story.id, {
      standards: ['STD-A11Y-001', 'STD-A11Y-002', 'STD-A11Y-003']
    });
    assert.ok(updateStoryRes.success);
    assert.strictEqual(updateStoryRes.story.standards.length, 3);

    // 3. DashboardRPCHandler.createADR with standards
    const createADRRes = DashboardRPCHandler.createADR(skyhookDir, {
      title: 'Adopt Structured Logging',
      decision: 'Use Winston JSON logger.',
      standards: ['STD-ARCH-004']
    });
    assert.ok(createADRRes.success);
    assert.deepStrictEqual(createADRRes.adr.standards, ['STD-ARCH-004']);

    // 4. DashboardRPCHandler.getProjectData includes standards catalog
    const projectData = await DashboardRPCHandler.getProjectData(skyhookDir, TEST_DIR);
    assert.ok(projectData.standards);
    assert.ok(Array.isArray(projectData.standards.catalog));
    assert.ok(projectData.standards.catalog.length >= 16);
  });

  test('CLI Handler cmdStandards supports list, view, new, and verify subcommands', async () => {
    // 1. List
    const listRes = await cmdStandards(ctx, { action: 'list' });
    assert.ok(Array.isArray(listRes.catalog));
    assert.ok(listRes.catalog.length >= 16);

    // 2. View
    const viewRes = await cmdStandards(ctx, { action: 'view', id: 'STD-SEC-001' });
    assert.ok(viewRes.success);
    assert.strictEqual(viewRes.standard.id, 'STD-SEC-001');

    // 3. New
    const newRes = await cmdStandards(ctx, {
      action: 'new',
      id: 'STD-REL-001',
      title: 'Relational Integrity Standard',
      category: 'architecture'
    });
    assert.ok(newRes.success);
    assert.ok(fs.existsSync(newRes.path));

    // 4. Verify
    const verifyRes = await cmdStandards(ctx, { action: 'verify' });
    assert.ok(verifyRes.summary);
    assert.strictEqual(typeof verifyRes.pass, 'boolean');
    assert.strictEqual(typeof verifyRes.exitCode, 'number');
  });
});
