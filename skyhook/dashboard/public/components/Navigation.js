/**
 * Navigation Component - Multi-Page Tab Bar
 * Synchronizes with Router to highlight active route and handle navigation.
 */

export class Navigation {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../core/Router.js').Router} options.router
   */
  constructor(options = {}) {
    this.container = options.container;
    this.router = options.router;
    this.tabs = [
      { route: '/kanban', icon: '⚡', label: 'KANBAN' },
      { route: '/topology', icon: '🌐', label: 'TOPOLOGY' },
      { route: '/drift', icon: '🛡️', label: 'DRIFT CENTER' },
      { route: '/decisions', icon: '⚖️', label: 'ADR DAG' },
      { route: '/mermaid', icon: '📊', label: 'MERMAID' },
      { route: '/dark-matter', icon: '🔭', label: 'DARK MATTER' },
      { route: '/harness', icon: '🤖', label: 'HARNESS CENTER' },
      { route: '/settings', icon: '⚙️', label: 'SETTINGS' }
    ];
  }

  mount() {
    if (!this.container) return;

    this.container.innerHTML = `
      <nav class="nav-tabs">
        ${this.tabs.map(tab => `
          <button class="tab-btn" data-route="${tab.route}">
            <span>${tab.icon}</span> ${tab.label}
          </button>
        `).join('')}
      </nav>
    `;

    this.bindEvents();
    this.syncActiveTab(this.router.getCurrentPath());

    this.router.onRouteChange(({ path }) => {
      this.syncActiveTab(path);
    });
  }

  bindEvents() {
    const buttons = this.container.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const route = btn.dataset.route;
        if (route) {
          this.router.navigate(route);
        }
      });
    });
  }

  syncActiveTab(currentPath) {
    const cleanPath = currentPath.split('?')[0];
    const buttons = this.container.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
      const route = btn.dataset.route;
      const isActive = route === cleanPath || (cleanPath === '/' && route === '/kanban');
      btn.classList.toggle('active', isActive);
    });
  }
}
