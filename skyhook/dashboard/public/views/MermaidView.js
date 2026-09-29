/**
 * MermaidView - Living Mermaid Studio & Project Plan Recompiler
 * Renders master plan Gantt schedules, dependency flowcharts, and live diagrams.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class MermaidView extends BaseView {
  render() {
    const planMd = this.store.getState().projectData?.planMarkdown || '';

    // Extract Mermaid block if available or synthesize Gantt schedule
    let mermaidCode = '';
    const match = planMd.match(/```mermaid([\s\S]*?)```/);
    if (match) {
      mermaidCode = match[1].trim();
    } else {
      mermaidCode = `gantt
    title Project Execution Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
    Discovery & Architecture :done, p1, 2026-09-01, 7d
    Core State Machine :done, p2, after p1, 10d
    section Phase 2
    Modular Dashboard & MCP :active, p3, after p2, 5d`;
    }

    return `
      <div class="glass-panel" style="padding: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-family: var(--font-hud); font-size: 1.4rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
              <span>📊</span> LIVING MERMAID STUDIO & MASTER PLAN
            </h2>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">
              Auto-compiled from backlog stories, capacity forecasts, and critical path analysis.
            </div>
          </div>
          <button id="recompileMasterPlanBtn" class="btn-cyber">
            ⚡ RECOMPILE MASTER PLAN
          </button>
        </div>

        <div class="glass-panel" style="padding: 24px; background: #080c14; overflow-x: auto; min-height: 400px;" id="mermaidRenderContainer">
          <pre class="mermaid" style="display: flex; justify-content: center; margin: 0;">${this.escapeHtml(mermaidCode)}</pre>
        </div>
      </div>
    `;
  }

  async postRender() {
    const recompileBtn = this.container?.querySelector('#recompileMasterPlanBtn');
    if (recompileBtn) {
      recompileBtn.addEventListener('click', async () => {
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        try {
          await this.bridge.call('recompile-plan', { skyhookDir });
          Toast.show('Master project plan recompiled successfully', 'success');
        } catch (err) {
          Toast.show(`Recompilation failed: ${err.message}`, 'error');
        }
      });
    }

    if (typeof window !== 'undefined' && window.mermaid) {
      try {
        window.mermaid.run();
      } catch (_) {}
    }
  }
}
