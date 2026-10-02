/**
 * Header Component - HUD Top Bar
 * Project switcher, editor preference, live WebSocket heartbeat indicator.
 */

import { Toast } from './Toast.js';

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
      <div class="header-top">
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
          <span class="brand-version">v2.0.0</span>
        </div>

        <div class="hud-controls">
          <div class="project-selector-wrapper" style="display: flex; align-items: center; gap: 8px;">
            <label for="projectSelect" style="font-family: var(--font-hud); font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">PROJECT:</label>
            <select id="projectSelect" class="project-select" aria-label="Project"></select>
            <button id="addProjectBtn" class="btn-secondary" title="Open or Switch Project Folder" style="padding: 7px 12px; font-size: 0.8rem; font-family: var(--font-hud); display: flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap;">
              <span>📂</span> <span>OPEN FOLDER...</span>
            </button>
          </div>
          
          <select id="editorSelect" class="project-select" aria-label="Editor Preference" title="Preferred Editor for Deep Links">
            <option value="vscode">VS Code (vscode://)</option>
            <option value="cursor">Cursor (cursor://)</option>
            <option value="windsurf">Windsurf (windsurf://)</option>
            <option value="sublime">Sublime Text (subl://)</option>
            <option value="modal">In-Dashboard Viewer</option>
          </select>

          <button id="reindexSymbolsBtn" class="btn-secondary" title="Re-scan and index codebase AST symbols" style="padding: 7px 11px; font-size: 0.78rem; font-family: var(--font-hud); cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px;">
            <span>🔄</span> <span>INDEX AST</span>
          </button>

          <button id="recompilePlanBtn" class="btn-secondary" title="Recompile PROJECT_PLAN.md with current backlog & ADRs" style="padding: 7px 11px; font-size: 0.78rem; font-family: var(--font-hud); cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px;">
            <span>⚡</span> <span>COMPILE PLAN</span>
          </button>

          <div class="telemetry-indicator" title="Bidirectional WebSocket Event Stream">
            <span id="connectionIndicator" class="pulse-dot"></span>
            <span id="connectionStatusText">CONNECTING</span>
            <span style="color: var(--text-dim);">|</span>
            <span id="latencyDisplay" style="color: var(--neon-cyan);">-- ms</span>
          </div>
        </div>
      </div>

      <div class="header-nav-wrapper">
        <div id="navContainer"></div>
      </div>
    `;

    this.bindEvents();
    this.subscribeToStore();
  }

  bindEvents() {
    const projectSelect = document.getElementById('projectSelect');
    const editorSelect = document.getElementById('editorSelect');
    const addProjectBtn = document.getElementById('addProjectBtn');

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

    if (addProjectBtn) {
      addProjectBtn.addEventListener('click', async () => {
        const inputPath = prompt('Enter the absolute path to your project directory containing .skyhook:\n\nExample: /Users/asad/Documents/my-project');
        if (!inputPath || !inputPath.trim()) return;

        try {
          Toast.show('Registering and loading project...', 'info');
          const resp = await this.bridge.post('/api/projects/add', { path: inputPath.trim() });
          if (resp.error) {
            Toast.show(`Failed to add project: ${resp.error}`, 'error');
            return;
          }

          Toast.show(`Project "${resp.project?.name || resp.project?.id}" opened!`, 'success');
          if (Array.isArray(resp.projects)) {
            this.store.setState({ projects: resp.projects });
          }

          if (this.onProjectChange && resp.project?.id) {
            await this.onProjectChange(resp.project.id);
          }
        } catch (err) {
          Toast.show(`Error opening project: ${err.message}`, 'error');
        }
      });
    }

    const reindexBtn = document.getElementById('reindexSymbolsBtn');
    if (reindexBtn) {
      reindexBtn.addEventListener('click', async () => {
        try {
          Toast.show('Scanning AST symbols across workspace...', 'info');
          const resp = await this.bridge.post('/api/action/reindex-symbols');
          Toast.show(`AST indexing complete! ${resp.indexedSymbols || 0} symbols indexed.`, 'success');
        } catch (err) {
          Toast.show(`AST Index error: ${err.message}`, 'error');
        }
      });
    }

    const recompileBtn = document.getElementById('recompilePlanBtn');
    if (recompileBtn) {
      recompileBtn.addEventListener('click', async () => {
        try {
          Toast.show('Compiling PROJECT_PLAN.md...', 'info');
          const skyhookDir = this.store.getState().projectData?.skyhookDir;
          await this.bridge.post('/api/action/recompile-plan', { skyhookDir });
          Toast.show(`Master plan compiled successfully!`, 'success');
        } catch (err) {
          Toast.show(`Compile plan error: ${err.message}`, 'error');
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
