/**
 * TaskModal - Interactive CRUD Dialog for Fine-Grained Tasks & Subtasks
 * Allows creating, editing, and managing subtask checklists and target files for tasks.
 */

import { Toast } from './Toast.js';

export class TaskModal {
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
    this.currentTask = null;
    this.subtasksList = [];
  }

  /**
   * Open modal to create a new task or edit an existing one
   * @param {Object} [task=null]
   * @param {string} [defaultParentId=null]
   * @param {string} [defaultParentType='story']
   */
  open(task = null, defaultParentId = null, defaultParentType = 'story') {
    this.currentTask = task;
    this.subtasksList = task && Array.isArray(task.subtasks)
      ? JSON.parse(JSON.stringify(task.subtasks))
      : [];
    this.render(defaultParentId, defaultParentType);
  }

  render(defaultParentId = null, defaultParentType = 'story') {
    this.close();

    const d = this.store.getState().projectData || {};
    const stories = Array.isArray(d.backlog?.stories) ? d.backlog.stories : [];
    const epics = Array.isArray(d.backlog?.epics) ? d.backlog.epics : [];

    const isEdit = !!this.currentTask;
    const task = this.currentTask || {
      id: '',
      title: '',
      description: '',
      parentId: defaultParentId || (stories[0]?.id || epics[0]?.id || ''),
      parentType: defaultParentType,
      type: 'feature',
      status: 'ready',
      priority: 'medium',
      storyPoints: 1,
      estimatedMinutes: 60,
      targetFiles: [],
      subtasks: []
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999';

    overlay.innerHTML = `
      <div class="glass-panel modal-container" style="max-width: 620px; width: 92vw; max-height: 88vh; overflow-y: auto; padding: 26px; position: relative;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.25rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>${isEdit ? '⚡ EDIT TASK' : '➕ CREATE TASK'}</span>
            ${isEdit ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-cyan);">${task.id}</span>` : ''}
          </h3>
          <button class="modal-close" style="background: transparent; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>

        <form class="modal-form" id="taskForm">
          <div class="form-group">
            <label class="form-label">Task Title *</label>
            <input type="text" class="form-input" id="taskTitle" required value="${this.escapeHtml(task.title)}" placeholder="e.g. Implement refresh token rotation handler" />
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px;">
            <div class="form-group">
              <label class="form-label">Parent (Story or Epic) *</label>
              <select class="form-select" id="taskParent">
                <optgroup label="User Stories">
                  ${stories.map(s => `
                    <option value="story:${s.id}" ${(task.parentId === s.id) ? 'selected' : ''}>
                      [${s.id}] ${this.escapeHtml(s.title)}
                    </option>
                  `).join('')}
                </optgroup>
                <optgroup label="Epics / Spikes">
                  ${epics.map(e => `
                    <option value="epic:${e.id}" ${(task.parentId === e.id) ? 'selected' : ''}>
                      [${e.id}] ${this.escapeHtml(e.title)}
                    </option>
                  `).join('')}
                </optgroup>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Task Type</label>
              <select class="form-select" id="taskType">
                <option value="feature" ${task.type === 'feature' ? 'selected' : ''}>Feature</option>
                <option value="bug" ${task.type === 'bug' ? 'selected' : ''}>Bug Fix</option>
                <option value="chore" ${task.type === 'chore' ? 'selected' : ''}>Chore</option>
                <option value="spike" ${task.type === 'spike' ? 'selected' : ''}>Spike</option>
                <option value="test" ${task.type === 'test' ? 'selected' : ''}>Test Suite</option>
                <option value="refactor" ${task.type === 'refactor' ? 'selected' : ''}>Refactor</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-select" id="taskStatus">
                <option value="backlog" ${task.status === 'backlog' ? 'selected' : ''}>Backlog</option>
                <option value="ready" ${task.status === 'ready' ? 'selected' : ''}>Ready</option>
                <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                <option value="in-review" ${task.status === 'in-review' ? 'selected' : ''}>In Review</option>
                <option value="done" ${task.status === 'done' ? 'selected' : ''}>Done</option>
                <option value="blocked" ${task.status === 'blocked' ? 'selected' : ''}>Blocked</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Priority</label>
              <select class="form-select" id="taskPriority">
                <option value="critical" ${task.priority === 'critical' ? 'selected' : ''}>Critical</option>
                <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Points / Est. Min</label>
              <div style="display: flex; gap: 6px;">
                <input type="number" class="form-input" id="taskPoints" style="width: 50%;" value="${task.storyPoints || 1}" placeholder="Pts" min="0" />
                <input type="number" class="form-input" id="taskEstMinutes" style="width: 50%;" value="${task.estimatedMinutes || 60}" placeholder="Mins" min="0" />
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Target Source Files (Conflict Prevention)</label>
            <input type="text" class="form-input" id="taskTargetFiles" value="${Array.isArray(task.targetFiles) ? this.escapeHtml(task.targetFiles.join(', ')) : ''}" placeholder="e.g. lib/auth/token.js, test/auth.test.js (comma-separated)" />
            <span style="font-size: 0.72rem; color: var(--text-dim); margin-top: 3px; display: block;">
              Protects parallel AI agents from overwriting the same files simultaneously.
            </span>
          </div>

          <div class="form-group">
            <label class="form-label">Detailed Scope / Instructions</label>
            <textarea class="form-textarea" id="taskDescription" rows="2" placeholder="Specific technical steps, invariants, or edge cases to consider...">${this.escapeHtml(task.description || '')}</textarea>
          </div>

          <!-- Subtasks Checklist Section -->
          <div class="form-group" style="border: 1px solid var(--border-neon); border-radius: 6px; padding: 12px; background: rgba(0, 240, 255, 0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label class="form-label" style="margin: 0; color: var(--neon-cyan);">Definition of Done Checklist (Subtasks)</label>
              <span id="subtaskProgressBadge" style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-secondary);">
                ${this.subtasksList.filter(s => s.completed).length}/${this.subtasksList.length} completed
              </span>
            </div>
            
            <div id="subtasksContainer" style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto; margin-bottom: 8px;">
              ${this.renderSubtaskListHtml()}
            </div>

            <div style="display: flex; gap: 6px;">
              <input type="text" class="form-input" id="newSubtaskTitle" placeholder="Add a checklist item (e.g. Write unit test)..." style="font-size: 0.8rem; padding: 4px 8px;" />
              <button type="button" id="addSubtaskBtn" class="btn-cyber" style="padding: 4px 12px; font-size: 0.75rem; white-space: nowrap;">+ ADD</button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 14px;">
            ${isEdit ? `
              <button type="button" id="deleteTaskBtn" style="background: rgba(255,0,85,0.15); border: 1px solid var(--neon-rose); color: var(--neon-rose); padding: 7px 14px; border-radius: 4px; font-family: var(--font-hud); font-size: 0.75rem; cursor: pointer;">
                🗑 DELETE TASK
              </button>
            ` : '<div></div>'}

            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn-cancel modal-close" style="padding: 7px 16px; font-size: 0.8rem;">Cancel</button>
              <button type="submit" class="btn-cyber" id="saveTaskBtn" style="padding: 7px 20px; font-size: 0.8rem;">
                💾 ${isEdit ? 'UPDATE TASK' : 'CREATE TASK'}
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;
    this.bindEvents(isEdit, task);
  }

  renderSubtaskListHtml() {
    if (this.subtasksList.length === 0) {
      return `<div style="color: var(--text-dim); font-size: 0.75rem; padding: 4px 0;">No subtasks added yet.</div>`;
    }
    return this.subtasksList.map((s, idx) => `
      <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; font-size: 0.8rem; color: ${s.completed ? 'var(--text-dim)' : 'var(--text-primary)'}; text-decoration: ${s.completed ? 'line-through' : 'none'};">
          <input type="checkbox" class="subtask-checkbox" data-index="${idx}" ${s.completed ? 'checked' : ''} />
          <span>${this.escapeHtml(s.title)}</span>
        </label>
        <button type="button" class="delete-subtask-btn" data-index="${idx}" style="background: none; border: none; color: var(--neon-rose); cursor: pointer; font-size: 0.85rem; padding: 0 4px;">&times;</button>
      </div>
    `).join('');
  }

  bindEvents(isEdit, existingTask) {
    if (!this.modalEl) return;

    // Close buttons
    const closeBtns = this.modalEl.querySelectorAll('.modal-close');
    closeBtns.forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    }));

    // Overlay click outside
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    // Subtask add button
    const addSubBtn = this.modalEl.querySelector('#addSubtaskBtn');
    const newSubInput = this.modalEl.querySelector('#newSubtaskTitle');
    const handleAddSub = () => {
      const title = newSubInput.value.trim();
      if (!title) return;
      this.subtasksList.push({
        id: `SUB-${String(this.subtasksList.length + 1).padStart(3, '0')}`,
        title,
        completed: false,
        createdAt: new Date().toISOString()
      });
      newSubInput.value = '';
      this.refreshSubtasksView();
    };

    if (addSubBtn && newSubInput) {
      addSubBtn.addEventListener('click', handleAddSub);
      newSubInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddSub();
        }
      });
    }

    this.bindSubtaskRowEvents();

    // Delete task button
    const delBtn = this.modalEl.querySelector('#deleteTaskBtn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to delete task ${existingTask.id}?`)) return;
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        try {
          await this.bridge.fetchApi('/api/crud/task', {
            method: 'DELETE',
            body: JSON.stringify({ skyhookDir, taskId: existingTask.id })
          });
          Toast.show(`Task ${existingTask.id} deleted`, 'success');
          this.close();
          if (this.onSaved) this.onSaved();
        } catch (err) {
          Toast.show(`Delete failed: ${err.message}`, 'error');
        }
      });
    }

    // Save form submit
    const form = this.modalEl.querySelector('#taskForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = this.modalEl.querySelector('#taskTitle').value.trim();
      const parentVal = this.modalEl.querySelector('#taskParent').value;
      const [parentType, parentId] = parentVal.split(':');
      const type = this.modalEl.querySelector('#taskType').value;
      const status = this.modalEl.querySelector('#taskStatus').value;
      const priority = this.modalEl.querySelector('#taskPriority').value;
      const storyPoints = Number(this.modalEl.querySelector('#taskPoints').value) || 1;
      const estimatedMinutes = Number(this.modalEl.querySelector('#taskEstMinutes').value) || 60;
      const description = this.modalEl.querySelector('#taskDescription').value.trim();
      const targetFilesRaw = this.modalEl.querySelector('#taskTargetFiles').value.trim();
      const targetFiles = targetFilesRaw ? targetFilesRaw.split(',').map(f => f.trim()).filter(Boolean) : [];

      const skyhookDir = this.store.getState().projectData?.skyhookDir;

      try {
        if (isEdit) {
          await this.bridge.fetchApi('/api/crud/task', {
            method: 'PUT',
            body: JSON.stringify({
              skyhookDir,
              taskId: existingTask.id,
              updates: {
                title,
                parentId,
                parentType,
                type,
                status,
                priority,
                storyPoints,
                estimatedMinutes,
                description,
                targetFiles,
                subtasks: this.subtasksList
              }
            })
          });
          Toast.show(`Task ${existingTask.id} updated`, 'success');
        } else {
          await this.bridge.fetchApi('/api/crud/task', {
            method: 'POST',
            body: JSON.stringify({
              skyhookDir,
              task: {
                title,
                parentId,
                parentType,
                type,
                status,
                priority,
                storyPoints,
                estimatedMinutes,
                description,
                targetFiles,
                subtasks: this.subtasksList
              }
            })
          });
          Toast.show('Task created successfully', 'success');
        }

        this.close();
        if (this.onSaved) this.onSaved();
      } catch (err) {
        Toast.show(`Save failed: ${err.message}`, 'error');
      }
    });
  }

  bindSubtaskRowEvents() {
    if (!this.modalEl) return;
    const container = this.modalEl.querySelector('#subtasksContainer');
    if (!container) return;

    // Checkbox toggles
    container.querySelectorAll('.subtask-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(cb.dataset.index, 10);
        if (this.subtasksList[idx]) {
          this.subtasksList[idx].completed = e.target.checked;
          this.refreshSubtasksView();
        }
      });
    });

    // Delete buttons
    container.querySelectorAll('.delete-subtask-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.index, 10);
        this.subtasksList.splice(idx, 1);
        this.refreshSubtasksView();
      });
    });
  }

  refreshSubtasksView() {
    if (!this.modalEl) return;
    const container = this.modalEl.querySelector('#subtasksContainer');
    const badge = this.modalEl.querySelector('#subtaskProgressBadge');
    if (container) {
      container.innerHTML = this.renderSubtaskListHtml();
      this.bindSubtaskRowEvents();
    }
    if (badge) {
      const completedCount = this.subtasksList.filter(s => s.completed).length;
      badge.textContent = `${completedCount}/${this.subtasksList.length} completed`;
    }
  }

  close() {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
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
