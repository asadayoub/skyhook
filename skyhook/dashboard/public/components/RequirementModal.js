/**
 * RequirementModal - Interactive CRUD Dialog for Product & Architectural Requirements
 * Allows creating, editing, and deleting functional/non-functional requirements with file locking.
 */

import { Toast } from './Toast.js';

export class RequirementModal {
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
    this.currentReq = null;
  }

  open(req = null, defaultType = 'functional') {
    this.currentReq = req;
    this.render(defaultType);
  }

  render(defaultType = 'functional') {
    this.close();

    const isEdit = !!this.currentReq;
    const req = this.currentReq || {
      id: '',
      title: '',
      statement: '',
      type: defaultType,
      priority: 'high',
      status: 'draft'
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999';

    overlay.innerHTML = `
      <div class="glass-panel modal-container" style="max-width: 580px; width: 90vw; padding: 28px; position: relative;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.3rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>${isEdit ? '📋 EDIT REQUIREMENT' : '➕ CREATE REQUIREMENT'}</span>
            ${isEdit ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-cyan);">${this.escapeHtml(req.id)}</span>` : ''}
          </h3>
          <button class="modal-close" style="background: transparent; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>

        <form class="modal-form" id="reqForm">
          ${isEdit ? `<input type="hidden" name="id" value="${this.escapeHtml(req.id)}">` : `
            <div class="form-group">
              <label class="form-label">Requirement ID (e.g. REQ-F-001)</label>
              <input type="text" name="id" class="form-input" placeholder="REQ-F-..." value="${this.escapeHtml(req.id)}">
              <span style="font-size: 0.72rem; color: var(--text-dim);">Leave empty to auto-generate based on type.</span>
            </div>
          `}

          <div class="form-group">
            <label class="form-label">Requirement Title *</label>
            <input type="text" name="title" class="form-input" placeholder="e.g. Automated Session Invalidation" value="${this.escapeHtml(req.title || '')}" required>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Requirement Type</label>
              <select name="type" class="form-select">
                <option value="functional" ${(req.type || defaultType) === 'functional' ? 'selected' : ''}>Functional</option>
                <option value="non-functional" ${(req.type || defaultType) === 'non-functional' ? 'selected' : ''}>Non-Functional</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Priority</label>
              <select name="priority" class="form-select">
                <option value="critical" ${req.priority === 'critical' ? 'selected' : ''}>Critical</option>
                <option value="high" ${req.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="medium" ${req.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="low" ${req.priority === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Status</label>
              <select name="status" class="form-select">
                <option value="draft" ${req.status === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="approved" ${req.status === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="implemented" ${req.status === 'implemented' ? 'selected' : ''}>Implemented</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Requirement Statement / Specification</label>
            <textarea name="statement" class="form-textarea" rows="4" placeholder="Detailed requirement statement...">${this.escapeHtml(req.statement || req.description || '')}</textarea>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-dim);">
            ${isEdit ? `
              <button type="button" id="deleteReqBtn" class="btn-secondary" style="color: var(--neon-rose); border-color: rgba(244,63,94,0.3); font-size: 0.8rem;">
                🗑️ Delete Requirement
              </button>
            ` : '<div></div>'}
            
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn-secondary modal-cancel-btn" style="font-size: 0.85rem;">Cancel</button>
              <button type="submit" class="btn-cyber" style="font-size: 0.85rem; padding: 8px 20px;">
                ${isEdit ? 'Save Changes' : 'Create Requirement'}
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;
    this.bindEvents(overlay, isEdit);
  }

  bindEvents(overlay, isEdit) {
    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('.modal-cancel-btn');
    const form = overlay.querySelector('#reqForm');
    const deleteBtn = overlay.querySelector('#deleteReqBtn');

    const handleClose = () => this.close();
    closeBtn?.addEventListener('click', handleClose);
    cancelBtn?.addEventListener('click', handleClose);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handleClose();
    });

    if (deleteBtn && isEdit && this.currentReq) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to delete requirement "${this.currentReq.id}"?`)) return;
        try {
          const skyhookDir = this.store.getState().projectData?.skyhookDir;
          const resp = await this.bridge.call('delete-requirement', {
            skyhookDir,
            requirementId: this.currentReq.id,
            type: this.currentReq.type || 'functional'
          });
          if (resp?.error) {
            Toast.show(`Delete failed: ${resp.error}`, 'error');
            return;
          }
          Toast.show(`Requirement ${this.currentReq.id} deleted`, 'info');
          this.close();
          if (this.onSaved) this.onSaved();
        } catch (err) {
          Toast.show(`Error deleting requirement: ${err.message}`, 'error');
        }
      });
    }

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const skyhookDir = this.store.getState().projectData?.skyhookDir;

      try {
        let resp;
        if (isEdit) {
          resp = await this.bridge.call('update-requirement', {
            skyhookDir,
            requirementId: this.currentReq.id,
            type: data.type || 'functional',
            updates: {
              title: data.title,
              statement: data.statement,
              priority: data.priority,
              status: data.status
            }
          });
          if (resp?.error) {
            Toast.show(`Update failed: ${resp.error}`, 'error');
            return;
          }
          Toast.show(`Requirement ${this.currentReq.id} updated!`, 'success');
        } else {
          resp = await this.bridge.call('create-requirement', {
            skyhookDir,
            type: data.type || 'functional',
            requirement: {
              id: data.id ? data.id.trim() : undefined,
              title: data.title,
              statement: data.statement,
              priority: data.priority,
              status: data.status
            }
          });
          if (resp?.error) {
            Toast.show(`Creation failed: ${resp.error}`, 'error');
            return;
          }
          Toast.show(`Requirement created successfully!`, 'success');
        }

        this.close();
        if (this.onSaved) this.onSaved();
      } catch (err) {
        Toast.show(`Requirement error: ${err.message}`, 'error');
      }
    });
  }

  close() {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }

  destroy() {
    this.close();
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
