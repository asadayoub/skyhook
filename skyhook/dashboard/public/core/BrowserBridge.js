/**
 * BrowserBridge - Platform Bridge for Standard Web Browsers
 * Communicates with SkyhookServer via REST fetch() and WebSocketGateway.
 */

export class BrowserBridge {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   * @param {string} [options.wsUrl]
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:31415');
    this.wsUrl = options.wsUrl || null;
    this.ws = null;
    this.eventListeners = new Map(); // eventType -> Set<Function>
    this.pingInterval = null;
    this.lastPingTime = null;
    this.latencyMs = 0;
    this.connected = false;
  }

  /**
   * Initialize bridge and establish WebSocket connection
   */
  init() {
    if (typeof window === 'undefined') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsEndpoint = this.wsUrl || `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsEndpoint);

      this.ws.onopen = () => {
        this.connected = true;
        this.emitEvent('CONNECTION_CHANGED', { connected: true });
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'PONG') {
            if (this.lastPingTime) {
              this.latencyMs = Math.round(performance.now() - this.lastPingTime);
              this.emitEvent('LATENCY_UPDATED', { latencyMs: this.latencyMs });
            }
            return;
          }
          this.emitEvent(msg.type, msg.payload);
        } catch (_) {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emitEvent('CONNECTION_CHANGED', { connected: false });
        this.stopHeartbeat();
        // Auto-reconnect after 3 seconds
        setTimeout(() => this.init(), 3000);
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.emitEvent('CONNECTION_CHANGED', { connected: false });
      };
    } catch (_) {}
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = performance.now();
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 5000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * HTTP GET request
   * @param {string} endpoint
   * @param {Object} [params]
   * @returns {Promise<any>}
   */
  async get(endpoint, params = {}) {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * HTTP POST request
   * @param {string} endpoint
   * @param {Object} [payload]
   * @returns {Promise<any>}
   */
  async post(endpoint, payload = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Call a server RPC action
   * @param {string} action - e.g. 'update-status', 'inject-harness'
   * @param {Object} payload
   * @returns {Promise<any>}
   */
  async call(action, payload = {}) {
    return this.post(`/api/action/${action}`, payload);
  }

  /**
   * Subscribe to server push events
   * @param {string} eventType
   * @param {Function} handler
   * @returns {Function} Unsubscribe function
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
          console.error(`[BrowserBridge] Error in listener for '${eventType}':`, e);
        }
      }
    }
  }

  /**
   * Open file in IDE or trigger viewer
   * @param {string} filePath
   * @param {number} [line=1]
  setStore(store) {
    this.store = store;
  }

  /**
   * Deep-link into local editor or open web code modal
   * @param {string} filePath
   * @param {number} [line=1]
   * @param {string} [preference='vscode']
   */
  async openEditor(filePath, line = 1, preference = 'vscode') {
    if (preference === 'modal') {
      this.emitEvent('OPEN_CODE_MODAL', { filePath, line });
      return;
    }

    const projectDir = this.store ? this.store.getState()?.projectData?.projectDir : null;
    let absolutePath = filePath;
    if (filePath && !filePath.startsWith('/') && !filePath.match(/^[A-Za-z]:[\\/]/) && projectDir) {
      absolutePath = `${projectDir.replace(/\/+$/, '')}/${filePath.replace(/^\/+/, '')}`;
    }

    const protocols = {
      vscode: `vscode://file/${absolutePath}:${line}`,
      cursor: `cursor://file/${absolutePath}:${line}`,
      sublime: `subl://file/${absolutePath}:${line}`
    };

    if (protocols[preference] && typeof window !== 'undefined') {
      window.location.href = protocols[preference];
    }

    // Call server open-editor fallback
    try {
      await this.call('open-editor', { filePath: absolutePath, line, preference });
    } catch (_) {}
  }

  close() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}
