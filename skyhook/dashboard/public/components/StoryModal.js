/**
 * StoryModal - Interactive CRUD Dialog for Backlog Stories
 * Allows creating, updating, assigning points, and deleting stories with atomic locking.
 */

import { Toast } from './Toast.js';

export class StoryModal {
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
    this.currentStory = null;
  }

  /**
   * Open modal to create a new story or edit an existing one
   * @param {Object} [story=null]
   * @param {string} [initialStatus='backlog']
   */
  open(story = null, initialStatus = 'backlog') {
    this.currentStory = story;
    this.render(initialStatus);
  }

  render(initialStatus = 'backlog') {
    this.close();

    const d = this.store.getState().projectData || {};
    const epics = Array.isArray(d.backlog?.epics) ? d.backlog.epics : [];
    const isEdit = !!this.currentStory;
    const story = this.currentStory || {
      id: '',
      title: '',
      description: '',
      epicId: epics[0]?.id || 'EPIC-001',
      status: initialStatus,
      storyPoints: 3,
      priority: 'medium'
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999';

    overlay.innerHTML = `
      <div class="glass-panel modal-container" style="max-width: 580px; width: 90vw; padding: 28px; position: relative;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.3rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>${isEdit ? '⚡ EDIT STORY' : '➕ CREATE STORY'}</span>
            ${isEdit ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-cyan);">${story.id}</span>` : ''}
          </h3>
          <button class="modal-close" style="background: transparent; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>

        <form class="modal-form" id="storyForm">
          <div class="form-group">
            <label class="form-label">Story Title *</label>
            <input type="text" class="form-input" id="storyTitle" required value="${this.escapeHtml(story.title)}" placeholder="e.g. Implement real-time WebSocket reconnect logic" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Parent Epic</label>
              <select class="form-select" id="storyEpic">
                ${epics.map(e => `
                  <option value="${e.id}" ${story.epicId === e.id ? 'selected' : ''}>
                    ${this.escapeHtml(e.title || e.id)} (${e.id})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="storyStatus">
                <option value="backlog" ${story.status === 'backlog' ? 'selected' : ''}>Backlog</option>
                <option value="ready" ${story.status === 'ready' ? 'selected' : ''}>Ready</option>
                <option value="in-progress" ${story.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                <option value="in-review" ${story.status === 'in-review' ? 'selected' : ''}>In Review</option>
                <option value="done" ${story.status === 'done' ? 'selected' : ''}>Done</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Story Points (Fibonacci)</label>
              <select class="form-select" id="storyPoints">
                ${[1, 2, 3, 5, 8, 13, 21].map(pts => `
                  <option value="${pts}" ${Number(story.storyPoints) === pts ? 'selected' : ''}>${pts} points</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Priority</label>
              <select class="form-select" id="storyPriority">
                <option value="low" ${story.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${story.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${story.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="critical" ${story.priority === 'critical' ? 'selected' : ''}>Critical</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Description / Acceptance Criteria</label>
            <textarea class="form-textarea" id="storyDescription" placeholder="Given... When... Then...">${this.escapeHtml(story.description || '')}</textarea>
          </div>

          <div class="form-actions" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
            ${isEdit ? `
              <button type="button" id="deleteStoryBtn" class="btn-secondary" style="color: var(--neon-rose); border-color: rgba(244, 63, 94, 0.4);">
                🗑️ Delete Story
              </button>
            ` : '<div></div>'}

            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn-secondary modal-cancel">Cancel</button>
              <button type="submit" class="btn-cyber">
                ${isEdit ? 'SAVE CHANGES' : 'CREATE STORY'}
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    // Bind close
    overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
    overlay.querySelector('.modal-cancel').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // Bind form submit
    const form = overlay.querySelector('#storyForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.save();
    });

    // Bind delete
    const deleteBtn = overlay.querySelector('#deleteStoryBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete story ${story.id}?`)) {
          await this.remove();
        }
      });
    }
  }

  async save() {
    const skyhookDir = this.store.getState().projectData?.skyhookDir;
    const title = this.modalEl.querySelector('#storyTitle').value.trim();
    const epicId = this.modalEl.querySelector('#storyEpic').value;
    const status = this.modalEl.querySelector('#storyStatus').value;
    const storyPoints = Number(this.modalEl.querySelector('#storyPoints').value);
    const priority = this.modalEl.querySelector('#storyPriority').value;
    const description = this.modalEl.querySelector('#storyDescription').value.trim();

    if (!title) {
      Toast.show('Story title is required', 'error');
      return;
    }

    try {
      if (this.currentStory) {
        // Update
        const resp = await this.bridge.post('/api/crud/story', {
          skyhookDir,
          storyId: this.currentStory.id,
          updates: { title, epicId, status, storyPoints, priority, description }
        }, 'PUT');

        if (resp.error) throw new Error(resp.error);
        Toast.show(`Story ${this.currentStory.id} updated!`, 'success');
      } else {
        // Create
        const resp = await this.bridge.post('/api/crud/story', {
          skyhookDir,
          story: { title, epicId, status, storyPoints, priority, description }
        });

        if (resp.error) throw new Error(resp.error);
        Toast.show(`Story ${resp.story?.id || ''} created!`, 'success');
      }

      this.close();
      if (typeof this.onSaved === 'function') this.onSaved();
    } catch (err) {
      Toast.show(`Failed to save story: ${err.message}`, 'error');
    }
  }

  async remove() {
    if (!this.currentStory) return;
    const skyhookDir = this.store.getState().projectData?.skyhookDir;

    try {
      const resp = await this.bridge.post('/api/crud/story', {
        skyhookDir,
        storyId: this.currentStory.id
      }, 'DELETE');

      if (resp.error) throw new Error(resp.error);
      Toast.show(`Story ${this.currentStory.id} deleted`, 'success');
      this.close();
      if (typeof this.onSaved === 'function') this.onSaved();
    } catch (err) {
      Toast.show(`Failed to delete story: ${err.message}`, 'error');
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    this.currentStory = null;
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
