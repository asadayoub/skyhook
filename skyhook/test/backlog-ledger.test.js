import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';

function createTempSkyhookDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ledger-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });
  return { tmpDir, skyhookDir };
}

test('EventLedger appends and reads events from events.jsonl', () => {
  const { tmpDir, skyhookDir } = createTempSkyhookDir();
  try {
    EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.STORY_CREATED,
      actor: 'asad',
      payload: { id: 'STORY-100', title: 'Payment Webhook', priority: 'high' }
    });

    EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent:gemini',
      payload: { storyId: 'STORY-100', from: 'ready', to: 'in-progress' }
    });

    const events = EventLedger.readEvents(skyhookDir);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, EVENT_TYPES.STORY_CREATED);
    assert.strictEqual(events[0].actor, 'asad');
    assert.strictEqual(events[1].type, EVENT_TYPES.STATE_TRANSITIONED);
    assert.strictEqual(events[1].payload.storyId, 'STORY-100');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EventLedger projects complete backlog state from replay', () => {
  const mockEvents = [
    {
      eventId: '1',
      timestamp: '2026-09-28T10:00:00.000Z',
      type: EVENT_TYPES.EPIC_CREATED,
      actor: 'system',
      payload: { id: 'EPIC-10', title: 'Checkout Flow', status: 'in-progress' }
    },
    {
      eventId: '2',
      timestamp: '2026-09-28T10:05:00.000Z',
      type: EVENT_TYPES.STORY_CREATED,
      actor: 'system',
      payload: { id: 'STORY-10', epicId: 'EPIC-10', title: 'Cart Screen', status: 'ready' }
    },
    {
      eventId: '3',
      timestamp: '2026-09-28T10:10:00.000Z',
      type: EVENT_TYPES.TASK_LEASED,
      actor: 'agent-1',
      payload: { storyId: 'STORY-10', agentId: 'agent-1', expiresAt: '2026-09-28T10:40:00.000Z' }
    },
    {
      eventId: '4',
      timestamp: '2026-09-28T10:12:00.000Z',
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent-1',
      payload: { storyId: 'STORY-10', from: 'ready', to: 'in-progress' }
    },
    {
      eventId: '5',
      timestamp: '2026-09-28T10:45:00.000Z',
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent-1',
      payload: { storyId: 'STORY-10', from: 'in-progress', to: 'done' }
    }
  ];

  const projected = EventLedger.projectBacklog(mockEvents);
  assert.strictEqual(projected.epics.length, 1);
  assert.strictEqual(projected.epics[0].id, 'EPIC-10');
  assert.strictEqual(projected.stories.length, 1);
  assert.strictEqual(projected.stories[0].id, 'STORY-10');
  assert.strictEqual(projected.stories[0].status, 'done');
  assert.ok(projected.stories[0].completedAt);
});

test('EventLedger calculates lead and cycle time metrics', () => {
  const mockEvents = [
    {
      eventId: '1',
      timestamp: '2026-09-28T10:00:00.000Z', // Created
      type: EVENT_TYPES.STORY_CREATED,
      actor: 'system',
      payload: { id: 'S-1' }
    },
    {
      eventId: '2',
      timestamp: '2026-09-28T11:00:00.000Z', // Started (+1 hr)
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'system',
      payload: { storyId: 'S-1', from: 'ready', to: 'in-progress' }
    },
    {
      eventId: '3',
      timestamp: '2026-09-28T13:00:00.000Z', // Done (+2 hrs cycle, +3 hrs lead)
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'system',
      payload: { storyId: 'S-1', from: 'in-progress', to: 'done' }
    }
  ];

  const metrics = EventLedger.calculateMetrics(mockEvents);
  assert.strictEqual(metrics.completedStoriesCount, 1);
  assert.strictEqual(metrics.averageCycleTimeHours, 2);
  assert.strictEqual(metrics.averageLeadTimeHours, 3);
});
