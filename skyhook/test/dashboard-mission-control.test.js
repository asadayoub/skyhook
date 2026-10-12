import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { Router } from '../dashboard/public/core/Router.js';
import { Store } from '../dashboard/public/core/Store.js';
import { Navigation } from '../dashboard/public/components/Navigation.js';
import { MissionControlView } from '../dashboard/public/views/MissionControlView.js';
import { DashboardRPCHandler } from '../lib/server/DashboardRPCHandler.js';
import { writeYaml } from '../lib/utils.js';

test('Navigation: contains MISSION CONTROL as first tab and syncs active tab', () => {
  const router = {
    getCurrentPath: () => '/mission-control',
    onRouteChange: () => () => {},
    navigate: () => {}
  };

  const nav = new Navigation({ container: null, router });
  assert.strictEqual(nav.tabs[0].route, '/mission-control');
  assert.strictEqual(nav.tabs[0].label, 'MISSION CONTROL');

  // Verify DOM tab syncing
  const buttons = [
    { dataset: { route: '/mission-control' }, classList: { toggle(cls, active) { this.active = active; } } },
    { dataset: { route: '/kanban' }, classList: { toggle(cls, active) { this.active = active; } } }
  ];
  nav.container = {
    querySelectorAll: () => buttons
  };

  // 1. Root route '/' should activate /mission-control
  nav.syncActiveTab('/');
  assert.strictEqual(buttons[0].classList.active, true);
  assert.strictEqual(buttons[1].classList.active, false);

  // 2. '/kanban' should activate /kanban
  nav.syncActiveTab('/kanban');
  assert.strictEqual(buttons[0].classList.active, false);
  assert.strictEqual(buttons[1].classList.active, true);
});

test('Router: defaultRoute defaults to /mission-control', async () => {
  const listeners = {};
  const mockContainer = { innerHTML: '' };
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;

  globalThis.window = {
    location: {
      hash: '',
      set hash(val) {
        this._hash = val;
        if (listeners['hashchange']) listeners['hashchange']();
      },
      get hash() {
        return this._hash || '';
      }
    },
    addEventListener: (event, cb) => {
      listeners[event] = cb;
    }
  };

  globalThis.document = {
    getElementById: (id) => (id === 'mainContent' ? mockContainer : null)
  };

  try {
    const store = new Store();
    const router = new Router({
      container: mockContainer,
      bridge: {},
      store,
      defaultRoute: '/mission-control'
    });

    let mcMounted = false;
    class MockMissionControlView {
      async mount(container) {
        mcMounted = true;
        container.innerHTML = '<div id="mc">Mission Control Cockpit</div>';
      }
      async unmount() {}
    }

    router.register('/mission-control', MockMissionControlView);
    router.init();

    assert.strictEqual(router.defaultRoute, '/mission-control');
    assert.strictEqual(router.getCurrentPath(), '/mission-control');
    assert.strictEqual(mcMounted, true);
    assert.ok(mockContainer.innerHTML.includes('Mission Control Cockpit'));
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
  }
});

test('MissionControlView: renders all 5 core modules with live data', async () => {
  const store = new Store();
  const calls = [];
  const bridge = {
    call: async (action, payload) => {
      calls.push({ action, payload });
      return { success: true };
    }
  };

  const projectData = {
    skyhookDir: '/mock/skyhook',
    project: {
      name: 'Test Project',
      profile: 'cli-tool',
      description: 'Mission Control Unit Test Project'
    },
    capacity: {
      weeklyVelocityPoints: 18,
      averageCycleTimeHours: 6.5,
      remainingPoints: 24,
      remainingStoriesCount: 5,
      forecast: {
        projectedCompletionDateP50: '2026-11-01',
        projectedCompletionDateP90: '2026-11-15'
      },
      scopeCreep: {
        detected: true,
        netPointsGrowth: 8
      }
    },
    backlog: {
      stories: [
        {
          id: 'STORY-01',
          title: 'Active Story with Lease',
          status: 'in-progress',
          lease: {
            agentId: 'codex-agent',
            expiresAt: new Date(Date.now() + 600000).toISOString()
          }
        },
        {
          id: 'STORY-02',
          title: 'Unverified Completed Story',
          status: 'done',
          verificationStatus: 'unverified'
        }
      ],
      tasks: [
        {
          id: 'TASK-01',
          title: 'Recommended Ready Task',
          status: 'ready',
          priority: 'critical',
          description: 'Deploy mission critical subsystem',
          estimatedMinutes: 60
        }
      ]
    },
    decisions: {
      decisions: [
        {
          id: 'ADR-001',
          title: 'Native Cockpit View Architecture',
          status: 'accepted',
          category: 'frontend'
        }
      ]
    }
  };

  store.setState({ projectData });

  const view = new MissionControlView({ store, bridge, router: { navigate: () => {} } });
  const html = view.render();

  // 1. Project Delivery Pulse
  assert.ok(html.includes('MISSION CONTROL COCKPIT'));
  assert.ok(html.includes('18')); // Weekly velocity
  assert.ok(html.includes('2026-11-01')); // P50 target
  assert.ok(html.includes('6.5')); // Cycle time
  assert.ok(html.includes('Scope Creep Alert')); // Scope creep alert

  // 2. Active Agent Leases Widget
  assert.ok(html.includes('ACTIVE AGENT LEASES'));
  assert.ok(html.includes('STORY-01'));
  assert.ok(html.includes('codex-agent'));
  assert.ok(html.includes('timer-countdown'));

  // 3. Next Recommended Task Card
  assert.ok(html.includes('NEXT RECOMMENDED TASK'));
  assert.ok(html.includes('TASK-01'));
  assert.ok(html.includes('CRITICAL PRIORITY'));
  assert.ok(html.includes('Deploy mission critical subsystem'));
  assert.ok(html.includes('CLAIM TASK'));

  // 4. Unverified Deliverables Warning Table
  assert.ok(html.includes('EVIDENCE &amp; VERIFICATION STATUS') || html.includes('EVIDENCE & VERIFICATION STATUS'));
  assert.ok(html.includes('STORY-02'));
  assert.ok(html.includes('1 UNVERIFIED'));
  assert.ok(html.includes('Automated tests missing'));

  // 5. Recent Architecture Decisions
  assert.ok(html.includes('ADR-001'));
  assert.ok(html.includes('Native Cockpit View Architecture'));
});

