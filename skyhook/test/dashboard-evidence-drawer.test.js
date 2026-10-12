import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { Store } from '../dashboard/public/core/Store.js';
import { TaskModal } from '../dashboard/public/components/TaskModal.js';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';
import { EventLedger, EVENT_TYPES } from '../lib/backlog/EventLedger.js';
import { writeYaml } from '../lib/utils.js';

function setupMockDom() {
  const prevDoc = globalThis.document;
  const prevEvent = globalThis.Event;
  const prevRaf = globalThis.requestAnimationFrame;

  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  globalThis.Event = class Event {
    constructor(type, opts = {}) {
      this.type = type;
      this.cancelable = opts.cancelable;
    }
    preventDefault() {}
  };

  const bodyChildren = [];
  const createdElements = [];

  globalThis.document = {
    body: {
      children: bodyChildren,
      appendChild(child) {
        bodyChildren.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const idx = bodyChildren.indexOf(child);
        if (idx >= 0) bodyChildren.splice(idx, 1);
        child.parentNode = null;
        return child;
      }
    },
    createElement(tag) {
      let html = '';
      const inputValues = {};
      const listeners = {};

      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        style: {},
        parentNode: null,
        children: [],
        get innerHTML() {
          return html;
        },
        set innerHTML(val) {
          html = val;
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          return child;
        },
        removeChild(child) {
          const idx = this.children.indexOf(child);
          if (idx >= 0) this.children.splice(idx, 1);
          child.parentNode = null;
          return child;
        },
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this);
        },
        addEventListener(event, cb) {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
        },
        dispatchEvent(event) {
          const list = listeners[event.type] || [];
          for (const cb of list) cb(event);
        },
        querySelector(selector) {
          if (selector.startsWith('#')) {
            const id = selector.slice(1);
            if (!html.includes(`id="${id}"`)) return null;

            // Return input element proxy
            return {
              id,
              get value() {
                if (inputValues[id] !== undefined) return inputValues[id];
                const m = html.match(new RegExp(`id=["']${id}["'][^>]*?value=["'](.*?)["']`));
                return m ? m[1] : '';
              },
              set value(val) {
                inputValues[id] = String(val);
              },
              addEventListener(event, cb) {
                listeners[`${id}-${event}`] = listeners[`${id}-${event}`] || [];
                listeners[`${id}-${event}`].push(cb);
              },
              dispatchEvent(event) {
                const cbs = listeners[`${id}-${event.type}`] || [];
                for (const cb of cbs) cb(event);
              },
              querySelectorAll(sel) {
                return [];
              },
              querySelector(sel) {
                return null;
              }
            };
          }
          return null;
        },
        querySelectorAll(selector) {
          return [];
        }
      };

      createdElements.push(el);
      return el;
    }
  };

  return () => {
    globalThis.document = prevDoc;
    globalThis.Event = prevEvent;
    globalThis.requestAnimationFrame = prevRaf;
  };
}

test('TaskModal: renders VERIFIED badge and evidence summary when task has valid proof', () => {
  const teardown = setupMockDom();
  try {
    const store = new Store();
    store.setState({
      projectData: {
        backlog: { stories: [], epics: [] }
      }
    });

    const modal = new TaskModal({ store, bridge: {} });

    const verifiedTask = {
      id: 'TASK-101',
      title: 'Authentication Middleware',
      status: 'done',
      verificationStatus: 'verified',
      evidence: {
        commitHash: '7c1b554',
        automatedChecks: {
          command: 'npm test test/auth.test.js',
          exitCode: 0,
          passedCount: 8
        },
        manualReview: {
          notes: 'Passes all JWT invariants.'
        }
      }
    };

    modal.open(verifiedTask);
    const html = modal.modalEl.innerHTML;

    // Header verification badge
    assert.ok(html.includes('🛡️ VERIFIED'));

    // Evidence Drawer contents
    assert.ok(html.includes('EVIDENCE &amp; VERIFICATION PROOF') || html.includes('EVIDENCE & VERIFICATION PROOF'));
    assert.ok(html.includes('PROOF ATTACHED'));
    assert.ok(html.includes('7c1b554'));
    assert.ok(html.includes('npm test test/auth.test.js'));
    assert.ok(html.includes('✓ PASS (Exit 0)'));
    assert.ok(html.includes('8 tests'));
    assert.ok(html.includes('Passes all JWT invariants.'));

    modal.close();
  } finally {
    teardown();
  }
});

