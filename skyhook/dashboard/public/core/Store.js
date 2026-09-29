/**
 * Store - Reactive State Management & Event Bus
 * Unidirectional state flow with key-based pub/sub subscriptions.
 */

export class Store {
  /**
   * @param {Object} [initialState]
   */
  constructor(initialState = {}) {
    this.state = {
      projects: [],
      currentProjectId: null,
      projectData: null,
      latencyMs: 0,
      connected: false,
      editorPreference: typeof localStorage !== 'undefined' ? localStorage.getItem('skyhook_editor_pref') || 'vscode' : 'vscode',
      activeTab: 'kanban',
      ...initialState
    };

    this.listeners = new Map(); // key -> Set<Function>
    this.eventHandlers = new Map(); // eventName -> Set<Function>
  }

  /**
   * Get current snapshot of state
   * @returns {Object}
   */
  getState() {
    return this.state;
  }

  /**
   * Update state and notify subscribers
   * @param {Object} patch
   */
  setState(patch = {}) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...patch };

    // Notify listeners for modified keys
    for (const [key, value] of Object.entries(patch)) {
      if (this.listeners.has(key)) {
        const callbacks = this.listeners.get(key);
        for (const cb of callbacks) {
          try {
            cb(value, prevState[key], this.state);
          } catch (e) {
            console.error(`[Store] Error in listener for '${key}':`, e);
          }
        }
      }
    }

    // Notify wildcard '*' listeners
    if (this.listeners.has('*')) {
      for (const cb of this.listeners.get('*')) {
        try {
          cb(this.state, prevState);
        } catch (e) {
          console.error('[Store] Error in wildcard listener:', e);
        }
      }
    }
  }

  /**
   * Subscribe to changes on a specific state key (or '*' for all)
   * @param {string} key
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    return () => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).delete(callback);
      }
    };
  }

  /**
   * Publish an event across the event bus
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)) {
        try {
          handler(payload);
        } catch (e) {
          console.error(`[Store] Error in event handler for '${event}':`, e);
        }
      }
    }
  }

  /**
   * Listen to an event on the event bus
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);

    return () => {
      if (this.eventHandlers.has(event)) {
        this.eventHandlers.get(event).delete(handler);
      }
    };
  }
}
