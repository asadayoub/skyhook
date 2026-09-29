/**
 * ADRModal - Interactive Architectural Decision Authoring & Editing Modal
 * Guided decision drafting with alternatives, consequences, and auto-markdown rendering.
 */

import { Toast } from './Toast.js';

export class ADRModal {
  /**
   * @param {Object} options
   * @param {import('../core/Bridge.js').Bridge} options.bridge
   * @param {import('../core/Store.js').Store} options.store
   * @param {Function} [options.onSaved]
   */
  constructor(options = {}) {
    this.bridge = options.bridge;
    this.store = options.store;
    this.onSaved = options.onSaved || null;
    this.modalEl = null;
    this.currentADR = null;
  }

  open(adr = null) {
    this.currentADR = adr;
    this.render();
  }

  render() {
    this.close();

    const isEdit = !!this.currentADR;
    const adr = this.currentADR || {
      id: '',
      title: '',
      status: 'accepted',
      category: 'Architecture',
      context: '',
      decision: '',
      consequencesPositive: 'Standardized architecture pattern across services.',
      consequencesNegative: 'Requires initial developer adaptation.',
      alternatives: ''
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999';

    overlay.innerHTML = `
      <div class="glass-panel modal-container" style="max-width: 640px; width: 92vw; padding: 28px; position: relative; max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.3rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>${isEdit ? '⚖️ EDIT DECISION' : '➕ DRAFT ARCHITECTURAL DECISION (ADR)'}</span>
            ${isEdit ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-cyan);">${adr.id}</span>` : ''}
          </h3>
          <button class="modal-close" style="background: transparent; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>

        <form class="modal-form" id="adrForm">
          <div class="form-group">
            <label class="form-label">Decision Title *</label>
            <input type="text" class="form-input" id="adrTitle" required value="${this.escapeHtml(adr.title)}" placeholder="e.g. Adopt SQLite for Local Multi-Tenant Storage" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="adrStatus">
                <option value="proposed" ${adr.status === 'proposed' ? 'selected' : ''}>Proposed</option>
                <option value="under-review" ${adr.status === 'under-review' ? 'selected' : ''}>Under Review</option>
                <option value="accepted" ${adr.status === 'accepted' ? 'selected' : ''}>Accepted</option>
                <option value="deprecated" ${adr.status === 'deprecated' ? 'selected' : ''}>Deprecated</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Category</label>
              <input type="text" class="form-input" id="adrCategory" value="${this.escapeHtml(adr.category || 'Architecture')}" placeholder="e.g. Database, Security, API" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Context & Problem Statement *</label>
            <textarea class="form-textarea" id="adrContext" required placeholder="What is the problem we are trying to solve?">${this.escapeHtml(adr.context || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Decision & Technical Commitment *</label>
            <textarea class="form-textarea" id="adrDecision" required placeholder="What architectural choice was made and why?">${this.escapeHtml(adr.decision || '')}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Positive Consequences</label>
              <textarea class="form-textarea" style="min-height: 60px;" id="adrPos" placeholder="One advantage per line">${this.escapeHtml(adr.consequencesPositive || '')}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Trade-offs & Negatives</label>
              <textarea class="form-textarea" style="min-height: 60px;" id="adrNeg" placeholder="One trade-off per line">${this.escapeHtml(adr.consequencesNegative || '')}</textarea>
            </div>
          </div>

          <div class="form-actions" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
            ${isEdit ? `
              <button type="button" id="deleteADRBtn" class="btn-secondary" style="color: var(--neon-rose); border-color: rgba(244, 63, 94, 0.4);">
                🗑️ Delete ADR
              </button>
            ` : '<div></div>'}

            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn-secondary modal-cancel">Cancel</button>
              <button type="submit" class="btn-cyber">
                ${isEdit ? 'UPDATE DECISION' : 'DRAFT & COMMIT ADR'}
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const form = overlay.querySelector('#adrForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.save();
    });

    const deleteBtn = overlay.querySelector('#deleteADRBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete ADR ${adr.id}?`)) {
          await this.remove();
        }
      });
    }
  }

  async save() {
    const skyhookDir = this.store.getState().projectData?.skyhookDir;
    const title = this.modalEl.querySelector('#adrTitle').value.trim();
    const status = this.modalEl.querySelector('#adrStatus').value;
    const category = this.modalEl.querySelector('#adrCategory').value.trim();
    const context = this.modalEl.querySelector('#adrContext').value.trim();
    const decision = this.modalEl.querySelector('#adrDecision').value.trim();
    const pos = this.modalEl.querySelector('#adrPos').value.split('\n').filter(Boolean);
    const neg = this.modalEl.querySelector('#adrNeg').value.split('\n').filter(Boolean);

    if (!title || !context || !decision) {
      Toast.show('Title, context, and decision are required', 'error');
      return;
    }

    try {
      if (this.currentADR) {
        const resp = await this.bridge.post('/api/crud/adr', {
          skyhookDir,
          adrId: this.currentADR.id,
          updates: { title, status, category }
        }, 'PUT');

        if (resp.error) throw new Error(resp.error);
        Toast.show(`Decision ${this.currentADR.id} updated!`, 'success');
      } else {
        const resp = await this.bridge.post('/api/crud/adr', {
          skyhookDir,
          adr: {
            title,
            status,
            category,
            context,
            decision,
            consequences: { positive: pos, negative: neg }
          }
        });

        if (resp.error) throw new Error(resp.error);
        Toast.show(`ADR ${resp.adr?.id || ''} created & indexed!`, 'success');
      }

      this.close();
      if (typeof this.onSaved === 'function') this.onSaved();
    } catch (err) {
      Toast.show(`Failed to save ADR: ${err.message}`, 'error');
    }
  }

  async remove() {
    if (!this.currentADR) return;
    const skyhookDir = this.store.getState().projectData?.skyhookDir;

    try {
      const resp = await this.bridge.post('/api/crud/adr', {
        skyhookDir,
        adrId: this.currentADR.id
      }, 'DELETE');

      if (resp.error) throw new Error(resp.error);
      Toast.show(`ADR ${this.currentADR.id} deleted`, 'success');
      this.close();
      if (typeof this.onSaved === 'function') this.onSaved();
    } catch (err) {
      Toast.show(`Failed to delete ADR: ${err.message}`, 'error');
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    this.currentADR = null;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