test('TaskModal: renders UNVERIFIED badge and warning notice when completed task lacks evidence', () => {
  const teardown = setupMockDom();
  try {
    const store = new Store();
    store.setState({
      projectData: {
        backlog: { stories: [], epics: [] }
      }
    });

    const modal = new TaskModal({ store, bridge: {} });

    const unverifiedTask = {
      id: 'TASK-102',
      title: 'Unverified Feature',
      status: 'done',
      verificationStatus: 'unverified'
    };

    modal.open(unverifiedTask);
    const html = modal.modalEl.innerHTML;

    // Header verification badge
    assert.ok(html.includes('⚠️ UNVERIFIED'));

    // Warning notice
    assert.ok(html.includes('Definition of Done:'));
    assert.ok(html.includes('Completed work requires automated test proof'));

    // Drawer status
    assert.ok(html.includes('NO PROOF ATTACHED'));

    modal.close();
  } finally {
    teardown();
  }
});

test('TaskModal: extracts evidence inputs and sends structured payload on submit', async () => {
  const teardown = setupMockDom();
  try {
    const store = new Store();
    store.setState({
      projectData: {
        skyhookDir: '/workspace/.skyhook',
        backlog: {
          stories: [{ id: 'STORY-1', title: 'Parent Story' }],
          epics: []
        }
      }
    });

    let sentPayload = null;
    const bridge = {
      fetchApi: async (endpoint, options) => {
        sentPayload = JSON.parse(options.body);
        return { success: true };
      }
    };

    const modal = new TaskModal({ store, bridge });
    const task = {
      id: 'TASK-201',
      title: 'Form Evidence Test',
      status: 'in-progress'
    };

    modal.open(task);

    // Fill in form fields
    modal.modalEl.querySelector('#taskTitle').value = 'Form Evidence Test Updated';
    modal.modalEl.querySelector('#taskStatus').value = 'done';
    modal.modalEl.querySelector('#evidenceCommitHash').value = 'abcdef12';
    modal.modalEl.querySelector('#evidenceTestCommand').value = 'node --test skyhook/test/auth.test.js';
    modal.modalEl.querySelector('#evidenceExitCode').value = '0';
    modal.modalEl.querySelector('#evidencePassedCount').value = '12';
    modal.modalEl.querySelector('#evidenceNotes').value = 'Automated suite ran clean.';

    // Trigger form submit
    const form = modal.modalEl.querySelector('#taskForm');
    const submitEvent = new globalThis.Event('submit', { cancelable: true });
    form.dispatchEvent(submitEvent);

    // Yield microtask queue
    await new Promise(r => setTimeout(r, 20));

    assert.ok(sentPayload);
    assert.strictEqual(sentPayload.taskId, 'TASK-201');
    assert.strictEqual(sentPayload.updates.status, 'done');
    assert.strictEqual(sentPayload.updates.verificationStatus, 'verified');

    const ev = sentPayload.updates.evidence;
    assert.ok(ev);
    assert.strictEqual(ev.commitHash, 'abcdef12');
    assert.strictEqual(ev.automatedChecks.command, 'node --test skyhook/test/auth.test.js');
    assert.strictEqual(ev.automatedChecks.exitCode, 0);
    assert.strictEqual(ev.automatedChecks.passedCount, 12);
    assert.strictEqual(ev.manualReview.notes, 'Automated suite ran clean.');

    modal.close();
  } finally {
    teardown();
  }
});

test('DashboardRPCHandler: updateTask persists evidence, updates verificationStatus, and emits EVIDENCE_ATTACHED', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-rpc-evidence-'));
  try {
    const skyhookDir = path.join(tmpDir, '.skyhook');
    fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

    const backlog = {
      epics: [],
      stories: [{ id: 'STORY-01', title: 'Parent Story', status: 'in-progress' }],
      tasks: [
        {
          id: 'TASK-301',
          parentId: 'STORY-01',
          parentType: 'story',
          title: 'Evidence Persistence Test',
          status: 'in-progress'
        }
      ]
    };
    writeYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'), backlog);

    // Call DashboardRPCHandler.updateTask
    const evidencePayload = {
      commitHash: 'deadbeef',
      automatedChecks: {
        command: 'npm test',
        exitCode: 0,
        passedCount: 42
      },
      manualReview: {
        notes: 'Signed off by reviewer'
      }
    };

    const res = await DashboardRPCHandler.updateTask(skyhookDir, 'TASK-301', {
      status: 'done',
      evidence: evidencePayload
    });

    assert.ok(res.success);
    assert.strictEqual(res.task.status, 'done');
    assert.strictEqual(res.task.verificationStatus, 'verified');
    assert.deepStrictEqual(res.task.evidence, evidencePayload);

    // Verify EventLedger has EVIDENCE_ATTACHED event
    const events = EventLedger.readEvents(skyhookDir, 10);
    const evidenceEvent = events.find(e => e.type === EVENT_TYPES.EVIDENCE_ATTACHED);
    assert.ok(evidenceEvent, 'EVIDENCE_ATTACHED event should be recorded in EventLedger');
    assert.strictEqual(evidenceEvent.payload.taskId, 'TASK-301');
    assert.strictEqual(evidenceEvent.payload.commitHash, 'deadbeef');
    assert.strictEqual(evidenceEvent.payload.testExitCode, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
