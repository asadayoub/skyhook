/**
 * BaseView - Abstract Base Class for Modular Dashboard Views
 * Provides standardized lifecycle management (mount, postRender, update, unmount)
 * with automated timer and listener sweep to prevent memory leaks.
 */

export class BaseView {
  /**
   * @param {Object} context
   * @param {import('./Router.js').Router} context.router
   * @param {import('./Bridge.js').Bridge} context.bridge
   * @param {import('./Store.js').Store} context.store
   */
  constructor(context = {}) {
    this.router = context.router;
    this.bridge = context.bridge;
    this.store = context.store;

    this.container = null;
    this.params = {};
    this.timers = [];
    this.subscriptions = [];
  }

  /**
   * Mount view into the provided DOM container
   * @param {HTMLElement} container
   * @param {Object} [params]
   */
  async mount(container, params = {}) {
    this.container = container;
    this.params = params;
    this.container.innerHTML = this.render();
    await this.postRender();
  }

  /**
   * Return the HTML structure for this view
   * @returns {string}
   */
  render() {
    return '<div></div>';
  }

  /**
   * Post-render hook to bind DOM events, initiate child rendering, or start timers
   */
  async postRender() {}

  /**
   * Reactive update hook when project data or store updates
   * @param {Object} [data]
   */
  async update(data) {}

  /**
   * Unmount hook called before navigating away
   * Automatically sweeps active timers and event subscriptions
   */
  async unmount() {
    // 1. Clear all active timers
    for (const timer of this.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this.timers = [];

    // 2. Unsubscribe all active store / event bus listeners
    for (const unsub of this.subscriptions) {
      if (typeof unsub === 'function') {
        try {
          unsub();
        } catch (_) {}
      }
    }
    this.subscriptions = [];

    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  /**
   * Register an interval or timeout timer for automatic cleanup on unmount
   * @param {number|NodeJS.Timeout} timerId
   * @returns {number|NodeJS.Timeout}
   */
  registerTimer(timerId) {
    this.timers.push(timerId);
    return timerId;
  }

  /**
   * Register a subscription unbind function for automatic cleanup on unmount
   * @param {Function} unsubFn
   */
  registerSubscription(unsubFn) {
    this.subscriptions.push(unsubFn);
  }

  /**
   * Escape HTML utility for secure rendering
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format relative timestamp
   * @param {string|Date} iso
   * @returns {string}
   */
  formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
