import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';
import { readYaml, writeYaml } from '../lib/utils.js';

test('Dashboard CRUD Operations Suite', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-crud-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });

  // Seed epics.yaml
  writeYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'), {
    epics: [{ id: 'EPIC-001', title: 'Core Architecture', status: 'in-progress' }],
    stories: [{ id: 'STORY-001', title: 'Initial Setup', epicId: 'EPIC-001', status: 'done', storyPoints: 2 }]
  });

  // Seed index.yaml
  writeYaml(path.join(skyhookDir, 'decisions', 'index.yaml'), {
    schemaVersion: '1.0.0',
    decisions: [{ id: 'ADR-001', title: 'Use SQLite', status: 'accepted', file: 'decisions/records/ADR-001-use-sqlite.md' }]
  });

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('createStory creates a new story with auto-increment ID', async () => {
    const res = await DashboardRPCHandler.createStory(skyhookDir, {
      title: 'Implement Interactive Visualizer',
      epicId: 'EPIC-001',
      storyPoints: 5,
      priority: 'high'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.story.id, 'STORY-002');
    assert.strictEqual(res.story.title, 'Implement Interactive Visualizer');
    assert.strictEqual(res.story.storyPoints, 5);

    const onDisk = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'));
    assert.strictEqual(onDisk.stories.length, 2);
    assert.strictEqual(onDisk.stories[1].id, 'STORY-002');
  });

  await t.test('updateStory modifies existing story fields atomically', async () => {
    const res = await DashboardRPCHandler.updateStory(skyhookDir, 'STORY-002', {
      status: 'in-progress',
      storyPoints: 8
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.story.status, 'in-progress');
    assert.strictEqual(res.story.storyPoints, 8);

    const onDisk = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'));
    const updated = onDisk.stories.find(s => s.id === 'STORY-002');
    assert.strictEqual(updated.status, 'in-progress');
    assert.strictEqual(updated.storyPoints, 8);
  });

  await t.test('deleteStory removes story from epics.yaml', async () => {
    const res = await DashboardRPCHandler.deleteStory(skyhookDir, 'STORY-002');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.storyId, 'STORY-002');

    const onDisk = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'));
    assert.strictEqual(onDisk.stories.length, 1);
    assert.strictEqual(onDisk.stories[0].id, 'STORY-001');
  });

  await t.test('createEpic and updateEpic work correctly', async () => {
    const createRes = await DashboardRPCHandler.createEpic(skyhookDir, {
      title: 'Realtime Governance Cockpit',
      goal: 'Empower human leads and agents with live state'
    });

    assert.strictEqual(createRes.success, true);
    assert.strictEqual(createRes.epic.id, 'EPIC-002');
    assert.strictEqual(createRes.epic.title, 'Realtime Governance Cockpit');

    const updateRes = await DashboardRPCHandler.updateEpic(skyhookDir, 'EPIC-002', {
      status: 'active'
    });
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.epic.status, 'active');
  });

  await t.test('createADR writes standard Markdown record and updates index.yaml', async () => {
    const res = await DashboardRPCHandler.createADR(skyhookDir, {
      title: 'Adopt Hybrid Vector Storage',
      context: 'We need scalable embeddings for symbol lineage',
      decision: 'We will use SQLite-vec with disk fallback',
      status: 'accepted'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.adr.id, 'ADR-002');
    assert.ok(fs.existsSync(res.filePath));

    const content = fs.readFileSync(res.filePath, 'utf-8');
    assert.ok(content.includes('# ADR-002: Adopt Hybrid Vector Storage'));
    assert.ok(content.includes('## Decision'));

    const indexData = readYaml(path.join(skyhookDir, 'decisions', 'index.yaml'));
    assert.strictEqual(indexData.decisions.length, 2);
    assert.strictEqual(indexData.decisions[1].id, 'ADR-002');
  });

  await t.test('createRequirement and updateRequirement manage requirements properly', async () => {
    const res = await DashboardRPCHandler.createRequirement(skyhookDir, 'functional', {
      statement: 'The system must support pan and zoom on all architecture diagrams',
      priority: 'high'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.requirement.id, 'REQ-001');
    assert.strictEqual(res.requirement.statement, 'The system must support pan and zoom on all architecture diagrams');

    const updateRes = await DashboardRPCHandler.updateRequirement(skyhookDir, 'functional', 'REQ-001', {
      priority: 'critical'
    });
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.requirement.priority, 'critical');
  });

  await t.test('reindexSymbols returns valid symbol count', async () => {
    const res = await DashboardRPCHandler.reindexSymbols(tmpDir);
    assert.strictEqual(res.success, true);
    assert.strictEqual(typeof res.count, 'number');
  });
});
