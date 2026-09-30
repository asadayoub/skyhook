import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SkyhookContext, createSkyhookContext } from '../lib/context.js';
import { cmdInit } from '../lib/handlers/general.js';

test('SkyhookContext - Path Getters, Initialization Checks & Upward Discovery', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-context-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Uninitialized context
    const ctx = new SkyhookContext(tmpDir);
    assert.strictEqual(ctx.projectDir, tmpDir);
    assert.strictEqual(ctx.skyhookDir, skyhookDir);
    assert.strictEqual(ctx.isInitialized(), false);

    // Verify getters
    assert.strictEqual(ctx.backlogDir, path.join(skyhookDir, 'backlog'));
    assert.strictEqual(ctx.epicsFile, path.join(skyhookDir, 'backlog', 'epics.yaml'));
    assert.strictEqual(ctx.eventsFile, path.join(skyhookDir, 'backlog', 'events.jsonl'));
    assert.strictEqual(ctx.decisionsDir, path.join(skyhookDir, 'decisions'));
    assert.strictEqual(ctx.adrsDir, path.join(skyhookDir, 'decisions', 'records'));
    assert.strictEqual(ctx.requirementsDir, path.join(skyhookDir, 'requirements'));
    assert.strictEqual(ctx.standardsDir, path.join(skyhookDir, 'standards'));

    // Direct instantiation with .skyhook directory
    const directCtx = new SkyhookContext(skyhookDir);
    assert.strictEqual(directCtx.projectDir, tmpDir);
    assert.strictEqual(directCtx.skyhookDir, skyhookDir);

    // 2. Initialize project
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Context Test Workspace' });
    assert.strictEqual(ctx.isInitialized(), true);

    // 3. Upward Discovery from deep nested subdirectory
    const deepSubDir = path.join(tmpDir, 'src', 'features', 'checkout', 'services');
    fs.mkdirSync(deepSubDir, { recursive: true });

    const discoveredCtx = createSkyhookContext(deepSubDir);
    assert.ok(discoveredCtx, 'createSkyhookContext should discover parent .skyhook');
    assert.strictEqual(discoveredCtx.projectDir, tmpDir);
    assert.strictEqual(discoveredCtx.skyhookDir, skyhookDir);
    assert.strictEqual(discoveredCtx.isInitialized(), true);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SkyhookContext - Backlog Mutations, Decisions & Event Ledger Integration', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-context-ops-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Context Ops Workspace' });
    const ctx = new SkyhookContext(tmpDir);

    // 1. Add feature
    const { epicId, storyIds } = ctx.addFeature({
      title: 'Real-time Notifications',
      description: 'Send WebSocket notifications on task changes',
      stories: [
        {
          title: 'Implement Notification Gateway',
          userStory: 'As a user I want instant updates',
          priority: 'high'
        }
      ]
    });
    assert.ok(epicId);
    assert.strictEqual(storyIds.length, 1);

    const backlog = ctx.readBacklog();
    assert.ok(backlog.epics.some(e => e.id === epicId));
    assert.ok(backlog.stories.some(s => s.id === storyIds[0]));

    // 2. Update story status (triggers state machine & EventLedger)
    const storyId = storyIds[0];
    const updated = ctx.updateStoryStatus(storyId, 'in-progress', {
      agentId: 'test-agent-copilot',
      actor: 'agent'
    });
    assert.strictEqual(updated, true);

    const reloadedBacklog = ctx.readBacklog();
    const story = reloadedBacklog.stories.find(s => s.id === storyId);
    assert.strictEqual(story.status, 'in-progress');

    // Verify EventLedger file recorded event
    assert.ok(fs.existsSync(ctx.eventsFile));
    const eventsContent = fs.readFileSync(ctx.eventsFile, 'utf-8');
    assert.ok(eventsContent.includes('STATE_TRANSITIONED'));
    assert.ok(eventsContent.includes('in-progress'));

    // 3. Write & Read Decisions
    const decisionId = ctx.writeDecision({
      title: 'Adopt WebSocket for Real-time Streaming',
      status: 'accepted',
      category: 'Protocol',
      context: 'HTTP polling causes excessive server load.',
      decision: 'Use RFC 6455 WebSockets.'
    });
    assert.ok(decisionId);

    const decisions = ctx.readDecisions();
    assert.ok(decisions.decisions.some(d => d.id === decisionId));

    const decisionMd = ctx.readDecisionDetail(decisionId);
    assert.ok(decisionMd.includes('Adopt WebSocket for Real-time Streaming'));
    assert.ok(decisionMd.includes('Use RFC 6455 WebSockets'));

    // 4. Requirements and Standards accessors
    const funcReqs = ctx.readFunctionalReqs();
    assert.ok(Array.isArray(funcReqs.requirements));

    const nonFuncReqs = ctx.readNonFunctionalReqs();
    assert.ok(Array.isArray(nonFuncReqs.requirements));

    const constraints = ctx.readConstraints();
    assert.ok(Array.isArray(constraints.constraints));

    const standards = ctx.readStandards();
    assert.ok(standards !== null);

    const projectYaml = ctx.readProjectYaml();
    assert.strictEqual(projectYaml.name, 'Context Ops Workspace');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
