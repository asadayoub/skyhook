import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CapacityPlanner } from '../lib/plan/CapacityPlanner.js';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';

test('CapacityPlanner: handles empty events with default baseline velocity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cap-test-'));
  try {
    const backlog = {
      stories: [
        { id: 'S1', title: 'Task 1', status: 'ready', storyPoints: 5 },
        { id: 'S2', title: 'Task 2', status: 'backlog', storyPoints: 5 }
      ]
    };

    const res = CapacityPlanner.plan(tmpDir, backlog);
    assert.strictEqual(res.weeklyVelocityPoints, 10);
    assert.strictEqual(res.remainingPoints, 10);
    assert.strictEqual(res.remainingStoriesCount, 2);
    assert.strictEqual(res.forecast.remainingWeeksP50, 1);
    assert.ok(res.forecast.projectedCompletionDateP50);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CapacityPlanner: calculates velocity and cycle times from historical events', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cap-events-'));
  try {
    const now = Date.now();
    const fourDaysAgo = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();

    // Append events
    EventLedger.appendEvent(tmpDir, {
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent',
      timestamp: fourDaysAgo,
      payload: { storyId: 'S1', from: 'ready', to: 'in-progress' }
    });
    EventLedger.appendEvent(tmpDir, {
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent',
      timestamp: threeDaysAgo,
      payload: { storyId: 'S1', from: 'in-progress', to: 'done' }
    });
    EventLedger.appendEvent(tmpDir, {
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent',
      timestamp: twoDaysAgo,
      payload: { storyId: 'S2', from: 'ready', to: 'in-progress' }
    });
    EventLedger.appendEvent(tmpDir, {
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent',
      timestamp: oneDayAgo,
      payload: { storyId: 'S2', from: 'in-progress', to: 'done' }
    });

    const backlog = {
      stories: [
        { id: 'S1', title: 'Task 1', status: 'done', storyPoints: 5 },
        { id: 'S2', title: 'Task 2', status: 'done', storyPoints: 5 },
        { id: 'S3', title: 'Task 3', status: 'backlog', storyPoints: 8 }
      ]
    };

    const res = CapacityPlanner.plan(tmpDir, backlog, { windowDays: 14 });
    assert.strictEqual(res.completedStoriesCount, 2);
    assert.strictEqual(res.completedPoints, 10);
    assert.ok(res.weeklyVelocityPoints > 0);
    assert.ok(res.averageCycleTimeHours > 0);
    assert.strictEqual(res.remainingPoints, 8);
    assert.strictEqual(res.remainingStoriesCount, 1);
    assert.ok(res.forecast.remainingWeeksP50 >= 0);
    assert.ok(res.forecast.remainingWeeksP90 >= res.forecast.remainingWeeksP50);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CapacityPlanner: detects scope creep when added points outpace completion', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cap-creep-'));
  try {
    // Add multiple story created events
    for (let i = 0; i < 5; i++) {
      EventLedger.appendEvent(tmpDir, {
        type: EVENT_TYPES.STORY_CREATED,
        actor: 'user',
        payload: { id: `NEW-${i}`, storyPoints: 5, priority: 'high' }
      });
    }

    const backlog = {
      stories: [
        { id: 'NEW-0', status: 'backlog', storyPoints: 5 },
        { id: 'NEW-1', status: 'backlog', storyPoints: 5 }
      ]
    };

    const res = CapacityPlanner.plan(tmpDir, backlog);
    assert.strictEqual(res.scopeCreep.detected, true);
    assert.ok(res.scopeCreep.addedPoints > res.scopeCreep.completedPoints);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
