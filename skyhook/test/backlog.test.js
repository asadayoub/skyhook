import test from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { 
  cmdListCurrentFeatures, 
  cmdGetFeature, 
  cmdGetNextTask, 
  cmdGetBlockers, 
  cmdUpdateStatus, 
  cmdAddFeature, 
  cmdBatchCreate 
} from '../lib/handlers/backlog.js';

function createMockContext() {
  const state = {
    backlog: {
      epics: [
        { id: 'EPIC-1', title: 'Auth System', status: 'in-progress' },
        { id: 'EPIC-2', title: 'Payment Integration', status: 'backlog' }
      ],
      stories: [
        { id: 'STORY-1', title: 'Login Page', epicId: 'EPIC-1', status: 'done', priority: 'high' },
        { id: 'STORY-2', title: 'Forgot Password', epicId: 'EPIC-1', status: 'ready', priority: 'medium' },
        { id: 'STORY-3', title: 'Stripe Setup', epicId: 'EPIC-2', status: 'blocked', priority: 'critical' }
      ]
    },
    funcReqs: { requirements: [] }
  };

  return {
    state,
    skyhookDir: '/mock/dir',
    readBacklog: () => state.backlog,
    writeBacklog: (data) => { state.backlog = data; },
    updateStoryStatus: (storyId, status) => {
      const story = state.backlog.stories.find(s => s.id === storyId);
      if (story) {
        story.status = status;
        return true;
      }
      return false;
    },
    addFeature: (data) => {
      const epicId = 'EPIC-NEW';
      state.backlog.epics.push({ id: epicId, ...data });
      return { featureId: epicId };
    },
    readFunctionalReqs: () => state.funcReqs,
    writeDecision: (data) => {
      return 'DEC-NEW';
    }
  };
}

test('cmdListCurrentFeatures returns all features and stories grouped', async () => {
  const ctx = createMockContext();
  const result = await cmdListCurrentFeatures(ctx, { status: 'all' });
  
  assert.ok(result.features);
  assert.strictEqual(result.features.length, 2);
  assert.strictEqual(result.features[0].epic.id, 'EPIC-1');
  assert.strictEqual(result.features[0].stories.length, 2);
  assert.strictEqual(result.features[1].stories[0].status, 'blocked');
});

test('cmdListCurrentFeatures filters by status', async () => {
  const ctx = createMockContext();
  const result = await cmdListCurrentFeatures(ctx, { status: 'ready' });
  
  assert.strictEqual(result.features[0].stories.length, 1);
  assert.strictEqual(result.features[0].stories[0].id, 'STORY-2');
  assert.strictEqual(result.features[1].stories.length, 0);
});

test('cmdGetFeature returns existing feature and its stories', async () => {
  const ctx = createMockContext();
  const result = await cmdGetFeature(ctx, { id: 'EPIC-1' });
  
  assert.ok(!result.error);
  assert.strictEqual(result.feature.id, 'EPIC-1');
  assert.strictEqual(result.stories.length, 2);
});

test('cmdGetFeature returns error for non-existent feature', async () => {
  const ctx = createMockContext();
  const result = await cmdGetFeature(ctx, { id: 'EPIC-NONEXISTENT' });
  
  assert.ok(result.error);
  assert.match(result.error, /Feature not found/);
});

test('cmdGetNextTask returns highest priority ready task', async () => {
  const ctx = createMockContext();
  const result = await cmdGetNextTask(ctx, {});
  
  assert.ok(result.task);
  // STORY-2 is the only 'ready' task
  assert.strictEqual(result.task.id, 'STORY-2');
});

test('cmdGetBlockers returns blocked tasks', async () => {
  const ctx = createMockContext();
  const result = await cmdGetBlockers(ctx, {});
  
  assert.strictEqual(result.blockers.length, 1);
  assert.strictEqual(result.blockers[0].id, 'STORY-3');
});

test('cmdUpdateStatus successfully updates status', async () => {
  const ctx = createMockContext();
  const result = await cmdUpdateStatus(ctx, { storyId: 'STORY-2', status: 'in-progress' });
  
  assert.ok(result.success);
  assert.strictEqual(result.status, 'in-progress');
  assert.strictEqual(ctx.state.backlog.stories[1].status, 'in-progress');
});

test('cmdUpdateStatus rejects invalid status', async () => {
  const ctx = createMockContext();
  const result = await cmdUpdateStatus(ctx, { storyId: 'STORY-2', status: 'invalid-status' });
  
  assert.ok(result.error);
  assert.match(result.error, /Invalid status/);
});

test('cmdUpdateStatus handles non-existent story', async () => {
  const ctx = createMockContext();
  const result = await cmdUpdateStatus(ctx, { storyId: 'STORY-99', status: 'done' });
  
  assert.ok(result.error);
  assert.match(result.error, /Story not found/);
});

test('cmdAddFeature creates a new feature', async () => {
  const ctx = createMockContext();
  const result = await cmdAddFeature(ctx, { title: 'New Feature' });
  
  assert.ok(result.success);
  assert.strictEqual(result.featureId, 'EPIC-NEW');
  assert.strictEqual(ctx.state.backlog.epics.length, 3);
});

test('cmdAddFeature requires a title', async () => {
  const ctx = createMockContext();
  const result = await cmdAddFeature(ctx, {});
  
  assert.ok(result.error);
  assert.match(result.error, /Missing required: title/);
});

test('cmdBatchCreate processes multiple item types correctly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-backlog-test-'));
  const reqDir = path.join(tmpDir, 'requirements');
  fs.mkdirSync(reqDir, { recursive: true });

  const ctx = createMockContext();
  ctx.skyhookDir = tmpDir;
  
  try {
    const result = await cmdBatchCreate(ctx, {
      items: [
        { type: 'feature', data: { title: 'Batch Feature' } },
        { type: 'story', data: { title: 'Batch Story' } },
        { type: 'requirement', data: { title: 'Batch Req' } },
        { type: 'decision', data: { title: 'Batch Dec' } },
        { type: 'unknown', data: {} }
      ]
    });
    
    assert.strictEqual(result.success, 4);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.results.length, 5);
    
    const featureRes = result.results.find(r => r.type === 'feature');
    assert.ok(featureRes.success);
    assert.ok(featureRes.featureId);
    
    const storyRes = result.results.find(r => r.type === 'story');
    assert.ok(storyRes.success);
    assert.ok(storyRes.storyId);
    
    const reqRes = result.results.find(r => r.type === 'requirement');
    assert.ok(reqRes.success);
    assert.ok(reqRes.requirementId);
    
    const decRes = result.results.find(r => r.type === 'decision');
    assert.ok(decRes.success);
    assert.ok(decRes.decisionId);
    
    const unknownRes = result.results.find(r => r.type === 'unknown');
    assert.ok(!unknownRes.success);
    assert.match(unknownRes.error, /Unknown type/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
