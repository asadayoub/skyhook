import test from 'node:test';
import assert from 'node:assert';
import { Router } from '../dashboard/public/core/Router.js';
import { BaseView } from '../dashboard/public/core/BaseView.js';
import { Store } from '../dashboard/public/core/Store.js';

test('Router - route registration, navigation, query parsing, and 404 fallback', async () => {
  // Setup lightweight DOM and window mocks for testing Router in Node
  const listeners = {};
  const mockContainer = { innerHTML: '' };

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;

  globalThis.window = {
    location: {
      hash: '',
      set hash(val) {
        this._hash = val;
        if (listeners['hashchange']) {
          listeners['hashchange']();
        }
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
      defaultRoute: '/kanban'
    });

    let kanbanMounted = false;
    let kanbanParams = null;
    let driftMounted = false;
    let driftParams = null;
    let unmounted = false;

    class MockKanbanView extends BaseView {
      async mount(container, params) {
        kanbanMounted = true;
        kanbanParams = params;
        container.innerHTML = '<div id="kanban-view">Kanban Content</div>';
      }
      async unmount() {
        unmounted = true;
        await super.unmount();
      }
    }

    class MockDriftView extends BaseView {
      async mount(container, params) {
        driftMounted = true;
        driftParams = params;
        container.innerHTML = '<div id="drift-view">Drift Content</div>';
      }
    }

    // 1. Register routes
    router.register('/kanban', MockKanbanView);
    router.register('/drift', MockDriftView);

    // 2. Initialize router
    router.init();

    // Default route should be mounted
    assert.strictEqual(kanbanMounted, true);
    assert.strictEqual(router.getCurrentPath(), '/kanban');
    assert.ok(mockContainer.innerHTML.includes('Kanban Content'));
    assert.strictEqual(store.getState().activeTab, 'kanban');

    // 3. Navigate to /drift with query parameters
    let routeEvent = null;
    router.onRouteChange((info) => {
      routeEvent = info;
    });

    router.navigate('/drift', { filter: 'critical', layer: 'domain' });
    await new Promise(r => setTimeout(r, 20));

    // Verify unmount called on previous view
    assert.strictEqual(unmounted, true);
    assert.strictEqual(driftMounted, true);
    assert.strictEqual(router.getCurrentPath(), '/drift');
    assert.strictEqual(driftParams.query.filter, 'critical');
    assert.strictEqual(driftParams.query.layer, 'domain');
    assert.strictEqual(store.getState().activeTab, 'drift');
    assert.strictEqual(routeEvent.path, '/drift');

    // 4. Test 404 fallback to defaultRoute
    router.navigate('/nonexistent-page');
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(router.getCurrentPath(), '/kanban');
    assert.ok(mockContainer.innerHTML.includes('Kanban Content'));
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
  }
});

test('BaseView - lifecycle execution and automated resource cleanup (timers & subscriptions)', async () => {
  const container = { innerHTML: '' };
  const store = new Store();

  let postRenderCalled = false;
  let customCleanupCalled = false;
  let timerTicked = 0;

  class TestView extends BaseView {
    render() {
      return '<div class="test-view">Test View Content</div>';
    }

    async postRender() {
      postRenderCalled = true;

      // Register interval timer
      const timer = setInterval(() => {
        timerTicked++;
      }, 50);
      this.registerTimer(timer);

      // Register store subscription
      const unsub = store.subscribe('count', () => {});
      this.registerSubscription(unsub);
      this.registerSubscription(() => {
        customCleanupCalled = true;
      });
    }
  }

  const view = new TestView({ store });
  await view.mount(container, {});

  assert.strictEqual(postRenderCalled, true);
  assert.ok(container.innerHTML.includes('Test View Content'));
  assert.strictEqual(view.timers.length, 1);
  assert.strictEqual(view.subscriptions.length, 2);

  // Unmount view and verify timers & subscriptions are swept
  await view.unmount();

  assert.strictEqual(view.timers.length, 0);
  assert.strictEqual(view.subscriptions.length, 0);
  assert.strictEqual(customCleanupCalled, true);
  assert.strictEqual(container.innerHTML, '');
});
