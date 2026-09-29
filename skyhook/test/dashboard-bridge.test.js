import test from 'node:test';
import assert from 'node:assert';
import { Bridge } from '../dashboard/public/core/Bridge.js';
import { BrowserBridge } from '../dashboard/public/core/BrowserBridge.js';
import { VSCodeBridge } from '../dashboard/public/core/VSCodeBridge.js';

test('Bridge - Environment Detection Factory', () => {
  const prevWindow = globalThis.window;
  const prevAcquire = globalThis.acquireVsCodeApi;

  try {
    // 1. Browser runtime detection
    globalThis.window = { location: { origin: 'http://127.0.0.1:31415' } };
    delete globalThis.acquireVsCodeApi;

    const browserBridge = Bridge.create();
    assert.ok(browserBridge instanceof BrowserBridge);
    assert.strictEqual(browserBridge.baseUrl, 'http://127.0.0.1:31415');

    // 2. VS Code / Cursor Webview runtime detection via window.__VSCODE_WEBVIEW__
    globalThis.window.__VSCODE_WEBVIEW__ = true;
    const vscodeBridge1 = Bridge.create();
    assert.ok(vscodeBridge1 instanceof VSCodeBridge);

    // 3. Detection via acquireVsCodeApi global function
    delete globalThis.window.__VSCODE_WEBVIEW__;
    globalThis.acquireVsCodeApi = () => ({
      postMessage: () => {},
      setState: () => {},
      getState: () => ({})
    });

    const vscodeBridge2 = Bridge.create();
    assert.ok(vscodeBridge2 instanceof VSCodeBridge);
  } finally {
    globalThis.window = prevWindow;
    globalThis.acquireVsCodeApi = prevAcquire;
  }
});

test('BrowserBridge - REST API and Event Bus', async () => {
  const prevFetch = globalThis.fetch;

  try {
    const requests = [];
    globalThis.fetch = async (url, opts = {}) => {
      requests.push({ url: url.toString(), opts });
      if (url.toString().includes('/api/projects')) {
        return {
          ok: true,
          json: async () => ({ projects: [{ id: 'test-proj', name: 'Test' }] })
        };
      }
      if (url.toString().includes('/api/action/update-status')) {
        return {
          ok: true,
          json: async () => ({ success: true, storyId: 'STORY-1', newStatus: 'in-progress' })
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const bridge = new BrowserBridge({ baseUrl: 'http://localhost:31415' });

    // 1. Test GET request with query params
    const getRes = await bridge.get('/api/projects', { filter: 'active' });
    assert.strictEqual(getRes.projects.length, 1);
    assert.ok(requests[0].url.includes('/api/projects?filter=active'));

    // 2. Test POST action RPC
    const postRes = await bridge.post('/api/action/update-status', {
      storyId: 'STORY-1',
      status: 'in-progress'
    });
    assert.strictEqual(postRes.success, true);
    assert.strictEqual(postRes.storyId, 'STORY-1');
    assert.strictEqual(requests[1].opts.method, 'POST');
    assert.strictEqual(JSON.parse(requests[1].opts.body).status, 'in-progress');

    // 3. Test Event Bus pub/sub
    let receivedEvent = null;
    const unsub = bridge.on('STORY_TRANSITIONED', (payload) => {
      receivedEvent = payload;
    });

    bridge.emitEvent('STORY_TRANSITIONED', { storyId: 'STORY-1', status: 'done' });
    assert.strictEqual(receivedEvent.storyId, 'STORY-1');
    assert.strictEqual(receivedEvent.status, 'done');

    // Test unsubscription
    unsub();
    bridge.emitEvent('STORY_TRANSITIONED', { storyId: 'STORY-2' });
    assert.strictEqual(receivedEvent.storyId, 'STORY-1'); // Unchanged
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('VSCodeBridge - Message Passing, RPC Resolution, and Event Dispatch', async () => {
  const windowListeners = {};
  const prevWindow = globalThis.window;
  const postedMessages = [];

  const mockVsCodeApi = {
    postMessage: (msg) => {
      postedMessages.push(msg);
      // Simulate asynchronous Extension Host response
      if (msg.type === 'RPC_REQUEST') {
        setTimeout(() => {
          if (windowListeners['message']) {
            windowListeners['message']({
              data: {
                type: 'RPC_RESPONSE',
                id: msg.id,
                result: { success: true, action: msg.action, echo: msg.payload }
              }
            });
          }
        }, 10);
      }
    }
  };

  globalThis.window = {
    addEventListener: (event, cb) => {
      windowListeners[event] = cb;
    }
  };

  try {
    const bridge = new VSCodeBridge();
    bridge.vscode = mockVsCodeApi;
    bridge.init();

    // 1. Call RPC action
    const rpcPromise = bridge.call('GET_PROJECT_DATA', { id: 'proj-1' });
    const response = await rpcPromise;

    assert.strictEqual(response.success, true);
    assert.strictEqual(response.action, 'GET_PROJECT_DATA');
    assert.strictEqual(response.echo.id, 'proj-1');
    assert.strictEqual(postedMessages.length, 1);
    assert.strictEqual(postedMessages[0].type, 'RPC_REQUEST');

    // 2. Test Extension Host broadcast push event
    let broadcastPayload = null;
    bridge.on('TECH_STACK_UPDATED', (data) => {
      broadcastPayload = data;
    });

    windowListeners['message']({
      data: {
        type: 'TECH_STACK_UPDATED',
        payload: { file: 'tech-stack.yaml', languages: ['javascript', 'python'] }
      }
    });

    assert.ok(broadcastPayload);
    assert.strictEqual(broadcastPayload.file, 'tech-stack.yaml');

    // 3. Test openEditor dispatch in VS Code mode
    await bridge.openEditor('skyhook/lib/server.js', 42);
    const lastMsg = postedMessages[postedMessages.length - 1];
    assert.strictEqual(lastMsg.type, 'OPEN_DOCUMENT');
    assert.strictEqual(lastMsg.filePath, 'skyhook/lib/server.js');
    assert.strictEqual(lastMsg.line, 42);
  } finally {
    globalThis.window = prevWindow;
  }
});
