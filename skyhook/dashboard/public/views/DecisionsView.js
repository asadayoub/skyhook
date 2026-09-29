/**
 * DecisionsView - Architectural Decision Records (ADR) DAG & Governance Studio
 * Kanban lifecycle visualizer, supersession flows, policy compilation, and DAG diagrams.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class DecisionsView extends BaseView {
  constructor(context) {
    super(context);
    this.viewMode = 'kanban'; // 'kanban' | 'dag'
    this.dagData = null;
  }

  render() {
    const decisions = this.store.getState().projectData?.decisions?.decisions || [];

    const cols = [
      { id: 'draft', title: 'Draft / Proposed', color: 'var(--neon-cyan)', icon: '📝' },
      { id: 'under-review', title: 'Under Review', color: 'var(--neon-amber)', icon: '👀' },
      { id: 'accepted', title: 'Accepted & Enforced', color: 'var(--neon-emerald)', icon: '✅' },
      { id: 'superseded', title: 'Superseded / Deprecated', color: 'var(--neon-rose)', icon: '⚠️' }
    ];

    return `
      <!-- Top Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div>
          <h2 style="font-family: var(--font-hud); font-size: 1.8rem; color: var(--text-primary); letter-spacing: 0.05em; display: flex; align-items: center; gap: 10px;">
            <span>⚖️</span> ARCHITECTURAL DECISIONS (ADR DAG)
            <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--neon-cyan); background: rgba(0, 240, 255, 0.1); border: 1px solid var(--border-neon); padding: 3px 8px; border-radius: 4px;">
              ${decisions.length} Decisions
            </span>
          </h2>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">
            Living decision graph, automated supersession, policy compiler, and proactive interception.
          </div>
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; background: rgba(0,0,0,0.4); border: 1px solid var(--border-dim); border-radius: 6px; padding: 2px;">
            <button class="view-mode-btn ${this.viewMode === 'kanban' ? 'active' : ''}" data-mode="kanban" style="padding: 6px 14px; font-size: 0.8rem; border: none; background: ${this.viewMode === 'kanban' ? 'var(--neon-cyan)' : 'transparent'}; color: ${this.viewMode === 'kanban' ? '#000' : 'var(--text-secondary)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">
              Kanban
            </button>
            <button class="view-mode-btn ${this.viewMode === 'dag' ? 'active' : ''}" data-mode="dag" style="padding: 6px 14px; font-size: 0.8rem; border: none; background: ${this.viewMode === 'dag' ? 'var(--neon-cyan)' : 'transparent'}; color: ${this.viewMode === 'dag' ? '#000' : 'var(--text-secondary)'}; border-radius: 4px; cursor: pointer; font-weight: 600;">
              DAG Graph
            </button>
          </div>
          <button id="sweepAdrBtn" class="btn-secondary" style="padding: 8px 14px; font-size: 0.82rem;">
            🔍 Proactive Sweep
          </button>
          <button id="compilePoliciesBtn" class="btn-cyber" style="padding: 8px 16px; font-size: 0.82rem;">
            ⚡ Compile Policies
          </button>
        </div>
      </div>

      <!-- Main Content: Kanban or DAG -->
      ${this.viewMode === 'kanban' ? `
        <div class="kanban-grid" style="grid-template-columns: repeat(4, 1fr); min-height: 520px; gap: 16px;">
          ${cols.map(col => {
            const colDecisions = decisions.filter(d => {
              const st = (d.status || 'draft').toLowerCase();
              if (col.id === 'superseded') return st === 'superseded' || st === 'deprecated' || st === 'rejected';
              if (col.id === 'draft') return st === 'draft' || st === 'proposed';
              return st === col.id;
            });

            return `
              <div class="kanban-col glass-panel" style="border-top: 3px solid ${col.color}; padding: 16px;">
                <div class="kanban-col-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <div class="kanban-col-title" style="color: ${col.color}; font-family: var(--font-hud); font-size: 1.05rem; font-weight: 700;">
                    <span>${col.icon}</span> ${col.title}
                  </div>
                  <div class="kanban-col-count" style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 10px;">${colDecisions.length}</div>
                </div>
                <div class="kanban-cards">
                  ${colDecisions.map(d => {
                    const st = (d.status || 'draft').toLowerCase();
                    return `
                      <div class="glass-panel" style="padding: 14px; margin-bottom: 12px; background: rgba(14, 20, 36, 0.85); border-left: 3px solid ${col.color};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                          <span class="story-badge" style="font-family: var(--font-mono);">${this.escapeHtml(d.id)}</span>
                          <span style="font-size: 0.7rem; font-family: var(--font-mono); color: ${col.color}; text-transform: uppercase;">${this.escapeHtml(st)}</span>
                        </div>
                        <div style="font-weight: 600; font-size: 0.88rem; margin-bottom: 6px; color: var(--text-primary); line-height: 1.3;">${this.escapeHtml(d.title)}</div>
                        <div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px;">
                          ${this.escapeHtml(d.category || 'architecture')} &bull; ${this.escapeHtml(d.author || 'AI Agent + Human')}
                        </div>
                        ${d.supersededBy ? `<div style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--neon-rose); margin-bottom: 8px;">⚠️ Superseded by ${this.escapeHtml(d.supersededBy)}</div>` : ''}
                        ${d.supersedes ? `<div style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--neon-cyan); margin-bottom: 8px;">🔗 Supersedes ${this.escapeHtml(d.supersedes)}</div>` : ''}
                        
                        <div style="display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;">
                          ${st === 'draft' || st === 'proposed' ? `
                            <button class="btn-secondary transition-btn" style="font-size: 0.72rem; padding: 4px 8px; flex: 1;" data-id="${d.id}" data-target="under-review">
                              Review ➔
                            </button>
                          ` : ''}
                          ${st === 'under-review' ? `
                            <button class="btn-cyber transition-btn" style="font-size: 0.72rem; padding: 4px 8px; flex: 1;" data-id="${d.id}" data-target="accepted">
                              Accept ➔
                            </button>
                          ` : ''}
                          <button class="btn-secondary open-adr-btn" style="font-size: 0.72rem; padding: 4px 8px;" data-id="${d.id}">
                            View Doc ↗
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                  ${colDecisions.length === 0 ? '<div style="text-align: center; color: var(--text-dim); padding: 40px 0; font-size: 0.8rem;">No decisions in this state</div>' : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <!-- DAG Diagram -->
        <div class="glass-panel" style="padding: 24px;">
          <div style="margin-bottom: 16px; font-family: var(--font-hud); font-size: 1.1rem; color: var(--neon-cyan);">
            DECISION DIRECTED ACYCLIC GRAPH (DAG)
          </div>
          <div id="adrDagMermaidBox" style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-dim); border-radius: 8px; padding: 20px; overflow-x: auto;">
            <pre class="mermaid" style="display: flex; justify-content: center; margin: 0;">${this.dagData?.mermaid || 'graph TD; ADR1[ADR-001: Architecture] --> ADR2[ADR-002: Modular Frontend];'}</pre>
          </div>
        </div>
      `}
    `;
  }

  async postRender() {
    this.bindEvents();

    if (this.viewMode === 'dag' && !this.dagData) {
      await this.fetchDag();
    }

    if (typeof window !== 'undefined' && window.mermaid) {
      try { window.mermaid.run(); } catch (_) {}
    }
  }

  bindEvents() {
    if (!this.container) return;

    // View mode switchers
    const modeBtns = this.container.querySelectorAll('.view-mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewMode = btn.dataset.mode;
        this.container.innerHTML = this.render();
        this.postRender();
      });
    });

    // Sweep ADR button
    const sweepBtn = this.container.querySelector('#sweepAdrBtn');
    if (sweepBtn) {
      sweepBtn.addEventListener('click', async () => {
        try {
          const res = await this.bridge.post('/api/action/intercept-adr');
          Toast.show(`Proactive scan complete: ${res.count || 0} drafts synthesized`, 'info');
        } catch (err) {
          Toast.show(`Interception error: ${err.message}`, 'error');
        }
      });
    }

    // Compile Policies button
    const compileBtn = this.container.querySelector('#compilePoliciesBtn');
    if (compileBtn) {
      compileBtn.addEventListener('click', async () => {
        try {
          const res = await this.bridge.post('/api/action/compile-policies');
          Toast.show(`Compiled ${res.compiledCount || 0} active boundary rules`, 'success');
        } catch (err) {
          Toast.show(`Policy compile error: ${err.message}`, 'error');
        }
      });
    }

    // Status transition buttons
    const transitionBtns = this.container.querySelectorAll('.transition-btn');
    transitionBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const decisionId = btn.dataset.id;
        const targetStatus = btn.dataset.target;
        try {
          await this.bridge.post('/api/action/transition-adr', { decisionId, targetStatus });
          Toast.show(`Transitioned ${decisionId} to ${targetStatus}`, 'success');
        } catch (err) {
          Toast.show(`Transition failed: ${err.message}`, 'error');
        }
      });
    });

    // Open ADR doc button
    const openBtns = this.container.querySelectorAll('.open-adr-btn');
    openBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        const pref = this.store.getState().editorPreference;
        if (skyhookDir) {
          this.bridge.openEditor(`${skyhookDir}/decisions/records/${id}.md`, 1, pref);
        }
      });
    });
  }

  async fetchDag() {
    try {
      this.dagData = await this.bridge.get('/api/adr/dag');
      if (this.viewMode === 'dag' && this.container) {
        const box = this.container.querySelector('#adrDagMermaidBox');
        if (box && this.dagData?.mermaid) {
          box.innerHTML = `<pre class="mermaid" style="display: flex; justify-content: center; margin: 0;">${this.escapeHtml(this.dagData.mermaid)}</pre>`;
          if (typeof window !== 'undefined' && window.mermaid) {
            try { window.mermaid.run(); } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }
}
