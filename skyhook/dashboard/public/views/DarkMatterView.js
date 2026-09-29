/**
 * DarkMatterView - Codebase Dark Matter & AST Coverage Radar
 * Discovers untraced symbols, language breakdowns, and coverage heatmaps.
 */

import { BaseView } from '../core/BaseView.js';

export class DarkMatterView extends BaseView {
  constructor(context) {
    super(context);
    this.darkMatterData = null;
  }

  render() {
    if (!this.darkMatterData) {
      return `
        <div class="glass-panel" style="text-align: center; padding: 60px; color: var(--text-dim); font-family: var(--font-mono);">
          SCANNING POLYGLOT AST CODEBASE FOR DARK MATTER...
        </div>
      `;
    }

    const { summary = {}, files = [], languages = [] } = this.darkMatterData;
    const untracedFiles = files.filter(f => f.untraced > 0);

    return `
      <!-- Top Summary Card -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <h2 style="font-family: var(--font-hud); font-size: 1.5rem; letter-spacing: 1px; color: ${summary.overallCoverage >= 70 ? 'var(--neon-emerald)' : summary.overallCoverage >= 40 ? 'var(--neon-amber)' : 'var(--neon-rose)'}; display: flex; align-items: center; gap: 10px;">
              <span>🔭</span> CODEBASE DARK MATTER RADAR
            </h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
              Multi-language AST symbol scanning discovering all grounded and ungrounded classes, functions, and structs.
            </p>
          </div>
          <div style="text-align: right;">
            <div style="font-family: var(--font-mono); font-size: 2rem; font-weight: 700; color: ${summary.overallCoverage >= 70 ? 'var(--neon-emerald)' : 'var(--neon-cyan)'};">
              ${summary.overallCoverage || 0}%
            </div>
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;">Overall Grounding</div>
          </div>
        </div>
      </div>

      <!-- Language Distribution Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        ${languages.map(l => `
          <div class="glass-panel" style="padding: 16px; border-left: 3px solid ${l.coverage >= 70 ? 'var(--neon-emerald)' : l.coverage >= 40 ? 'var(--neon-amber)' : 'var(--neon-rose)'};">
            <div style="font-family: var(--font-hud); font-size: 1.1rem; font-weight: 700; text-transform: uppercase;">${this.escapeHtml(l.language)}</div>
            <div style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 4px 0;">
              ${l.coverage}%
            </div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">
              ${l.traced} traced / ${l.total} total symbols
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Untraced Dark Matter File Explorer -->
      <div class="glass-panel" style="padding: 24px;">
        <h3 style="font-family: var(--font-hud); font-size: 1.2rem; letter-spacing: 1px; margin-bottom: 16px; color: var(--text-primary);">
          FILES WITH UNTRACED CODE SYMBOLS (${untracedFiles.length})
        </h3>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${(Array.isArray(untracedFiles) ? untracedFiles : []).slice(0, 30).map(f => {
            const symbolsList = Array.isArray(f.untracedSymbols) ? f.untracedSymbols : [];
            const firstLine = symbolsList[0]?.line || 1;
            return `
            <div class="glass-panel" style="padding: 16px; background: rgba(14, 20, 36, 0.5);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="story-badge" style="background: rgba(0, 240, 255, 0.1); color: var(--neon-cyan);">${this.escapeHtml(f.language || 'Code')}</span>
                  <span style="font-family: var(--font-mono); font-size: 0.9rem; font-weight: 600;">${this.escapeHtml(f.file || '')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-family: var(--font-mono); font-size: 0.8rem; color: ${f.risk === 'critical' ? 'var(--neon-rose)' : f.risk === 'moderate' ? 'var(--neon-amber)' : 'var(--neon-emerald)'}; font-weight: 600;">
                    ${f.untraced || 0} untraced (${f.coverage || 0}% coverage)
                  </span>
                  <button class="btn-secondary open-file-btn" style="padding: 4px 10px; font-size: 0.75rem;" data-file="${this.escapeHtml(f.file || '')}" data-line="${firstLine}">
                    Open in Editor ➔
                  </button>
                </div>
              </div>
              
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                ${symbolsList.slice(0, 8).map(s => `
                  <span class="symbol-tag open-file-btn" style="font-family: var(--font-mono); font-size: 0.75rem; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.25); color: #ff9fb0; padding: 2px 8px; border-radius: 4px; cursor: pointer;" data-file="${this.escapeHtml(f.file || '')}" data-line="${s.line || 1}">
                    ${this.escapeHtml(s.name || 'symbol')} (L${s.line || 1})
                  </span>
                `).join('')}
                ${symbolsList.length > 8 ? `<span style="font-size: 0.75rem; color: var(--text-dim); align-self: center;">+${symbolsList.length - 8} more</span>` : ''}
              </div>
            </div>
          `;
          }).join('')}
          ${untracedFiles.length === 0 ? '<div style="color: var(--neon-emerald); padding: 24px; text-align: center; font-family: var(--font-mono);">🎉 100% Traceability! Zero Dark Matter code in the repository.</div>' : ''}
        </div>
      </div>
    `;
  }

  async postRender() {
    if (!this.darkMatterData) {
      await this.fetchData();
      if (this.container) {
        this.container.innerHTML = this.render();
        this.bindEvents();
      }
      return;
    }
    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    const openBtns = this.container.querySelectorAll('.open-file-btn');
    openBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const file = btn.dataset.file;
        const line = Number(btn.dataset.line || 1);
        const pref = this.store.getState().editorPreference;
        if (file) {
          this.bridge.openEditor(file, line, pref);
        }
      });
    });
  }

  async fetchData() {
    try {
      this.darkMatterData = await this.bridge.get('/api/dark-matter');
    } catch (err) {
      this.darkMatterData = { summary: { overallCoverage: 0 }, files: [], languages: [] };
    }
  }
}
