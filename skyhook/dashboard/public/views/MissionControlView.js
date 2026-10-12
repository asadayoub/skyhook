/**
 * MissionControlView - Executive Project Cockpit & Resumption Center
 * Surfaces project delivery velocity, active multi-agent leases with countdowns,
 * next recommended task claiming, unverified deliverables warnings, and recent ADR activity.
 */

import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';

export class MissionControlView extends BaseView {
  constructor(context) {
    super(context);
  }

  render() {
    const data = this.store.getState().projectData || {};
    const project = data.project || {};
    const backlog = data.backlog || { epics: [], stories: [], tasks: [] };
    const capacity = data.capacity || {
      weeklyVelocityPoints: 0,
      averageCycleTimeHours: 0,
      remainingPoints: 0,
      remainingStoriesCount: 0,
      forecast: { projectedCompletionDateP50: '—', projectedCompletionDateP90: '—' },
      scopeCreep: { detected: false, netPointsGrowth: 0 }
    };
    const decisions = (data.decisions?.decisions || []).slice(-6).reverse();

    const stories = backlog.stories || [];
    const tasks = backlog.tasks || [];

    // 1. Active Agent Leases
    const allItems = [...stories, ...tasks];
    const activeLeases = allItems.filter(item => {
      const hasAgent = Boolean(item.lease?.agentId || item.leasedTo);
      if (!hasAgent) return false;
      const expires = item.lease?.expiresAt || item.leaseExpiresAt;
      if (!expires) return true;
      return new Date(expires).getTime() > Date.now();
    });

    // 2. Next Recommended Task (Ready, unleased, highest priority)
    const readyItems = allItems.filter(item => 
      item.status === 'ready' && !item.lease?.agentId && !item.leasedTo
    );
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    readyItems.sort((a, b) => (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1));
    const nextTask = readyItems[0] || null;

    // 3. Unverified Deliverables (Done / Implemented / Verified but lacking automated evidence)
    const completedItems = allItems.filter(item => 
      ['done', 'implemented', 'verified'].includes(item.status)
    );
    const unverifiedItems = completedItems.filter(item => {
      if (item.verificationStatus === 'unverified') return true;
      if (!item.evidence) return true;
      if (item.evidence?.automatedChecks && item.evidence.automatedChecks.exitCode !== 0) return true;
      return false;
    });

    return `
      <div class="mission-control-view" style="display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Header Banner & Delivery Pulse -->
        <div class="glass-panel" style="padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <span style="font-size: 1.5rem;">🚀</span>
                <h1 style="font-family: var(--font-hud); font-size: 1.6rem; letter-spacing: 1px; color: var(--neon-cyan);">
                  MISSION CONTROL COCKPIT
                </h1>
                <span class="badge" style="background: rgba(0, 240, 255, 0.15); color: var(--neon-cyan); border: 1px solid var(--border-neon); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-family: var(--font-mono);">
                  ${this.escapeHtml(project.profile || 'web-app')}
                </span>
              </div>
              <p style="color: var(--text-secondary); font-size: 0.9rem;">
                ${this.escapeHtml(project.description || 'Autonomous multi-agent execution cockpit and continuous project intelligence.')}
              </p>
            </div>
            
            <div style="display: flex; gap: 10px;">
              <button id="recompilePlanBtn" class="btn-cyber" style="padding: 8px 16px; font-size: 0.85rem;">
                📋 RECOMPILE PLAN
              </button>
              <button id="goToKanbanBtn" class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;">
                ⚡ VIEW KANBAN
              </button>
            </div>
          </div>

          <!-- Pulse Metrics Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
            <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px;">
              <div style="color: var(--text-dim); font-size: 0.75rem; font-family: var(--font-hud); letter-spacing: 0.5px;">WEEKLY VELOCITY</div>
              <div style="font-size: 1.5rem; font-family: var(--font-hud); color: var(--neon-emerald); font-weight: 700; margin-top: 4px;">
                ${capacity.weeklyVelocityPoints || 0} <span style="font-size: 0.85rem; color: var(--text-secondary);">pts/wk</span>
              </div>
              <div style="color: var(--text-dim); font-size: 0.75rem; margin-top: 2px;">14-day rolling rate</div>
            </div>

            <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px;">
              <div style="color: var(--text-dim); font-size: 0.75rem; font-family: var(--font-hud); letter-spacing: 0.5px;">P50 TARGET COMPLETION</div>
              <div style="font-size: 1.25rem; font-family: var(--font-mono); color: var(--neon-cyan); font-weight: 600; margin-top: 6px;">
                ${this.escapeHtml(capacity.forecast?.projectedCompletionDateP50 || '—')}
              </div>
              <div style="color: var(--text-dim); font-size: 0.75rem; margin-top: 2px;">Velocity projection</div>
            </div>

            <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px;">
              <div style="color: var(--text-dim); font-size: 0.75rem; font-family: var(--font-hud); letter-spacing: 0.5px;">AVG CYCLE TIME</div>
              <div style="font-size: 1.5rem; font-family: var(--font-hud); color: var(--neon-violet); font-weight: 700; margin-top: 4px;">
                ${capacity.averageCycleTimeHours || 0} <span style="font-size: 0.85rem; color: var(--text-secondary);">hrs</span>
              </div>
              <div style="color: var(--text-dim); font-size: 0.75rem; margin-top: 2px;">In-progress to done</div>
            </div>

            <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px;">
              <div style="color: var(--text-dim); font-size: 0.75rem; font-family: var(--font-hud); letter-spacing: 0.5px;">REMAINING BACKLOG</div>
              <div style="font-size: 1.5rem; font-family: var(--font-hud); color: var(--neon-amber); font-weight: 700; margin-top: 4px;">
                ${capacity.remainingPoints || 0} <span style="font-size: 0.85rem; color: var(--text-secondary);">pts</span>
              </div>
              <div style="color: var(--text-dim); font-size: 0.75rem; margin-top: 2px;">${capacity.remainingStoriesCount || 0} stories pending</div>
            </div>
          </div>

          ${capacity.scopeCreep?.detected ? `
            <div style="margin-top: 16px; padding: 12px 16px; background: rgba(245, 158, 11, 0.1); border: 1px solid var(--neon-amber); border-radius: 8px; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 1.2rem;">⚠️</span>
              <div style="font-size: 0.85rem; color: var(--neon-amber);">
                <strong>Scope Creep Alert:</strong> Net backlog growth (+${capacity.scopeCreep.netPointsGrowth} pts) outpaces recent completion rate. Delivery target may shift.
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Middle Row: Active Leases + Recommended Task -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 24px;">
          
          <!-- Active Agent Leases Widget -->
          <div class="glass-panel" style="padding: 24px; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2 style="font-family: var(--font-hud); font-size: 1.15rem; letter-spacing: 0.5px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>🔒</span> ACTIVE AGENT LEASES
                <span class="badge" style="background: rgba(168, 85, 247, 0.2); color: var(--neon-violet); border: 1px solid rgba(168, 85, 247, 0.4); font-size: 0.75rem; padding: 2px 6px; border-radius: 10px;">
                  ${activeLeases.length}
                </span>
              </h2>
            </div>

            ${activeLeases.length === 0 ? `
              <div style="padding: 32px 16px; text-align: center; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border-dim); border-radius: 8px; color: var(--text-dim); font-size: 0.85rem;">
                <div style="font-size: 1.8rem; margin-bottom: 8px;">🟢</div>
                All Agent Capacity Available. No active task leases currently held.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 12px;">
                ${activeLeases.map(item => {
                  const agentId = item.lease?.agentId || item.leasedTo || 'unknown';
                  const expiresAt = item.lease?.expiresAt || item.leaseExpiresAt || new Date(Date.now() + 1800000).toISOString();
                  return `
                    <div class="lease-card" style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 8px; padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                      <div style="min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                          <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-cyan); font-weight: 600;">
                            ${this.escapeHtml(item.id)}
                          </span>
                          <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: var(--neon-violet); font-size: 0.7rem; padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono);">
                            🤖 ${this.escapeHtml(agentId)}
                          </span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                          ${this.escapeHtml(item.title)}
                        </div>
                      </div>

                      <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                        <div style="text-align: right;">
                          <div style="font-size: 0.7rem; color: var(--text-dim); font-family: var(--font-hud);">TIME LEFT</div>
                          <span class="timer-countdown" data-expires="${this.escapeHtml(expiresAt)}" style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 600; color: var(--neon-emerald);">
                            --:--
                          </span>
                        </div>
                        <button class="btn-secondary release-lease-btn" data-item-id="${this.escapeHtml(item.id)}" style="padding: 6px 12px; font-size: 0.75rem; color: var(--neon-rose); border-color: rgba(244, 63, 94, 0.3);">
                          RELEASE
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <!-- Next Recommended Task Card -->
          <div class="glass-panel" style="padding: 24px; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2 style="font-family: var(--font-hud); font-size: 1.15rem; letter-spacing: 0.5px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>🎯</span> NEXT RECOMMENDED TASK
              </h2>
            </div>

            ${!nextTask ? `
              <div style="padding: 32px 16px; text-align: center; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border-dim); border-radius: 8px; color: var(--text-dim); font-size: 0.85rem;">
                <div style="font-size: 1.8rem; margin-bottom: 8px;">✨</div>
                All ready tasks are claimed or completed. Review Backlog to prep new work.
              </div>
            ` : `
              <div style="background: var(--bg-surface); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 8px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; flex-grow: 1;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--neon-cyan); font-weight: 600;">
                      ${this.escapeHtml(nextTask.id)}
                    </span>
                    <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--neon-amber); border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-family: var(--font-hud); text-transform: uppercase;">
                      ${this.escapeHtml((nextTask.priority || 'high').toUpperCase())} PRIORITY
                    </span>
                  </div>

                  <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                    ${this.escapeHtml(nextTask.title)}
                  </h3>

                  <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.4; margin-bottom: 16px;">
                    ${this.escapeHtml(nextTask.description || 'Highest-priority unblocked item on the critical execution path.')}
                  </p>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid var(--border-dim);">
                  <div style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">
                    ${nextTask.storyPoints ? `<strong>${nextTask.storyPoints}</strong> pts` : (nextTask.estimatedMinutes ? `<strong>${nextTask.estimatedMinutes}</strong> min` : 'Unestimated')}
                  </div>
                  <button id="claimNextTaskBtn" class="btn-cyber" data-task-id="${this.escapeHtml(nextTask.id)}" style="padding: 8px 18px; font-size: 0.85rem;">
                    ⚡ CLAIM TASK
                  </button>
                </div>
              </div>
            `}
          </div>

        </div>

        <!-- Bottom Row: Unverified Deliverables & Recent ADR Activity -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 24px;">
          
          <!-- Unverified Deliverables Warning Table -->
          <div class="glass-panel" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2 style="font-family: var(--font-hud); font-size: 1.15rem; letter-spacing: 0.5px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>🛡️</span> EVIDENCE & VERIFICATION STATUS
                ${unverifiedItems.length > 0 ? `
                  <span class="badge" style="background: rgba(244, 63, 94, 0.15); color: var(--neon-rose); border: 1px solid rgba(244, 63, 94, 0.3); font-size: 0.75rem; padding: 2px 6px; border-radius: 10px;">
                    ${unverifiedItems.length} UNVERIFIED
                  </span>
                ` : ''}
              </h2>
            </div>

            ${unverifiedItems.length === 0 ? `
              <div style="padding: 24px 16px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; display: flex; align-items: center; gap: 14px;">
                <span style="font-size: 1.6rem;">✅</span>
                <div>
                  <div style="font-weight: 600; color: var(--neon-emerald); font-size: 0.9rem;">
                    100% Definition of Done Compliance
                  </div>
                  <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 2px;">
                    All completed deliverables have verified automated test proof or code artifacts attached.
                  </div>
                </div>
              </div>
            ` : `
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
                  <thead>
                    <tr style="border-bottom: 1px solid var(--border-dim); color: var(--text-dim); font-family: var(--font-hud);">
                      <th style="padding: 8px 10px;">ITEM ID</th>
                      <th style="padding: 8px 10px;">TITLE</th>
                      <th style="padding: 8px 10px;">STATUS</th>
                      <th style="padding: 8px 10px;">MISSING PROOF</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${unverifiedItems.map(item => `
                      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                        <td style="padding: 10px; font-family: var(--font-mono); color: var(--neon-cyan);">
                          ${this.escapeHtml(item.id)}
                        </td>
                        <td style="padding: 10px; color: var(--text-primary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${this.escapeHtml(item.title)}
                        </td>
                        <td style="padding: 10px;">
                          <span style="background: rgba(245, 158, 11, 0.15); color: var(--neon-amber); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-family: var(--font-mono);">
                            ${this.escapeHtml(item.status)}
                          </span>
                        </td>
                        <td style="padding: 10px; color: var(--neon-rose); font-size: 0.75rem;">
                          ⚠️ Automated tests missing
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- Recent ADR Activity Feed -->
          <div class="glass-panel" style="padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2 style="font-family: var(--font-hud); font-size: 1.15rem; letter-spacing: 0.5px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>⚖️</span> ARCHITECTURE DECISIONS (ADRs)
              </h2>
              <button id="viewAdrDagBtn" class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;">
                VIEW DAG ➔
              </button>
            </div>

            ${decisions.length === 0 ? `
              <div style="padding: 24px 16px; text-align: center; color: var(--text-dim); font-size: 0.85rem; border: 1px dashed var(--border-dim); border-radius: 8px;">
                No architecture decisions recorded yet. Run <code>skyhook decide</code> or <code>skyhook adr draft</code>.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${decisions.map(d => `
                  <div style="background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <div style="min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                        <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--neon-violet); font-weight: 600;">
                          ${this.escapeHtml(d.id)}
                        </span>
                        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--neon-emerald); font-size: 0.7rem; padding: 1px 6px; border-radius: 4px;">
                          ${this.escapeHtml(d.status || 'accepted')}
                        </span>
                      </div>
                      <div style="font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${this.escapeHtml(d.title)}
                      </div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); flex-shrink: 0;">
                      ${this.escapeHtml(d.category || 'architecture')}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>

