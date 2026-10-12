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

    const isCompleted = ['done', 'implemented', 'verified'].includes(task.status);
    const isVerified = task.verificationStatus === 'verified' || 
      (task.evidence && (task.evidence.automatedChecks?.exitCode === 0 || task.evidence.commitHash));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999';

    overlay.innerHTML = `
      <div class="glass-panel modal-container" style="max-width: 620px; width: 92vw; max-height: 88vh; overflow-y: auto; padding: 26px; position: relative;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
          <h3 style="font-family: var(--font-hud); font-size: 1.25rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <span>${isEdit ? '⚡ EDIT TASK' : '➕ CREATE TASK'}</span>
            ${isEdit ? `<span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-cyan);">${task.id}</span>` : ''}
            ${isEdit && isCompleted ? (isVerified ? `
              <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--neon-emerald); border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">
                🛡️ VERIFIED
              </span>
            ` : `
              <span class="badge" style="background: rgba(244, 63, 94, 0.15); color: var(--neon-rose); border: 1px solid rgba(244, 63, 94, 0.3); font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">
                ⚠️ UNVERIFIED
              </span>
            `) : ''}
          </h3>
          <button class="modal-close" style="background: transparent; border: none; color: var(--text-dim); font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>

        ${isEdit && isCompleted && !isVerified ? `
          <div style="margin-bottom: 14px; padding: 10px 14px; background: rgba(244, 63, 94, 0.1); border: 1px solid var(--neon-rose); border-radius: 6px; color: var(--neon-rose); font-size: 0.8rem; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span>
            <div><strong>Definition of Done:</strong> Completed work requires automated test proof or git commit hash attached.</div>
          </div>
        ` : ''}

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
          <div class="form-group" style="border: 1px solid var(--border-neon); border-radius: 6px; padding: 12px; background: rgba(0, 240, 255, 0.02); margin-bottom: 14px;">
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

          <!-- Evidence & Verification Proof Drawer -->
          <div class="form-group" style="border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 14px; background: rgba(168, 85, 247, 0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <label class="form-label" style="margin: 0; color: var(--neon-violet); display: flex; align-items: center; gap: 6px;">
                <span>🛡️</span> EVIDENCE &amp; VERIFICATION PROOF
              </label>
              ${task.evidence ? `
                <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--neon-emerald);">
                  PROOF ATTACHED
                </span>
              ` : `
                <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim);">
                  NO PROOF ATTACHED
                </span>
              `}
            </div>

            ${task.evidence ? `
              <!-- Active Evidence Display -->
              <div id="activeEvidenceDisplay" style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 0.8rem;">
                ${task.evidence.commitHash ? `
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: var(--text-dim);">Git Commit:</span>
                    <span style="font-family: var(--font-mono); color: var(--neon-cyan); background: rgba(0, 240, 255, 0.1); padding: 1px 6px; border-radius: 3px;">
                      ${this.escapeHtml(task.evidence.commitHash)}
                    </span>
                  </div>
                ` : ''}
                ${task.evidence.automatedChecks ? `
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: var(--text-dim);">Test Command:</span>
                    <span style="font-family: var(--font-mono); color: var(--text-primary);">
                      ${this.escapeHtml(task.evidence.automatedChecks.command || 'npm test')}
                    </span>
                  </div>
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="color: var(--text-dim);">Test Result:</span>
                    <span style="font-family: var(--font-mono); color: ${task.evidence.automatedChecks.exitCode === 0 ? 'var(--neon-emerald)' : 'var(--neon-rose)'}; font-weight: 600;">
                      ${task.evidence.automatedChecks.exitCode === 0 ? '✓ PASS (Exit 0)' : `✗ FAIL (Exit ${task.evidence.automatedChecks.exitCode})`}
                      ${task.evidence.automatedChecks.passedCount !== undefined ? ` • ${task.evidence.automatedChecks.passedCount} tests` : ''}
                    </span>
                  </div>
                ` : ''}
                ${task.evidence.manualReview?.notes ? `
                  <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-dim); color: var(--text-secondary);">
                    <span style="color: var(--text-dim);">Review Notes:</span> ${this.escapeHtml(task.evidence.manualReview.notes)}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Evidence Input Fields -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
              <div>
                <label style="font-size: 0.72rem; color: var(--text-dim); display: block; margin-bottom: 2px;">Git Commit Hash</label>
                <input type="text" class="form-input" id="evidenceCommitHash" style="font-size: 0.78rem; font-family: var(--font-mono); padding: 4px 8px;" placeholder="e.g. 7c1b554" value="${this.escapeHtml(task.evidence?.commitHash || '')}" />
              </div>
              <div>
                <label style="font-size: 0.72rem; color: var(--text-dim); display: block; margin-bottom: 2px;">Test Command</label>
                <input type="text" class="form-input" id="evidenceTestCommand" style="font-size: 0.78rem; font-family: var(--font-mono); padding: 4px 8px;" placeholder="e.g. npm test" value="${this.escapeHtml(task.evidence?.automatedChecks?.command || '')}" />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
              <div>
                <label style="font-size: 0.72rem; color: var(--text-dim); display: block; margin-bottom: 2px;">Test Exit Code</label>
                <input type="number" class="form-input" id="evidenceExitCode" style="font-size: 0.78rem; padding: 4px 8px;" placeholder="0" value="${task.evidence?.automatedChecks?.exitCode !== undefined ? task.evidence.automatedChecks.exitCode : ''}" />
              </div>
              <div>
                <label style="font-size: 0.72rem; color: var(--text-dim); display: block; margin-bottom: 2px;">Tests Passed Count</label>
                <input type="number" class="form-input" id="evidencePassedCount" style="font-size: 0.78rem; padding: 4px 8px;" placeholder="e.g. 15" value="${task.evidence?.automatedChecks?.passedCount !== undefined ? task.evidence.automatedChecks.passedCount : ''}" />
              </div>
            </div>

            <div>
              <label style="font-size: 0.72rem; color: var(--text-dim); display: block; margin-bottom: 2px;">Verification Notes / Reviewer Sign-off</label>
              <input type="text" class="form-input" id="evidenceNotes" style="font-size: 0.78rem; padding: 4px 8px;" placeholder="e.g. Verified unit test pass and manual sanity check" value="${this.escapeHtml(task.evidence?.manualReview?.notes || '')}" />
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

      const commitHash = this.modalEl.querySelector('#evidenceCommitHash')?.value.trim();
      const testCommand = this.modalEl.querySelector('#evidenceTestCommand')?.value.trim();
      const exitCodeVal = this.modalEl.querySelector('#evidenceExitCode')?.value.trim();
      const passedCountVal = this.modalEl.querySelector('#evidencePassedCount')?.value.trim();
      const notes = this.modalEl.querySelector('#evidenceNotes')?.value.trim();

      const exitCode = exitCodeVal !== '' ? parseInt(exitCodeVal, 10) : NaN;
      const passedCount = passedCountVal !== '' ? parseInt(passedCountVal, 10) : NaN;

      let evidence = existingTask?.evidence || null;
      if (commitHash || testCommand || !isNaN(exitCode) || !isNaN(passedCount) || notes) {
        evidence = {
          commitHash: commitHash || undefined,
          automatedChecks: testCommand ? {
            command: testCommand,
            exitCode: isNaN(exitCode) ? 0 : exitCode,
            passedCount: isNaN(passedCount) ? undefined : passedCount
          } : undefined,
          manualReview: notes ? { notes, reviewer: 'dashboard-user' } : undefined,
          timestamp: new Date().toISOString()
        };
      }

      const verificationStatus = (evidence && (evidence.automatedChecks?.exitCode === 0 || evidence.commitHash))
        ? 'verified'
        : (['done', 'implemented', 'verified'].includes(status) ? 'unverified' : undefined);

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
                subtasks: this.subtasksList,
                evidence,
                verificationStatus
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
                subtasks: this.subtasksList,
                evidence,
                verificationStatus
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
