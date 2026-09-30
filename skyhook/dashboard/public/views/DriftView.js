/**
 * DriftView - Architecture Drift, DDD Boundaries, & Living C4 Models
 * Visualizes layer violations, circular cycles, package drift, and auto-remediation.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class DriftView extends BaseView {
  constructor(context) {
    super(context);
    this.scorecard = null;
    this.activeC4Tab = 'container';
  }

  render() {
    const sc = this.scorecard || {
      healthScore: 100,
      pass: true,
      summary: { criticalCount: 0, warningCount: 0, circularCyclesCount: 0, nodesCount: 0, edgesCount: 0, externalPackagesCount: 0 },
      criticalViolations: [],
      warnings: [],
      circularCycles: [],
      c4: { mermaidContainer: '', mermaidComponent: '', diff: { match: true } },
      remediation: { tasks: [] }
    };

    const d = this.store.getState().projectData || {};
    const declared = d.techStack?.technologies || [];
    const drift = d.drift || { detected: false, unauthorized: [] };
    const unauthorized = drift.unauthorized || [];

    const healthColor = sc.healthScore >= 80 ? 'var(--neon-emerald)' : sc.healthScore >= 50 ? '#f59e0b' : 'var(--neon-rose)';
    const gaugeClass = sc.healthScore >= 80 ? '' : sc.healthScore >= 50 ? 'warn' : 'error';

    return `
      <!-- Top Summary & Health Gauge -->
      <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
          <div style="display: flex; align-items: center; gap: 20px;">
            <div class="gauge-circle ${gaugeClass}">
              <span class="gauge-score" style="color: ${healthColor};">${sc.healthScore}%</span>
              <span class="gauge-label">COMPLIANCE</span>
            </div>
            <div>
              <h2 style="font-family: var(--font-hud); font-size: 1.5rem; letter-spacing: 1px; color: ${sc.pass ? 'var(--neon-emerald)' : 'var(--neon-rose)'};">
                ${sc.pass ? '🛡️ SYSTEM BOUNDARIES VERIFIED' : '⚠️ ARCHITECTURAL DRIFT DETECTED'}
              </h2>
              <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
                Continuous AST polyglot dependency inspection, DDD layer boundary governance, and living C4 models.
              </p>
            </div>
          </div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            ${unauthorized.length > 0 ? `
              <button id="adoptAllBtn" class="btn-cyber">
                ADOPT ALL DRIFT (1-CLICK)
              </button>
            ` : ''}
            <button id="rescanDriftBtn" class="btn-secondary">
              RE-SCAN SYSTEM
            </button>
          </div>
        </div>

        <!-- Quick Metrics Strip -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 24px;">
          <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Critical Violations</div>
            <div style="font-family: var(--font-hud); font-size: 1.4rem; color: ${sc.summary.criticalCount > 0 ? 'var(--neon-rose)' : 'var(--neon-emerald)'};">
              ${sc.summary.criticalCount}
            </div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Circular Cycles</div>
            <div style="font-family: var(--font-hud); font-size: 1.4rem; color: ${sc.summary.circularCyclesCount > 0 ? 'var(--neon-rose)' : 'var(--neon-emerald)'};">
              ${sc.summary.circularCyclesCount}
            </div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Graph Topology</div>
            <div style="font-family: var(--font-hud); font-size: 1.4rem; color: var(--neon-cyan);">
              ${sc.summary.nodesCount} <span style="font-size: 0.85rem; color: var(--text-dim);">nodes</span> / ${sc.summary.edgesCount} <span style="font-size: 0.85rem; color: var(--text-dim);">edges</span>
            </div>
          </div>
          <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">External Packages</div>
            <div style="font-family: var(--font-hud); font-size: 1.4rem; color: #a78bfa;">
              ${sc.summary.externalPackagesCount}
            </div>
          </div>
        </div>
      </div>

      <!-- Main 2-Column Grid -->
      <div class="drift-container" style="margin-bottom: 24px;">
        <!-- Left Column: Layer Violations & Circular Loops -->
        <div class="glass-panel diff-box" style="border-color: ${sc.criticalViolations.length > 0 ? 'var(--neon-rose)' : 'var(--border-neon)'};">
          <div class="diff-header" style="color: ${sc.criticalViolations.length > 0 ? 'var(--neon-rose)' : 'var(--text-primary)'};">
            <span>LAYER VIOLATIONS & BOUNDARIES (${sc.criticalViolations.length})</span>
            <span class="story-badge">DDD Enforcer</span>
          </div>

          <div>
            ${sc.criticalViolations.length > 0 ? sc.criticalViolations.map(v => `
              <div class="violation-card">
                <div class="violation-header">
                  <div class="layer-vector">
                    <span class="layer-pill from">${this.escapeHtml(v.fromLayer || v.type || 'LAYER')}</span>
                    <span style="color: var(--neon-rose);">➔</span>
                    <span class="layer-pill to">${this.escapeHtml(v.toLayer || v.module || 'TARGET')}</span>
                  </div>
                  <button class="btn-secondary open-file-btn" style="font-size: 0.7rem; padding: 2px 8px;" data-file="${this.escapeHtml(v.file || '')}" data-line="${v.line || 1}">
                    ${this.escapeHtml(v.file ? v.file.split(/[\\/]/).pop() : 'Open')}:${v.line || 1} ↗
                  </button>
                </div>
                <div style="font-size: 0.85rem; color: #fecdd3; margin-bottom: 6px;">
                  ${this.escapeHtml(v.message || '')}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">
                  💡 Fix: ${this.escapeHtml(v.recommendation || v.suggestion || 'Decouple layers using an abstraction.')}
                </div>
              </div>
            `).join('') : `
              <div style="color: var(--neon-emerald); padding: 16px 0; font-family: var(--font-mono); font-size: 0.85rem;">
                ✅ Zero boundary breaches. Strict layer directionality and encapsulation preserved.
              </div>
            `}

            <!-- Circular Loops -->
            ${sc.circularCycles.length > 0 ? `
              <div style="margin-top: 16px; border-top: 1px solid rgba(244, 63, 94, 0.2); padding-top: 12px;">
                <div style="font-family: var(--font-hud); font-size: 0.9rem; color: var(--neon-rose); margin-bottom: 8px;">
                  🔄 CIRCULAR DEPENDENCY LOOPS (${sc.circularCycles.length})
                </div>
                ${sc.circularCycles.map(cycle => `
                  <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
                      ${cycle.map((node, i) => `
                        <span class="cycle-step-tag">${this.escapeHtml(node.split(/[\\/]/).pop())}</span>
                        ${i < cycle.length - 1 ? '<span style="color: var(--neon-rose);">➔</span>' : '<span style="color: var(--neon-rose);">➔ 🔁</span>'}
                      `).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Right Column: Package Drift & 1-Click ADR Drafting -->
        <div class="glass-panel diff-box">
          <div class="diff-header">
            <span>PACKAGE DRIFT & ADR GOVERNANCE</span>
            <span class="story-points">tech-stack.yaml</span>
          </div>

          <div>
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">
              UNDECLARED DISCOVERED TECHNOLOGIES (${unauthorized.length})
            </div>
            ${unauthorized.length > 0 ? unauthorized.map(t => `
              <div class="tech-tag drift" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; width: 100%;">
                <div>
                  <span style="font-weight: 600; color: #fff;">${this.escapeHtml(t.name)}</span>
                  <div style="font-size: 0.72rem; color: #ff9fb0;">Used in source code but not declared in tech stack</div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-secondary adopt-single-btn" style="padding: 4px 8px; font-size: 0.72rem;" data-tech="${this.escapeHtml(JSON.stringify(t))}">
                    Adopt
                  </button>
                  <button class="btn-cyber draft-adr-btn" style="padding: 4px 8px; font-size: 0.72rem;" data-name="${this.escapeHtml(t.name)}" data-category="${this.escapeHtml(t.category || 'technology')}">
                    Draft ADR
                  </button>
                </div>
              </div>
            `).join('') : `
              <div style="color: var(--neon-emerald); font-size: 0.85rem; font-family: var(--font-mono); margin-bottom: 16px;">
                ✅ All packages in codebase match declared stack.
              </div>
            `}

            <!-- Declared Technologies -->
            <div style="margin-top: 16px; border-top: 1px solid var(--border-dim); padding-top: 12px;">
              <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">
                DECLARED ACTIVE STACK (${declared.length})
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${declared.map(t => `
                  <span class="tech-tag" style="background: rgba(0, 240, 255, 0.08); border-color: rgba(0, 240, 255, 0.25); color: #bae6fd;">
                    ${this.escapeHtml(t.name)}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Living C4 Architecture Diagrams -->
      <div class="glass-panel" style="padding: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-family: var(--font-hud); font-size: 1.25rem; font-weight: 700; color: var(--neon-cyan);">
              🏛️ LIVING C4 ARCHITECTURAL MODEL
            </div>
            <div style="color: var(--text-dim); font-size: 0.8rem;">
              Reverse-engineered dynamically from codebase AST imports.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="c4-tab-btn ${this.activeC4Tab === 'container' ? 'active' : ''}" data-tab="container">
              C4 Container
            </button>
            <button class="c4-tab-btn ${this.activeC4Tab === 'component' ? 'active' : ''}" data-tab="component">
              C4 Component
            </button>
          </div>
        </div>

        <div id="c4MermaidContainer" style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-dim); border-radius: 8px; padding: 20px; overflow-x: auto;">
          <pre class="mermaid" style="display: flex; justify-content: center; margin: 0;">${this.activeC4Tab === 'container' ? sc.c4?.mermaidContainer || 'graph TD; App-->DB;' : sc.c4?.mermaidComponent || 'graph TD; Controller-->Service;'}</pre>
        </div>
      </div>
    `;
  }

  async postRender() {
    if (!this.scorecard) {
      await this.fetchScorecard();
      return;
    }
    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    // Adopt All
    const adoptAllBtn = this.container.querySelector('#adoptAllBtn');
    if (adoptAllBtn) {
      adoptAllBtn.addEventListener('click', async () => {
        const d = this.store.getState().projectData;
        const unauthorized = d?.drift?.unauthorized || [];
        await this.adoptTechnologies(unauthorized);
      });
    }

    // Re-scan System
    const rescanBtn = this.container.querySelector('#rescanDriftBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', async () => {
        await this.fetchScorecard(true);
      });
    }

    // Single Adopt buttons
    const adoptSingleBtns = this.container.querySelectorAll('.adopt-single-btn');
    adoptSingleBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const tech = JSON.parse(btn.dataset.tech);
        await this.adoptTechnologies([tech]);
      });
    });

    // Draft ADR buttons
    const draftAdrBtns = this.container.querySelectorAll('.draft-adr-btn');
    draftAdrBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const category = btn.dataset.category;
        await this.draftAdr(name, category);
      });
    });

    // Open file buttons
    const openFileBtns = this.container.querySelectorAll('.open-file-btn');
    openFileBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const file = btn.dataset.file;
        const line = Number(btn.dataset.line || 1);
        const pref = this.store.getState().editorPreference;
        if (file) {
          this.bridge.openEditor(file, line, pref);
        }
      });
    });

    // C4 Tab Switcher
    const c4Tabs = this.container.querySelectorAll('.c4-tab-btn');
    c4Tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeC4Tab = btn.dataset.tab;
        c4Tabs.forEach(b => b.classList.toggle('active', b === btn));
        const sc = this.scorecard;
        const c4Container = this.container.querySelector('#c4MermaidContainer');
        if (c4Container && sc) {
          const content = this.activeC4Tab === 'container' ? sc.c4?.mermaidContainer : sc.c4?.mermaidComponent;
          c4Container.innerHTML = `<pre class="mermaid" style="display: flex; justify-content: center; margin: 0;">${this.escapeHtml(content || '')}</pre>`;
          if (typeof window !== 'undefined' && window.mermaid) {
            try { window.mermaid.run(); } catch (_) {}
          }
        }
      });
    });

    // Render Mermaid diagrams if available
    if (typeof window !== 'undefined' && window.mermaid) {
      try { window.mermaid.run(); } catch (_) {}
    }
  }

  async fetchScorecard(forceToast = false) {
    try {
      const projectDir = this.store.getState().projectData?.projectDir;
      this.scorecard = await this.bridge.get('/api/drift', projectDir ? { projectDir } : {});
      if (forceToast) Toast.show('System boundary analysis complete', 'info');
      if (this.container) {
        this.container.innerHTML = this.render();
        this.bindEvents();
      }
    } catch (err) {
      Toast.show(`Notice: Architecture scorecard fallback active (${err.message})`, 'info');
      if (!this.scorecard) {
        this.scorecard = {
          healthScore: 100,
          pass: true,
          summary: { criticalCount: 0, warningCount: 0, circularCyclesCount: 0, nodesCount: 0, edgesCount: 0, externalPackagesCount: 0 },
          criticalViolations: [],
          warnings: [{ type: 'NOTICE', message: err.message }],
          circularCycles: [],
          c4: { mermaidContainer: '', mermaidComponent: '', diff: { match: true } },
          remediation: { tasks: [] }
        };
      }
      if (this.container) {
        this.container.innerHTML = this.render();
        this.bindEvents();
      }
    }
  }

  async adoptTechnologies(techs) {
    if (!techs || techs.length === 0) return;
    const skyhookDir = this.store.getState().projectData?.skyhookDir;
    try {
      await this.bridge.call('adopt-drift', { skyhookDir, technologies: techs });
      Toast.show(`Adopted ${techs.length} technology item(s) into tech-stack.yaml`, 'success');
      await this.fetchScorecard();
    } catch (err) {
      Toast.show(`Failed to adopt drift: ${err.message}`, 'error');
    }
  }

  async draftAdr(name, category) {
    try {
      const res = await this.bridge.post('/api/action/draft-adr-drift', {
        name,
        category,
        message: `Discovered undeclared technology '${name}' in source code.`
      });
      Toast.show(`Drafted new ADR: ${res.id || name}`, 'success');
      this.router.navigate('/decisions');
    } catch (err) {
      Toast.show(`Failed to draft ADR: ${err.message}`, 'error');
    }
  }
}