      </div>
    `;
  }

  async postRender() {
    // 1. Release Lease Buttons
    const releaseButtons = this.container?.querySelectorAll('.release-lease-btn') || [];
    releaseButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.itemId;
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        if (!itemId || !skyhookDir) return;

        try {
          btn.disabled = true;
          btn.textContent = 'RELEASING...';
          await this.bridge.call('release-lease', { skyhookDir, storyId: itemId, force: true });
          Toast.show(`Lease released for ${itemId}`, 'success');
          if (this.bridge.refreshProject) {
            this.bridge.refreshProject();
          }
        } catch (err) {
          Toast.show(`Failed to release lease: ${err.message}`, 'error');
          btn.disabled = false;
          btn.textContent = 'RELEASE';
        }
      });
    });

    // 2. Claim Recommended Task Button
    const claimBtn = this.container?.querySelector('#claimNextTaskBtn');
    if (claimBtn) {
      claimBtn.addEventListener('click', async () => {
        const taskId = claimBtn.dataset.taskId;
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        if (!taskId || !skyhookDir) return;

        try {
          claimBtn.disabled = true;
          claimBtn.textContent = 'CLAIMING...';
          await this.bridge.call('claim-task', { skyhookDir, taskId, agentId: 'engineer', leaseMinutes: 30 });
          Toast.show(`Claimed task ${taskId} successfully!`, 'success');
          if (this.bridge.refreshProject) {
            this.bridge.refreshProject();
          }
        } catch (err) {
          Toast.show(`Failed to claim task: ${err.message}`, 'error');
          claimBtn.disabled = false;
          claimBtn.textContent = '⚡ CLAIM TASK';
        }
      });
    }

    // 3. Recompile Plan Button
    const recompileBtn = this.container?.querySelector('#recompilePlanBtn');
    if (recompileBtn) {
      recompileBtn.addEventListener('click', async () => {
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        if (!skyhookDir) return;

        try {
          recompileBtn.disabled = true;
          recompileBtn.textContent = 'RECOMPILING...';
          await this.bridge.call('recompile-plan', { skyhookDir });
          Toast.show('Project plan recompiled successfully', 'success');
          if (this.bridge.refreshProject) {
            this.bridge.refreshProject();
          }
        } catch (err) {
          Toast.show(`Recompilation failed: ${err.message}`, 'error');
        } finally {
          recompileBtn.disabled = false;
          recompileBtn.textContent = '📋 RECOMPILE PLAN';
        }
      });
    }

    // 4. Quick Nav Buttons
    const kanbanBtn = this.container?.querySelector('#goToKanbanBtn');
    if (kanbanBtn) {
      kanbanBtn.addEventListener('click', () => {
        this.router.navigate('/kanban');
      });
    }

    const adrDagBtn = this.container?.querySelector('#viewAdrDagBtn');
    if (adrDagBtn) {
      adrDagBtn.addEventListener('click', () => {
        this.router.navigate('/decisions');
      });
    }

    // 5. Start live countdown timers
    this.startCountdownTimers();
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

  async update(data) {
    if (!this.container) return;
    this.container.innerHTML = this.render();
    await this.postRender();
  }
}
