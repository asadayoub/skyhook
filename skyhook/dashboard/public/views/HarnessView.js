/**
 * HarnessView - Agent Harness Center & 100% Offline MCP Hub
 * Injects atomic MCP configs & governance rules into Cursor, Claude, Copilot, Windsurf, Antigravity, Cline, and OpenAI Codex.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class HarnessView extends BaseView {
  constructor(context) {
    super(context);
    this.detectData = null;
    this.statusData = null;
  }

  render() {
    if (!this.detectData || !this.statusData) {
      return `
        <div class="glass-panel" style="text-align: center; padding: 40px; color: var(--text-dim); font-family: var(--font-mono);">
          SCANNING WORKSPACE & AGENT HARNESSES...
        </div>
      `;
    }

    const detectedMap = new Map((this.detectData.detectedAgents || []).map(a => [a.id, a]));
    const harnesses = this.statusData.harnesses || [];
    const detectedCount = this.detectData.detectedCount || 0;

    return `
      <!-- Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div>
          <h2 style="font-family: var(--font-hud); font-size: 1.8rem; color: var(--text-primary); letter-spacing: 0.05em; display: flex; align-items: center; gap: 10px;">
            <span>🤖</span> AGENT HARNESS CENTER
            <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--neon-cyan); background: rgba(0, 240, 255, 0.1); border: 1px solid var(--border-neon); padding: 3px 8px; border-radius: 4px;">100% OFFLINE MCP</span>
          </h2>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">
            Inject atomic MCP tools, resources, and governance rule enforcement into Cursor, Claude, Copilot, Windsurf, Antigravity, Cline, and OpenAI Codex.
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button id="injectAllHarnessesBtn" class="btn-cyber" style="padding: 10px 20px; font-size: 0.9rem;">
            ⚡ INJECT ALL DETECTED (${detectedCount})
          </button>
          <button id="rescanHarnessesBtn" class="btn-secondary" style="padding: 10px 16px; font-size: 0.9rem;">
            🔄 RESCAN
          </button>
        </div>
      </div>

      <!-- Harness Cards Grid -->
      <div class="harness-grid">
        ${harnesses.map(h => {
          const detection = detectedMap.get(h.id);
          const isDetected = !!detection;
          const isInjected = h.status === 'injected';
          const isPartial = h.status === 'partial';

          let statusBadgeClass = 'not-detected';
          let statusText = 'NOT DETECTED';
          if (isInjected) {
            statusBadgeClass = 'injected';
            statusText = '✓ INJECTED';
          } else if (isPartial) {
            statusBadgeClass = 'partial';
            statusText = '⚠ PARTIAL';
          } else if (isDetected) {
            statusBadgeClass = 'detected';
            statusText = 'DETECTED';
          }

          const pathsList = (detection?.paths || []).map(p => `<code>${this.escapeHtml(p)}</code>`).join(' ') || '<span style="color: var(--text-dim);">No active config signature</span>';

          return `
            <div class="harness-card">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <div>
                    <div style="font-family: var(--font-hud); font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(h.name)}</div>
                    <div style="font-size: 0.8rem; color: var(--neon-cyan); font-family: var(--font-mono);">${this.escapeHtml(h.vendor)}</div>
                  </div>
                  <span class="harness-status-pill ${statusBadgeClass}">${statusText}</span>
                </div>
                
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 14px; min-height: 40px;">
                  ${this.escapeHtml(h.description || 'Configures agent MCP server and injects governance rules')}
                </p>

                <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; margin-bottom: 16px; font-size: 0.78rem;">
                  <div style="color: var(--text-dim); margin-bottom: 4px; font-size: 0.72rem; text-transform: uppercase;">Workspace Targets:</div>
                  <div style="word-break: break-all;">${pathsList}</div>
                </div>
              </div>

              <div style="display: flex; gap: 8px; justify-content: flex-end; padding-top: 14px; border-top: 1px solid var(--border-dim);">
                ${isInjected ? `
                  <button class="btn-cyber inject-single-btn" data-id="${h.id}" data-force="true" style="padding: 6px 14px; font-size: 0.8rem;">
                    🔄 RE-SYNC RULES
                  </button>
                  <button class="btn-secondary remove-single-btn" data-id="${h.id}" style="padding: 6px 12px; font-size: 0.8rem; color: var(--neon-rose);">
                    UNINSTALL
                  </button>
                ` : `
                  <button class="btn-cyber inject-single-btn" data-id="${h.id}" data-force="false" style="padding: 6px 16px; font-size: 0.82rem; ${isDetected ? 'box-shadow: 0 0 12px var(--neon-cyan-glow);' : ''}">
                    ⚡ INJECT HARNESS
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Offline MCP Specification Banner -->
      <div class="mcp-hub-banner glass-panel">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-family: var(--font-hud); font-size: 1.3rem; font-weight: 700; color: var(--neon-cyan);">
              📡 OFFLINE MODEL CONTEXT PROTOCOL (MCP) INTEGRATION
            </div>
            <div style="color: var(--text-secondary); font-size: 0.85rem;">
              MCP 2024-11-05 Specification Compliant &bull; Zero Cloud Calls &bull; Zero External Telemetry
            </div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-emerald); background: rgba(16, 185, 129, 0.15); border: 1px solid var(--neon-emerald); padding: 4px 10px; border-radius: 6px;">
            ● 37 MCP Tools Active &bull; 11 Resources
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 16px;">
          <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px;">
            <div style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--neon-cyan); margin-bottom: 6px; text-transform: uppercase;">
              Stdio Transport Command (Cursor / Codex / Claude Desktop / Windsurf):
            </div>
            <pre style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-primary); margin: 0; user-select: all; overflow-x: auto;"><code>node ./skyhook/cli/skyhook-mcp.js --dir .</code></pre>
          </div>

          <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px;">
            <div style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--neon-cyan); margin-bottom: 6px; text-transform: uppercase;">
              Local SSE Transport (Loopback 127.0.0.1):
            </div>
            <pre style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-primary); margin: 0; user-select: all; overflow-x: auto;"><code>http://127.0.0.1:3000/sse</code></pre>
          </div>
        </div>
      </div>
    `;
  }

  async postRender() {
    if (!this.detectData || !this.statusData) {
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

    // Inject All Detected
    const injectAllBtn = this.container.querySelector('#injectAllHarnessesBtn');
    if (injectAllBtn) {
      injectAllBtn.addEventListener('click', async () => {
        try {
          const res = await this.bridge.post('/api/action/inject-harness', { targets: 'auto' });
          if (res.success) {
            Toast.show(`Injected ${res.injected?.length || 0} detected harness(es)`, 'success');
            await this.fetchData();
          }
        } catch (err) {
          Toast.show(`Injection failed: ${err.message}`, 'error');
        }
      });
    }

    // Rescan
    const rescanBtn = this.container.querySelector('#rescanHarnessesBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', async () => {
        await this.fetchData();
        Toast.show('Agent detection scan updated', 'info');
      });
    }

    // Single Inject / Re-sync
    const injectBtns = this.container.querySelectorAll('.inject-single-btn');
    injectBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const force = btn.dataset.force === 'true';
        try {
          await this.bridge.post('/api/action/inject-harness', { targets: [id], force });
          Toast.show(`Configured harness for ${id}`, 'success');
          await this.fetchData();
        } catch (err) {
          Toast.show(`Failed to configure harness: ${err.message}`, 'error');
        }
      });
    });

    // Remove
    const removeBtns = this.container.querySelectorAll('.remove-single-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm(`Are you sure you want to remove Skyhook configurations from ${id}?`)) return;
        try {
          await this.bridge.post('/api/action/remove-harness', { targets: [id] });
          Toast.show(`Removed harness configuration for ${id}`, 'info');
          await this.fetchData();
        } catch (err) {
          Toast.show(`Failed to remove harness: ${err.message}`, 'error');
        }
      });
    });
  }

  async fetchData() {
    try {
      const [detectRes, statusRes] = await Promise.all([
        this.bridge.get('/api/harness/detect'),
        this.bridge.get('/api/harness/status')
      ]);
      this.detectData = detectRes;
      this.statusData = statusRes;
      if (this.container) {
        this.container.innerHTML = this.render();
        this.bindEvents();
      }
    } catch (err) {
      Toast.show(`Failed to load harness data: ${err.message}`, 'error');
    }
  }
}
