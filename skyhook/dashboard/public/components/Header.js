/**
 * Header Component - HUD Top Bar
 * Project switcher, editor preference, live WebSocket heartbeat indicator.
 */

export class Header {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.element
   * @param {import('../core/Store.js').Store} options.store
   * @param {import('../core/Bridge.js').Bridge} options.bridge
   * @param {Function} options.onProjectChange
   */
  constructor(options = {}) {
    this.element = options.element;
    this.store = options.store;
    this.bridge = options.bridge;
    this.onProjectChange = options.onProjectChange;
  }

  mount() {
    if (!this.element) return;

    this.element.innerHTML = `
      <div class="brand">
        <div class="brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </div>
        <div>
          <div class="brand-title">SKYHOOK // ARCHITECTURE RADAR</div>
        </div>
        <span class="brand-version">v1.9.0</span>
      </div>

      <div id="navContainer"></div>

      <div class="hud-controls">
        <select id="projectSelect" class="project-select" aria-label="Project"></select>
        
        <select id="editorSelect" class="project-select" aria-label="Editor Preference" title="Preferred Editor for Deep Links">
          <option value="vscode">VS Code (vscode://)</option>
          <option value="cursor">Cursor (cursor://)</option>
          <option value="sublime">Sublime Text (subl://)</option>
          <option value="modal">In-Dashboard Viewer</option>
        </select>

        <div class="telemetry-indicator" title="Bidirectional WebSocket Event Stream">
          <span id="connectionIndicator" class="pulse-dot"></span>
          <span id="connectionStatusText">CONNECTING</span>
          <span style="color: var(--text-dim);">|</span>
          <span id="latencyDisplay" style="color: var(--neon-cyan);">-- ms</span>
        </div>
      </div>
    `;

    this.bindEvents();
    this.subscribeToStore();
  }

  bindEvents() {
    const projectSelect = document.getElementById('projectSelect');
    const editorSelect = document.getElementById('editorSelect');

    if (editorSelect) {
      editorSelect.value = this.store.getState().editorPreference;
      editorSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.store.setState({ editorPreference: val });
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('skyhook_editor_pref', val);
        }
      });
    }

    if (projectSelect) {
      projectSelect.addEventListener('change', (e) => {
        if (this.onProjectChange) {
          this.onProjectChange(e.target.value);
        }
      });
    }
  }

  subscribeToStore() {
    this.store.subscribe('connected', (connected) => {
      const indicator = document.getElementById('connectionIndicator');
      const text = document.getElementById('connectionStatusText');
      if (indicator) {
        indicator.style.background = connected ? 'var(--neon-emerald)' : 'var(--neon-rose)';
        indicator.style.boxShadow = connected ? '0 0 8px var(--neon-emerald)' : '0 0 8px var(--neon-rose)';
      }
      if (text) {
        text.textContent = connected ? 'LIVE' : 'OFFLINE';
        text.style.color = connected ? 'var(--neon-emerald)' : 'var(--neon-rose)';
      }
    });

    this.store.subscribe('latencyMs', (latency) => {
      const latencyDisplay = document.getElementById('latencyDisplay');
      if (latencyDisplay) {
        latencyDisplay.textContent = `${latency} ms`;
      }
    });

    this.store.subscribe('projects', (projects) => {
      this.updateProjectOptions(projects);
    });
  }

  updateProjectOptions(projects) {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;

    projectSelect.innerHTML = '';
    const currentId = this.store.getState().currentProjectId;

    for (const proj of projects) {
      const opt = document.createElement('option');
      opt.value = proj.id;
      opt.textContent = `${proj.name} [${proj.profile || 'skyhook'}]`;
      if (proj.id === currentId) opt.selected = true;
      projectSelect.appendChild(opt);
    }
  }
}
