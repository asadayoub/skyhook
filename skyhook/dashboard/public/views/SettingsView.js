/**
 * SettingsView - Project Configuration, Active Profile, & CLI Telemetry
 * Provides workspace settings, tech-stack inspector, and platform environment info.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class SettingsView extends BaseView {
  render() {
    const d = this.store.getState().projectData || {};
    const proj = d.project || {};
    const tech = d.techStack || {};
    const currentId = this.store.getState().currentProjectId;
    const pref = this.store.getState().editorPreference;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div>
          <h2 style="font-family: var(--font-hud); font-size: 1.8rem; color: var(--text-primary); letter-spacing: 0.05em; display: flex; align-items: center; gap: 10px;">
            <span>⚙️</span> PROJECT SETTINGS &amp; ENVIRONMENT
          </h2>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">
            Inspect workspace profile, declared tech stack, and IDE integration preferences.
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px;">
        <!-- Workspace & Profile Card -->
        <div class="glass-panel" style="padding: 24px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.2rem; color: var(--neon-cyan); margin-bottom: 16px;">
            WORKSPACE INFO
          </h3>

          <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem;">
            <div>
              <div style="color: var(--text-dim); text-transform: uppercase; font-size: 0.72rem;">Project ID</div>
              <div style="font-family: var(--font-mono); color: var(--text-primary); font-weight: 600;">${this.escapeHtml(proj.id || currentId || 'workspace')}</div>
            </div>
            <div>
              <div style="color: var(--text-dim); text-transform: uppercase; font-size: 0.72rem;">Project Name</div>
              <div style="color: var(--text-primary); font-weight: 600;">${this.escapeHtml(proj.name || 'Skyhook Workspace')}</div>
            </div>
            <div>
              <div style="color: var(--text-dim); text-transform: uppercase; font-size: 0.72rem;">Active Profile</div>
              <div style="color: var(--neon-emerald); font-family: var(--font-mono);">${this.escapeHtml(proj.profile || 'standard-web')}</div>
            </div>
            <div>
              <div style="color: var(--text-dim); text-transform: uppercase; font-size: 0.72rem;">Skyhook Directory</div>
              <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); word-break: break-all;">${this.escapeHtml(d.skyhookDir || './.skyhook')}</div>
            </div>
          </div>
        </div>

        <!-- Preferred Editor Integration -->
        <div class="glass-panel" style="padding: 24px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.2rem; color: var(--neon-cyan); margin-bottom: 16px;">
            IDE INTEGRATION PREFERENCE
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">
            Controls which code editor protocol handler is invoked when clicking source code chips or drift violations.
          </p>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="radio" name="editorPrefRadio" value="vscode" ${pref === 'vscode' ? 'checked' : ''} />
              <span style="font-family: var(--font-mono); font-size: 0.85rem;">VS Code (vscode://file/...)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="radio" name="editorPrefRadio" value="cursor" ${pref === 'cursor' ? 'checked' : ''} />
              <span style="font-family: var(--font-mono); font-size: 0.85rem;">Cursor AI (cursor://file/...)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="radio" name="editorPrefRadio" value="sublime" ${pref === 'sublime' ? 'checked' : ''} />
              <span style="font-family: var(--font-mono); font-size: 0.85rem;">Sublime Text (subl://file/...)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="radio" name="editorPrefRadio" value="modal" ${pref === 'modal' ? 'checked' : ''} />
              <span style="font-family: var(--font-mono); font-size: 0.85rem;">In-Dashboard Code Inspector Modal</span>
            </label>
          </div>
        </div>

        <!-- Declared Tech Stack -->
        <div class="glass-panel" style="padding: 24px; grid-column: 1 / -1;">
          <h3 style="font-family: var(--font-hud); font-size: 1.2rem; color: var(--neon-cyan); margin-bottom: 16px;">
            DECLARED TECH STACK (.skyhook/tech-stack.yaml)
          </h3>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px;">
            ${(tech.technologies || []).map(t => `
              <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid var(--border-dim); border-radius: 6px; padding: 12px;">
                <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${this.escapeHtml(t.name)}</div>
                <div style="color: var(--neon-cyan); font-size: 0.75rem; font-family: var(--font-mono); margin-top: 4px;">${this.escapeHtml(t.category || 'Technology')}</div>
                ${t.version ? `<div style="color: var(--text-dim); font-size: 0.72rem; font-family: var(--font-mono); margin-top: 2px;">Version: ${this.escapeHtml(t.version)}</div>` : ''}
              </div>
            `).join('')}
            ${(!tech.technologies || tech.technologies.length === 0) ? `
              <div style="color: var(--text-dim); font-size: 0.85rem;">No technologies currently declared in tech-stack.yaml</div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    const radios = this.container?.querySelectorAll('input[name="editorPrefRadio"]');
    radios?.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const val = e.target.value;
        this.store.setState({ editorPreference: val });
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('skyhook_editor_pref', val);
        }
        const select = document.getElementById('editorSelect');
        if (select) select.value = val;
        Toast.show(`Editor preference updated: ${val}`, 'info');
      });
    });
  }
}
