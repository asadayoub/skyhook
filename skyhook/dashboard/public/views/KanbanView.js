/**
 * KanbanView - Multi-Agent Agile Kanban Board
 * 5 columns (Backlog, Ready, In-Progress, In-Review, Completed) with live lease countdown timers.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class KanbanView extends BaseView {
  render() {
    const projectData = this.store.getState().projectData;
    const stories = projectData?.backlog?.stories || [];
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
      <div class="kanban-scroll-wrapper">
        <div class="kanban-grid" style="min-width: 1280px;">
          ${columns.map(col => {
            const colStories = stories.filter(s => s.status === col.id);
            return `
              <div class="kanban-col">
                <div class="col-header">
                  <span class="col-title">${col.icon} ${col.title}</span>
                  <span class="col-count">${colStories.length}</span>
                </div>
                <div class="col-body" data-status="${col.id}">
                  ${colStories.map(story => this.renderStoryCard(story, epicMap)).join('')}
                  ${colStories.length === 0 ? '<div style="text-align: center; color: var(--text-dim); padding: 32px 0; font-size: 0.8rem;">No stories</div>' : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderStoryCard(story, epicMap) {
    const isLeased = story.lease && story.lease.agentId;
    const epicTitle = epicMap.get(story.epicId) || 'General';

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

        <div class="story-footer">
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
