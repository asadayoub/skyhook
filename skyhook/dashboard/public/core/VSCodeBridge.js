/**
 * VSCodeBridge - Platform Bridge for VS Code / Cursor Extension Webviews
 * Communicates with the Extension Host via acquireVsCodeApi().postMessage().
 */

export class VSCodeBridge {
  constructor(options = {}) {
    this.vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
    this.pendingRequests = new Map(); // id -> { resolve, reject, timeout }
    this.eventListeners = new Map(); // eventType -> Set<Function>
    this.nextRequestId = 1;
    this.connected = true;
  }

  /**
   * Initialize bridge and attach window message listener
   */
  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;

      // 1. Response to an RPC request
      if (msg.type === 'RPC_RESPONSE' && msg.id) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error));
          else pending.resolve(msg.result);
        }
        return;
      }

      // 2. Broadcast push event from Extension Host
      if (msg.type) {
        this.emitEvent(msg.type, msg.payload || msg.data);
      }
    });

    this.emitEvent('CONNECTION_CHANGED', { connected: true });
  }

  /**
   * Call extension host via message passing
   * @param {string} action
   * @param {Object} payload
   * @returns {Promise<any>}
   */
  async call(action, payload = {}) {
    if (!this.vscode) {
      throw new Error('VS Code Webview API (acquireVsCodeApi) is not available');
    }

    const id = `req-${this.nextRequestId++}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC timeout for action '${action}'`));
        }
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.vscode.postMessage({
        type: 'RPC_REQUEST',
        id,
        action,
        payload
      });
    });
  }

  /**
   * Proxy GET request through extension host
   */
  async get(endpoint, params = {}) {
    return this.call(`GET:${endpoint}`, params);
  }

  /**
   * Proxy POST request through extension host
   */
  async post(endpoint, payload = {}) {
    return this.call(`POST:${endpoint}`, payload);
  }

  /**
   * Subscribe to extension events
   */
  on(eventType, handler) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType).add(handler);

    return () => {
      if (this.eventListeners.has(eventType)) {
        this.eventListeners.get(eventType).delete(handler);
      }
    };
  }

  emitEvent(eventType, payload) {
    if (this.eventListeners.has(eventType)) {
      for (const h of this.eventListeners.get(eventType)) {
        try {
          h(payload);
        } catch (e) {
          console.error(`[VSCodeBridge] Error in listener for '${eventType}':`, e);
        }
      }
    }
  }

  /**
   * Open file directly in the active VS Code / Cursor editor tab
   */
  async openEditor(filePath, line = 1) {
    if (this.vscode) {
      this.vscode.postMessage({
        type: 'OPEN_DOCUMENT',
        filePath,
        line
      });
    }
  }

  close() {
    this.pendingRequests.clear();
    this.eventListeners.clear();
  }
}
