/**
 * KanbanView - Multi-Agent Agile Kanban Board
 * 5 columns (Backlog, Ready, In-Progress, In-Review, Completed) with live lease countdown timers.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';
import { StoryModal } from '../components/StoryModal.js';
import { TaskModal } from '../components/TaskModal.js';

export class KanbanView extends BaseView {
  constructor(context) {
    super(context);
    this.storyModal = new StoryModal({
      bridge: this.bridge,
      store: this.store,
      onSaved: () => {
        if (this.bridge.refreshProject) {
          this.bridge.refreshProject();
        }
      }
    });

    this.taskModal = new TaskModal({
      bridge: this.bridge,
      store: this.store,
      onSaved: () => {
        if (this.bridge.refreshProject) {
          this.bridge.refreshProject();
        }
      }
    });
  }

  render() {
    const projectData = this.store.getState().projectData;
    const stories = projectData?.backlog?.stories || [];
    const tasks = projectData?.backlog?.tasks || [];
    const epics = projectData?.backlog?.epics || [];
    const epicMap = new Map(epics.map(e => [e.id, e.title]));

    const columns = [
      { id: 'backlog', title: 'Backlog', icon: '📥' },
      { id: 'ready', title: 'Ready', icon: '🎯' },
      { id: 'in-progress', title: 'In Progress', icon: '⚡' },
      { id: 'in-review', title: 'In Review', icon: '🔍' },
      { id: 'done', title: 'Completed', icon: '✅' }
    ];

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <div style="font-family: var(--font-hud); font-size: 1.1rem; color: var(--text-secondary); letter-spacing: 0.5px;">
          MULTI-AGENT AGILE KANBAN &bull; ${stories.length} STORIES &bull; ${tasks.length} TASKS
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="addTaskToolbarBtn" class="btn-cyber" style="padding: 6px 14px; font-size: 0.8rem; background: rgba(0, 240, 255, 0.12);">
            ➕ NEW TASK
          </button>
          <button id="addStoryToolbarBtn" class="btn-cyber" style="padding: 6px 14px; font-size: 0.8rem;">
            ➕ NEW STORY
          </button>
        </div>
      </div>

      <div class="kanban-scroll-wrapper">
        <div class="kanban-grid" style="min-width: 1280px;">
          ${columns.map(col => {
            const colStories = stories.filter(s => s.status === col.id);
            return `
              <div class="kanban-col">
                <div class="col-header">
                  <span class="col-title">${col.icon} ${col.title}</span>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="col-count">${colStories.length}</span>
                    <button class="add-col-story-btn" data-status="${col.id}" title="Add Story to ${col.title}" style="background: rgba(0,240,255,0.1); border: 1px solid var(--border-neon); color: var(--neon-cyan); width: 22px; height: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.8rem; font-weight: 700;">+</button>
                  </div>
                </div>
                <div class="col-body" data-status="${col.id}">
                  ${colStories.map(story => this.renderStoryCard(story, epicMap, tasks)).join('')}
                  ${colStories.length === 0 ? '<div style="text-align: center; color: var(--text-dim); padding: 32px 0; font-size: 0.8rem;">No stories</div>' : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderStoryCard(story, epicMap, allTasks = []) {
    const isLeased = story.lease && story.lease.agentId;
    const epicTitle = epicMap.get(story.epicId) || 'General';

    // Find child tasks under this story
    const childTasks = allTasks.filter(t => t.parentId === story.id || t.storyId === story.id);
    const totalTasks = childTasks.length;
    const doneTasks = childTasks.filter(t => t.status === 'done').length;
    const taskPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Check if any child tasks are leased by agents
    const leasedChildTasks = childTasks.filter(t => t.lease && t.lease.agentId);

    return `
      <div class="story-card ${isLeased ? 'leased' : ''}" data-id="${story.id}">
        <div class="story-meta">
          <span class="story-badge">${this.escapeHtml(epicTitle)}</span>
          <span class="story-points">${story.storyPoints ? story.storyPoints + ' pts' : '—'}</span>
        </div>
        <div class="story-title" data-story-id="${story.id}">${this.escapeHtml(story.title)}</div>
        
        ${isLeased ? `
          <div style="margin: 8px 0; display: flex; align-items: center; justify-content: space-between;">
            <div class="lease-badge">
              <span class="pulse-dot" style="background: var(--neon-amber); box-shadow: 0 0 6px var(--neon-amber);"></span>
              <span>${this.escapeHtml(story.lease.agentId)}</span>
              <span class="timer-countdown" data-expires="${story.lease.expiresAt}">--:--</span>
            </div>
            <button class="release-btn" data-action="release" data-story-id="${story.id}">Release</button>
          </div>
        ` : ''}

        <!-- Active Multi-Agent Child Task Leases -->
        ${leasedChildTasks.length > 0 ? `
          <div style="margin: 6px 0; display: flex; flex-direction: column; gap: 4px;">
            ${leasedChildTasks.map(t => `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.25); border-radius: 4px; padding: 2px 6px; font-size: 0.72rem;">
                <span style="color: var(--neon-amber); display: flex; align-items: center; gap: 4px;">
                  🤖 <strong>${this.escapeHtml(t.lease.agentId)}</strong>: ${this.escapeHtml(t.id)}
                </span>
                <span class="timer-countdown" data-expires="${t.lease.expiresAt}" style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--neon-amber);">--:--</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Child Tasks Progress Bar -->
        ${totalTasks > 0 ? `
          <div style="margin: 8px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim); margin-bottom: 3px; font-family: var(--font-mono);">
              <span>Tasks ${doneTasks}/${totalTasks}</span>
              <span style="color: ${taskPercent === 100 ? 'var(--neon-green)' : 'var(--neon-cyan)'};">${taskPercent}%</span>
            </div>
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 3px; height: 5px; overflow: hidden;">
              <div style="background: ${taskPercent === 100 ? 'var(--neon-green)' : 'linear-gradient(90deg, var(--neon-cyan), var(--neon-purple))'}; height: 100%; width: ${taskPercent}%; transition: width 0.3s ease;"></div>
            </div>
          </div>
        ` : ''}

        <!-- Expandable Task Drawer Toggle & Quick Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255, 255, 255, 0.08);">
          <button class="toggle-task-drawer-btn" data-story-id="${story.id}" style="background: none; border: none; color: var(--neon-cyan); font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 0;">
            <span id="drawer-arrow-${story.id}">▶</span>
            <span>Tasks (${totalTasks})</span>
          </button>
          <button class="add-task-btn" data-story-id="${story.id}" title="Add Task to Story" style="background: rgba(0,240,255,0.08); border: 1px solid var(--border-neon); color: var(--neon-cyan); border-radius: 3px; font-size: 0.7rem; padding: 1px 6px; cursor: pointer;">
            + Task
          </button>
        </div>

        <!-- Inline Child Tasks List (Drawer) -->
        <div class="task-drawer" id="task-drawer-${story.id}" style="display: none; margin-top: 8px; padding: 6px; background: rgba(0, 0, 0, 0.25); border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);">
          ${childTasks.length === 0 ? `
            <div style="font-size: 0.72rem; color: var(--text-dim); text-align: center; padding: 4px 0;">No tasks. Click "+ Task" to create one.</div>
          ` : childTasks.map(t => {
            const subCount = Array.isArray(t.subtasks) ? t.subtasks.length : 0;
            const subDone = Array.isArray(t.subtasks) ? t.subtasks.filter(s => s.completed).length : 0;
            return `
              <div class="task-row" data-task-id="${t.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 0.75rem; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                  <span style="font-family: var(--font-mono); font-size: 0.68rem; color: var(--neon-cyan);">${t.id}</span>
                  <span style="color: ${t.status === 'done' ? 'var(--text-dim)' : 'var(--text-primary)'}; text-decoration: ${t.status === 'done' ? 'line-through' : 'none'}; overflow: hidden; text-overflow: ellipsis;">
                    ${this.escapeHtml(t.title)}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; margin-left: 6px; flex-shrink: 0;">
                  ${subCount > 0 ? `
                    <span style="font-family: var(--font-mono); font-size: 0.65rem; color: ${subDone === subCount ? 'var(--neon-green)' : 'var(--text-dim)'};">
                      ☑ ${subDone}/${subCount}
                    </span>
                  ` : ''}
                  <span style="font-size: 0.65rem; padding: 1px 4px; border-radius: 3px; background: rgba(255,255,255,0.05); color: var(--text-secondary);">
                    ${t.status}
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="story-footer" style="margin-top: 8px;">
          <select class="project-select status-select" style="padding: 2px 6px; font-size: 0.75rem;" data-story-id="${story.id}">
            <option value="backlog" ${story.status === 'backlog' ? 'selected' : ''}>Backlog</option>
            <option value="ready" ${story.status === 'ready' ? 'selected' : ''}>Ready</option>
            <option value="in-progress" ${story.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="in-review" ${story.status === 'in-review' ? 'selected' : ''}>In Review</option>
            <option value="done" ${story.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
          <span class="code-link" data-action="inspect-backlog" style="cursor: pointer; color: var(--neon-cyan); font-size: 0.75rem;">Code ➔</span>
        </div>
      </div>
    `;
  }

  async postRender() {
    this.bindCardEvents();
    this.startCountdownTimers();

    // Re-render when projectData updates in store
    this.registerSubscription(
      this.store.subscribe('projectData', () => {
        if (this.container) {
          this.container.innerHTML = this.render();
          this.postRender();
        }
      })
    );
  }

  bindCardEvents() {
    if (!this.container) return;

    // Status transition dropdowns
    const selects = this.container.querySelectorAll('.status-select');
    selects.forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const storyId = sel.dataset.storyId;
        const newStatus = e.target.value;
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        try {
          await this.bridge.call('update-status', { skyhookDir, storyId, status: newStatus });
          Toast.show(`Story ${storyId} transitioned to ${newStatus}`, 'success');
        } catch (err) {
          Toast.show(`Failed to update status: ${err.message}`, 'error');
        }
      });
    });

    // Release lease buttons
    const releaseButtons = this.container.querySelectorAll('[data-action="release"]');
    releaseButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const storyId = btn.dataset.storyId;
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        try {
          await this.bridge.call('release-lease', { skyhookDir, storyId, force: true });
          Toast.show(`Lease for story ${storyId} released`, 'info');
        } catch (err) {
          Toast.show(`Failed to release lease: ${err.message}`, 'error');
        }
      });
    });

    // Create Story toolbar button
    const addToolbarBtn = this.container.querySelector('#addStoryToolbarBtn');
    if (addToolbarBtn) {
      addToolbarBtn.addEventListener('click', () => {
        this.storyModal.open(null, 'backlog');
      });
    }

    // Create Task toolbar button
    const addTaskToolbarBtn = this.container.querySelector('#addTaskToolbarBtn');
    if (addTaskToolbarBtn) {
      addTaskToolbarBtn.addEventListener('click', () => {
        this.taskModal.open(null);
      });
    }

    // Quick + Task button on story card
    const addTaskBtns = this.container.querySelectorAll('.add-task-btn');
    addTaskBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const storyId = btn.dataset.storyId;
        this.taskModal.open(null, storyId, 'story');
      });
    });

    // Task drawer toggle buttons
    const drawerBtns = this.container.querySelectorAll('.toggle-task-drawer-btn');
    drawerBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const storyId = btn.dataset.storyId;
        const drawer = this.container.querySelector(`#task-drawer-${storyId}`);
        const arrow = this.container.querySelector(`#drawer-arrow-${storyId}`);
        if (drawer) {
          const isHidden = drawer.style.display === 'none';
          drawer.style.display = isHidden ? 'block' : 'none';
          if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
        }
      });
    });

    // Task row clicks -> open TaskModal to edit
    const taskRows = this.container.querySelectorAll('.task-row');
    taskRows.forEach(row => {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = row.dataset.taskId;
        const tasks = this.store.getState().projectData?.backlog?.tasks || [];
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          this.taskModal.open(task);
        }
      });
    });

    // Column add story buttons (+)
    const addColBtns = this.container.querySelectorAll('.add-col-story-btn');
    addColBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.storyModal.open(null, btn.dataset.status || 'backlog');
      });
    });

    // Story card / title click for edit
    const storyTitles = this.container.querySelectorAll('.story-title');
    storyTitles.forEach(titleEl => {
      titleEl.style.cursor = 'pointer';
      titleEl.title = 'Click to edit or delete story';
      titleEl.addEventListener('click', () => {
        const storyId = titleEl.dataset.storyId;
        const stories = this.store.getState().projectData?.backlog?.stories || [];
        const story = stories.find(s => s.id === storyId);
        if (story) {
          this.storyModal.open(story);
        }
      });
    });

    // Inspect backlog yaml code link
    const codeLinks = this.container.querySelectorAll('[data-action="inspect-backlog"]');
    codeLinks.forEach(link => {
      link.addEventListener('click', () => {
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        const pref = this.store.getState().editorPreference;
        if (skyhookDir) {
          this.bridge.openEditor(`${skyhookDir}/backlog/epics.yaml`, 1, pref);
        }
      });
    });
  }

  startCountdownTimers() {
    const countdownEls = this.container?.querySelectorAll('.timer-countdown') || [];
    if (countdownEls.length === 0) return;

    const tick = () => {
      const now = Date.now();
      countdownEls.forEach(el => {
        const expiresAt = new Date(el.dataset.expires).getTime();
        const diffMs = expiresAt - now;
        if (diffMs <= 0) {
          el.textContent = 'EXPIRED';
          el.style.color = 'var(--neon-rose)';
        } else {
          const totalSec = Math.floor(diffMs / 1000);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    this.registerTimer(interval);
  }
}