test('MissionControlView: triggers release-lease and claim-task bridge actions', async () => {
  const store = new Store();
  const bridgeCalls = [];
  const bridge = {
    call: async (action, payload) => {
      bridgeCalls.push({ action, payload });
      return { success: true };
    },
    refreshProject: () => {}
  };

  const projectData = {
    skyhookDir: '/workspace/.skyhook',
    backlog: {
      stories: [
        {
          id: 'STORY-L1',
          title: 'Leased Story',
          status: 'in-progress',
          lease: { agentId: 'subagent-1', expiresAt: new Date(Date.now() + 600000).toISOString() }
        }
      ],
      tasks: [
        {
          id: 'TASK-R1',
          title: 'Ready Task',
          status: 'ready',
          priority: 'high'
        }
      ]
    }
  };
  store.setState({ projectData });

  // DOM Mock for postRender
  const clickListeners = new Map();
  const mockContainer = {
    innerHTML: '',
    querySelectorAll: (selector) => {
      if (selector === '.release-lease-btn') {
        return [{
          dataset: { itemId: 'STORY-L1' },
          addEventListener: (event, cb) => clickListeners.set('release-STORY-L1', cb),
          disabled: false,
          textContent: 'RELEASE'
        }];
      }
      if (selector === '.timer-countdown') return [];
      return [];
    },
    querySelector: (selector) => {
      if (selector === '#claimNextTaskBtn') {
        return {
          dataset: { taskId: 'TASK-R1' },
          addEventListener: (event, cb) => clickListeners.set('claim-TASK-R1', cb),
          disabled: false,
          textContent: 'CLAIM'
        };
      }
      return null;
    }
  };

  const view = new MissionControlView({ store, bridge, router: { navigate: () => {} } });
  view.container = mockContainer;
  await view.postRender();

  // Test clicking Release Lease
  const releaseCb = clickListeners.get('release-STORY-L1');
  assert.ok(releaseCb);
  await releaseCb();

  assert.strictEqual(bridgeCalls.length, 1);
  assert.strictEqual(bridgeCalls[0].action, 'release-lease');
  assert.strictEqual(bridgeCalls[0].payload.storyId, 'STORY-L1');

  // Test clicking Claim Task
  const claimCb = clickListeners.get('claim-TASK-R1');
  assert.ok(claimCb);
  await claimCb();

  assert.strictEqual(bridgeCalls.length, 2);
  assert.strictEqual(bridgeCalls[1].action, 'claim-task');
  assert.strictEqual(bridgeCalls[1].payload.taskId, 'TASK-R1');
});

test('DashboardRPCHandler: claimTask claims task and sets lease on backlog item', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-rpc-claim-'));
  try {
    const skyhookDir = path.join(tmpDir, '.skyhook');
    fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

    const projectYaml = { id: 'TEST-CLAIM', name: 'Claim Test' };
    writeYaml(path.join(skyhookDir, 'project.yaml'), projectYaml);

    const backlog = {
      epics: [
        { id: 'EPIC-1', title: 'Main Epic', status: 'in-progress' }
      ],
      stories: [],
      tasks: [
        {
          id: 'TASK-101',
          parentId: 'EPIC-1',
          parentType: 'epic',
          title: 'Implement Mission Control View',
          status: 'ready',
          priority: 'high'
        }
      ]
    };
    writeYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'), backlog);

    // Invoke DashboardRPCHandler.claimTask
    const result = await DashboardRPCHandler.claimTask(skyhookDir, {
      taskId: 'TASK-101',
      agentId: 'dashboard-lead',
      leaseMinutes: 45
    });

    assert.ok(result);
    assert.strictEqual(result.task.id, 'TASK-101');
    assert.strictEqual(result.task.status, 'in-progress');
    assert.strictEqual(result.lease.agentId, 'dashboard-lead');
    assert.ok(result.lease.expiresAt);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
