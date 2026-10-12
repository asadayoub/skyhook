import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';
import { SkyhookContext } from '../lib/context.js';

test('EVENT_TYPES exports EVIDENCE_ATTACHED and TASK_VERIFIED', () => {
  assert.strictEqual(EVENT_TYPES.EVIDENCE_ATTACHED, 'EVIDENCE_ATTACHED');
  assert.strictEqual(EVENT_TYPES.TASK_VERIFIED, 'TASK_VERIFIED');
});

test('EventLedger.appendEvent and readEvents handle evidence events cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ev-ledger-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    const evidence = {
      commitHash: 'abc1234',
      changedFiles: ['lib/auth.js'],
      automatedChecks: {
        testCommand: 'npm test',
        exitCode: 0,
        passedCount: 8,
        failedCount: 0
      }
    };

    // 1. Append EVIDENCE_ATTACHED
    const evt1 = EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.EVIDENCE_ATTACHED,
      actor: 'test-agent',
      payload: {
        taskId: 'TASK-001',
        evidence
      }
    });
    assert.ok(evt1.eventId);
    assert.strictEqual(evt1.type, 'EVIDENCE_ATTACHED');

    // 2. Append TASK_VERIFIED
    const evt2 = EventLedger.appendEvent(skyhookDir, {
      type: EVENT_TYPES.TASK_VERIFIED,
      actor: 'test-agent',
      payload: {
        taskId: 'TASK-001',
        evidence
      }
    });
    assert.ok(evt2.eventId);
    assert.strictEqual(evt2.type, 'TASK_VERIFIED');

    // 3. Read back events
    const events = EventLedger.readEvents(skyhookDir);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, 'EVIDENCE_ATTACHED');
    assert.deepStrictEqual(events[0].payload.evidence, evidence);
    assert.strictEqual(events[1].type, 'TASK_VERIFIED');
    assert.deepStrictEqual(events[1].payload.evidence, evidence);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EventLedger.projectBacklog projects EVIDENCE_ATTACHED and TASK_VERIFIED correctly', () => {
  const events = [
    {
      eventId: 'evt-1',
      timestamp: '2026-10-12T10:00:00.000Z',
      type: EVENT_TYPES.EPIC_CREATED,
      payload: { id: 'EPIC-1', title: 'Core' }
    },
    {
      eventId: 'evt-2',
      timestamp: '2026-10-12T10:01:00.000Z',
      type: EVENT_TYPES.STORY_CREATED,
      payload: { id: 'STORY-1', epicId: 'EPIC-1', title: 'Authentication' }
    },
    {
      eventId: 'evt-3',
      timestamp: '2026-10-12T10:02:00.000Z',
      type: EVENT_TYPES.TASK_CREATED,
      payload: { id: 'TASK-1', parentId: 'STORY-1', parentType: 'story', title: 'Token Service' }
    },
    {
      eventId: 'evt-4',
      timestamp: '2026-10-12T10:05:00.000Z',
      type: EVENT_TYPES.TASK_STATE_TRANSITIONED,
      payload: { taskId: 'TASK-1', from: 'backlog', to: 'in-progress' }
    },
    {
      eventId: 'evt-5',
      timestamp: '2026-10-12T10:15:00.000Z',
      type: EVENT_TYPES.EVIDENCE_ATTACHED,
      payload: {
        taskId: 'TASK-1',
        evidence: {
          commitHash: 'c0ffee1',
          automatedChecks: { exitCode: 0, passedCount: 10 }
        }
      }
    },
    {
      eventId: 'evt-6',
      timestamp: '2026-10-12T10:20:00.000Z',
      type: EVENT_TYPES.TASK_VERIFIED,
      payload: {
        taskId: 'TASK-1'
      }
    }
  ];

  const projected = EventLedger.projectBacklog(events);
  assert.strictEqual(projected.tasks.length, 1);
  const task = projected.tasks[0];
  assert.strictEqual(task.id, 'TASK-1');
  assert.strictEqual(task.status, 'verified');
  assert.strictEqual(task.verificationStatus, 'verified');
  assert.strictEqual(task.verifiedAt, '2026-10-12T10:20:00.000Z');
  assert.strictEqual(task.evidence.commitHash, 'c0ffee1');
  assert.strictEqual(task.evidence.automatedChecks.exitCode, 0);
});

test('SkyhookContext records EVIDENCE_ATTACHED and TASK_VERIFIED in events.jsonl', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ctx-ev-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  const ctx = new SkyhookContext(tmpDir);
  const initialBacklog = {
    schemaVersion: '1.0.0',
    epics: [{ id: 'EPIC-1', title: 'Infra', status: 'in-progress' }],
    stories: [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'Security', status: 'ready', acceptanceCriteria: ['Secure'] }],
    tasks: [{ id: 'TASK-1', parentId: 'STORY-1', parentType: 'story', title: 'Crypto', status: 'ready' }]
  };
  ctx.writeBacklog(initialBacklog);

  try {
    // 1. Move task to in-progress
    ctx.updateStoryStatus('TASK-1', 'in-progress', { agentId: 'agent-1' });

    // 2. Move task to implemented
    ctx.updateStoryStatus('TASK-1', 'implemented', { agentId: 'agent-1' });

    // 3. Move task to verified with evidence
    const evidence = {
      commitHash: 'fedcba98',
      automatedChecks: { exitCode: 0, testCommand: 'npm test' }
    };
    ctx.updateStoryStatus('TASK-1', 'verified', { agentId: 'agent-1', evidence });

    // Verify events written to events.jsonl
    const events = EventLedger.readEvents(skyhookDir);
    const eventTypes = events.map(e => e.type);

    assert.ok(eventTypes.includes('TASK_STATE_TRANSITIONED'));
    assert.ok(eventTypes.includes('EVIDENCE_ATTACHED'));
    assert.ok(eventTypes.includes('TASK_VERIFIED'));

    const evidenceEvt = events.find(e => e.type === 'EVIDENCE_ATTACHED');
    assert.strictEqual(evidenceEvt.payload.workId, 'TASK-1');
    assert.strictEqual(evidenceEvt.payload.evidence.commitHash, 'fedcba98');

    // 3. Test explicit attachEvidence
    ctx.attachEvidence('TASK-1', {
      ...evidence,
      manualVerification: { verifiedBy: 'tester', notes: 'all good' }
    }, { agentId: 'agent-tester' });

    const updatedEvents = EventLedger.readEvents(skyhookDir);
    const lastEvent = updatedEvents[updatedEvents.length - 1];
    assert.strictEqual(lastEvent.type, 'EVIDENCE_ATTACHED');
    assert.strictEqual(lastEvent.payload.evidence.manualVerification.notes, 'all good');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
