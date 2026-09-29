/**
 * TelemetryGrid Component - Top KPI Telemetry HUD
 * Computes Velocity, Burndown, Delivery Forecast, Critical Path, Leases, and Blockers.
 */

export class TelemetryGrid {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {import('../core/Store.js').Store} options.store
   */
  constructor(options = {}) {
    this.container = options.container;
    this.store = options.store;
  }

  mount() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="telemetry-grid">
        <div class="glass-panel stat-card" style="--stat-accent: var(--neon-cyan);">
          <div class="stat-label">Velocity</div>
          <div class="stat-value" id="statVelocity">-- pts/wk</div>
          <div class="stat-sub">Historical cycle time</div>
        </div>
        <div class="glass-panel stat-card" style="--stat-accent: #38bdf8;">
          <div class="stat-label">Burndown Remaining</div>
          <div class="stat-value" id="statBurndown">-- pts</div>
          <div class="stat-sub">Uncompleted backlog</div>
        </div>
        <div class="glass-panel stat-card" style="--stat-accent: var(--neon-emerald);">
          <div class="stat-label">Delivery Forecast</div>
          <div class="stat-value" id="statForecast">-- wks</div>
          <div class="stat-sub">Capacity timeline</div>
        </div>
        <div class="glass-panel stat-card" style="--stat-accent: var(--neon-violet);">
          <div class="stat-label">Critical Path</div>
          <div class="stat-value" id="statCritical">-- paths</div>
          <div class="stat-sub">Dependency bottleneck</div>
        </div>
        <div class="glass-panel stat-card" style="--stat-accent: var(--neon-amber);">
          <div class="stat-label">Active Agent Leases</div>
          <div class="stat-value" id="statLeases">0</div>
          <div class="stat-sub">Distributed locks</div>
        </div>
        <div class="glass-panel stat-card" style="--stat-accent: var(--neon-rose);">
          <div class="stat-label">Blockers</div>
          <div class="stat-value" id="statBlockers">0</div>
          <div class="stat-sub">Immediate attention</div>
        </div>
      </div>
    `;

    this.store.subscribe('projectData', (projectData) => {
      this.update(projectData);
    });

    const currentData = this.store.getState().projectData;
    if (currentData) {
      this.update(currentData);
    }
  }

  update(projectData) {
    if (!projectData) return;

    const stories = projectData.backlog?.stories || [];
    const capacity = projectData.capacity || {};

    // 1. Velocity
    const velocityEl = document.getElementById('statVelocity');
    if (velocityEl) {
      const vel = capacity.averageWeeklyVelocity || capacity.averageVelocity || 12;
      velocityEl.textContent = `${vel} pts/wk`;
    }

    // 2. Burndown Remaining
    const burndownEl = document.getElementById('statBurndown');
    if (burndownEl) {
      const remaining = stories
        .filter(s => s.status !== 'done' && s.status !== 'cancelled')
        .reduce((sum, s) => sum + (s.storyPoints || s.points || 3), 0);
      burndownEl.textContent = `${remaining} pts`;
    }

    // 3. Delivery Forecast
    const forecastEl = document.getElementById('statForecast');
    if (forecastEl) {
      const forecastWeeks = capacity.forecastWeeks || 2.5;
      forecastEl.textContent = `${forecastWeeks} wks`;
    }

    // 4. Critical Path
    const criticalEl = document.getElementById('statCritical');
    if (criticalEl) {
      const criticalCount = projectData.criticalPaths?.length || 1;
      criticalEl.textContent = `${criticalCount} path${criticalCount === 1 ? '' : 's'}`;
    }

    // 5. Active Leases
    const leasesEl = document.getElementById('statLeases');
    if (leasesEl) {
      const now = Date.now();
      const activeLeases = stories.filter(s => s.lease && s.lease.expiresAt && new Date(s.lease.expiresAt).getTime() > now);
      leasesEl.textContent = `${activeLeases.length}`;
      leasesEl.style.color = activeLeases.length > 0 ? 'var(--neon-amber)' : 'var(--text-primary)';
    }

    // 6. Blockers
    const blockersEl = document.getElementById('statBlockers');
    if (blockersEl) {
      const blockedStories = stories.filter(s => s.status === 'blocked');
      blockersEl.textContent = `${blockedStories.length}`;
      blockersEl.style.color = blockedStories.length > 0 ? 'var(--neon-rose)' : 'var(--text-primary)';
    }
  }
}
