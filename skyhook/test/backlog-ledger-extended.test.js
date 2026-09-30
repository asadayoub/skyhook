import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';
import { BacklogLock } from '../lib/backlog/BacklogLock.js';

test('EventLedger - Append, Replay, Projection & Corrupted Line Recovery', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ledger-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Append valid events
    const evt1 = EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.EPIC_CREATED,
      actor: 'system',
      payload: { id: 'EPIC-001', title: 'Payment Processing', childStories: ['STORY-001'] }
    });
    assert.ok(evt1.eventId);

    const evt2 = EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.STORY_CREATED,
      actor: 'agent-1',
      payload: { id: 'STORY-001', epicId: 'EPIC-001', title: 'Stripe Gateway' }
    });
    assert.ok(evt2.eventId);

    // 2. Corrupt ledger by appending garbage lines
    const ledgerPath = EventLedger.getLedgerPath(skyhookDir);
    fs.appendFileSync(ledgerPath, 'THIS_IS_CORRUPTED_LINE_NOT_JSON\n{"incomplete": "json\n\n');

    // 3. Append another valid event
    const evt3 = EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.STATE_TRANSITIONED,
      actor: 'agent-1',
      payload: { storyId: 'STORY-001', from: 'backlog', to: 'in-progress' }
    });
    assert.ok(evt3.eventId);

    // 4. Verify readEvents skips corrupt lines gracefully
    const read = EventLedger.readEvents(skyhookDir, 0);
    assert.strictEqual(read.length, 3, 'Should read exactly 3 valid events, skipping corrupted lines');
    assert.strictEqual(read[0].type, EVENT_TYPES.EPIC_CREATED);
    assert.strictEqual(read[1].type, EVENT_TYPES.STORY_CREATED);
    assert.strictEqual(read[2].type, EVENT_TYPES.STATE_TRANSITIONED);

    // 5. Test Event Projection
    const projected = EventLedger.projectBacklog(read);
    assert.strictEqual(projected.epics.length, 1);
    assert.strictEqual(projected.epics[0].id, 'EPIC-001');
    assert.strictEqual(projected.stories.length, 1);
    assert.strictEqual(projected.stories[0].id, 'STORY-001');
    assert.strictEqual(projected.stories[0].status, 'in-progress');

    // 6. Test Metrics Calculation
    const doneEvt = {
      eventId: 'DONE-1',
      timestamp: new Date(Date.now() + 3600000).toISOString(),
      type: EVENT_TYPES.STATE_TRANSITIONED,
      payload: { storyId: 'STORY-001', from: 'in-progress', to: 'done' }
    };
    const metrics = EventLedger.calculateMetrics([...read, doneEvt]);
    assert.strictEqual(metrics.completedStoriesCount, 1);
    assert.ok(metrics.averageCycleTimeHours > 0);

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('BacklogLock - Concurrency Contention, Stale Lock Break & Error Release', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-lock-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const lockPath = path.join(skyhookDir, 'backlog', '.lock');

  try {
    // 1. Basic acquire & release
    await BacklogLock.withLock(skyhookDir, async () => {
      assert.ok(fs.existsSync(lockPath), 'Lock file should exist while lock is held');
    });
    assert.strictEqual(fs.existsSync(lockPath), false, 'Lock file should be cleaned up after withLock');

    // 2. Lock release on callback error
    await assert.rejects(async () => {
      await BacklogLock.withLock(skyhookDir, async () => {
        throw new Error('Simulation of catastrophic task failure');
      });
    }, /catastrophic/);
    assert.strictEqual(fs.existsSync(lockPath), false, 'Lock must be released even when callback throws');

    // 3. Stale Lock Detection & Automatic Recovery
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    // Write expired lock file
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 9999999,
      createdAt: Date.now() - 30000,
      expiresAt: Date.now() - 1000 // Expired 1 second ago
    }), 'utf-8');

    let staleRecovered = false;
    await BacklogLock.withLock(skyhookDir, async () => {
      staleRecovered = true;
    }, { timeoutMs: 2000 });
    assert.strictEqual(staleRecovered, true, 'Should automatically break stale lock and acquire');
    assert.strictEqual(fs.existsSync(lockPath), false);

    // 4. High-Concurrency Stress Test (10 concurrent workers incrementing counter)
    let sharedCounter = 0;
    const workers = Array.from({ length: 10 }, async (_, index) => {
      await BacklogLock.withLock(skyhookDir, async () => {
        const current = sharedCounter;
        // Introduce small async delay to test race condition resilience
        await new Promise(r => setTimeout(r, 10));
        sharedCounter = current + 1;
      }, { timeoutMs: 15000 });
    });

    await Promise.all(workers);
    assert.strictEqual(sharedCounter, 10, 'All 10 concurrent increments must succeed without race conditions');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
