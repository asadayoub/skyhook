/**
 * Router - Client-Side Hash & History Router
 * Provides seamless multi-page navigation, deep linking, parameter extraction,
 * and view lifecycle orchestration (unmount -> mount).
 */

export class Router {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container]
   * @param {import('./Bridge.js').Bridge} options.bridge
   * @param {import('./Store.js').Store} options.store
   * @param {string} [options.defaultRoute='/kanban']
   */
  constructor(options = {}) {
    this.container = options.container || null;
    this.bridge = options.bridge;
    this.store = options.store;
    this.defaultRoute = options.defaultRoute || '/kanban';

    this.routes = new Map(); // path -> ViewClass
    this.currentView = null;
    this.currentPath = null;
    this.listeners = new Set();
  }

  /**
   * Register a route mapping
   * @param {string} path - e.g. '/kanban', '/drift'
   * @param {typeof import('./BaseView.js').BaseView} ViewClass
   */
  register(path, ViewClass) {
    this.routes.set(path, ViewClass);
  }

  /**
   * Start listening for hash change events
   */
  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('hashchange', () => {
      this.handleRoute();
    });

    // Handle initial route on page load
    this.handleRoute();
  }

  /**
   * Navigate to a target route
   * @param {string} path - e.g. '/drift' or '#/drift'
   * @param {Object} [query]
   */
  navigate(path, query = null) {
    const cleanPath = path.startsWith('#') ? path.slice(1) : path;
    let url = `#${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;

    if (query && Object.keys(query).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) searchParams.set(k, v);
      }
      url += `?${searchParams.toString()}`;
    }

    if (typeof window !== 'undefined') {
      window.location.hash = url;
    }
  }

  /**
   * Resolve current hash and execute lifecycle transition
   */
  async handleRoute() {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash.slice(1) || this.defaultRoute;
    const [pathPart, queryString] = hash.split('?');
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;

    const query = {};
    if (queryString) {
      const sp = new URLSearchParams(queryString);
      for (const [k, v] of sp.entries()) {
        query[k] = v;
      }
    }

    // Resolve ViewClass or fallback
    let ViewClass = this.routes.get(path);
    let resolvedPath = path;
    if (!ViewClass) {
      ViewClass = this.routes.get(this.defaultRoute);
      resolvedPath = this.defaultRoute;
    }
    if (!ViewClass) return;

    const targetContainer = this.container || document.getElementById('mainContent');
    if (!targetContainer) return;

    // 1. Unmount current view cleanly
    if (this.currentView && typeof this.currentView.unmount === 'function') {
      try {
        await this.currentView.unmount();
      } catch (err) {
        console.error('[Router] Error during unmount:', err);
      }
      this.currentView = null;
    }

    // 2. Instantiate and mount new view
    try {
      this.currentPath = resolvedPath;
      this.currentView = new ViewClass({
        router: this,
        bridge: this.bridge,
        store: this.store
      });

      await this.currentView.mount(targetContainer, { query, path });

      // Update store's active tab
      const tabName = path.replace(/^\//, '');
      this.store.setState({ activeTab: tabName });

      // Notify route listeners
      this.notifyListeners({ path, query, tabName });
    } catch (err) {
      console.error(`[Router] Failed to mount view for '${path}':`, err);
      targetContainer.innerHTML = `
        <div class="glass-panel" style="padding: 40px; text-align: center; color: var(--neon-rose); font-family: var(--font-mono);">
          Failed to load page: ${err.message}
        </div>
      `;
    }
  }

  /**
   * Subscribe to route changes
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onRouteChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(routeInfo) {
    for (const listener of this.listeners) {
      try {
        listener(routeInfo);
      } catch (_) {}
    }
  }

  /**
   * Get currently mounted view
   */
  getCurrentView() {
    return this.currentView;
  }

  /**
   * Get current route path
   */
  getCurrentPath() {
    return this.currentPath || this.defaultRoute;
  }
}
