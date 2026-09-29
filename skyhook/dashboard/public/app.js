/**
 * Skyhook Cybernetic Dashboard Application
 * Zero-polling, real-time WebSocket reactive client.
 */

// Application State
const state = {
  projects: [],
  currentProjectId: null,
  projectData: null,
  activeTab: 'kanban',
  editorPreference: localStorage.getItem('skyhook_editor_pref') || 'vscode',
  ws: null,
  wsConnected: false,
  lastPingTime: null,
  latencyMs: 0,
  leaseTimers: new Map(),
  driftScorecard: null,
  activeC4View: 'container'
};

// --- DOM References ---
const projectSelect = document.getElementById('projectSelect');
const connectionIndicator = document.getElementById('connectionIndicator');
const latencyDisplay = document.getElementById('latencyDisplay');
const editorSelect = document.getElementById('editorSelect');
const mainContent = document.getElementById('mainContent');
const fileModal = document.getElementById('fileModal');
const modalTitle = document.getElementById('modalTitle');
const modalCodeContent = document.getElementById('modalCodeContent');
const modalCodeLines = document.getElementById('modalCodeLines');
const openIdeBtn = document.getElementById('openIdeBtn');

// --- Helper Functions ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- WebSocket Gateway Client ---
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    state.wsConnected = true;
    updateConnectionStatus(true);
    // Measure latency
    state.lastPingTime = performance.now();
    state.ws.send(JSON.stringify({ type: 'PING' }));
  };

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWebSocketMessage(msg);
    } catch (e) {
      console.error('Failed to parse WS message:', e);
    }
  };

  state.ws.onclose = () => {
    state.wsConnected = false;
    updateConnectionStatus(false);
    setTimeout(initWebSocket, 2000); // Reconnect loop
  };

  state.ws.onerror = () => {
    state.wsConnected = false;
    updateConnectionStatus(false);
  };
}

function handleWebSocketMessage(msg) {
  if (msg.type === 'PONG') {
    if (state.lastPingTime) {
      state.latencyMs = Math.round(performance.now() - state.lastPingTime);
      if (latencyDisplay) latencyDisplay.textContent = `${state.latencyMs} ms`;
    }
    return;
  }

  console.log('[Skyhook WS Event]', msg.type, msg.payload);

  // Reactive updates on broadcast events
  const refreshTriggers = [
    'BACKLOG_UPDATED',
    'DECISIONS_UPDATED',
    'REQUIREMENTS_UPDATED',
    'TECH_STACK_UPDATED',
    'STORY_TRANSITIONED',
    'LEASE_RELEASED',
    'DRIFT_ADOPTED',
    'PLAN_RECOMPILED',
    'ADR_TRANSITIONED',
    'ADR_SUPERSEDED',
    'ADR_INTERCEPTED',
    'POLICIES_COMPILED'
  ];

  if (refreshTriggers.includes(msg.type)) {
    flashHudSync();
    loadCurrentProjectData(false); // fast silent refresh
  }
}

function updateConnectionStatus(connected) {
  if (connectionIndicator) {
    connectionIndicator.style.background = connected ? 'var(--neon-emerald)' : 'var(--neon-rose)';
    connectionIndicator.style.boxShadow = connected ? '0 0 8px var(--neon-emerald)' : '0 0 8px var(--neon-rose)';
  }
  const text = document.getElementById('connectionStatusText');
  if (text) {
    text.textContent = connected ? 'LIVE' : 'OFFLINE';
    text.style.color = connected ? 'var(--neon-emerald)' : 'var(--neon-rose)';
  }
}

function flashHudSync() {
  if (connectionIndicator) {
    connectionIndicator.style.transform = 'scale(1.4)';
    setTimeout(() => {
      connectionIndicator.style.transform = 'scale(1)';
    }, 200);
  }
}

// --- API Calls ---
async function fetchProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    state.projects = data.projects || [];
    renderProjectSelector();

    if (state.projects.length > 0) {
      // Pick current workspace or first
      const defaultProj = state.projects.find(p => p.isCurrentWorkspace) || state.projects[0];
      state.currentProjectId = defaultProj.id;
      if (projectSelect) projectSelect.value = state.currentProjectId;
      await loadCurrentProjectData(true);
    }
  } catch (err) {
    console.error('Failed to fetch projects:', err);
  }
}

async function loadCurrentProjectData(renderFull = true) {
  if (!state.currentProjectId) return;
  try {
    const res = await fetch(`/api/project?id=${encodeURIComponent(state.currentProjectId)}`);
    if (!res.ok) throw new Error('Project not found');
    state.projectData = await res.json();

    if (renderFull) {
      renderTelemetryHUD();
      renderActiveTab();
    } else {
      renderTelemetryHUD();
      renderActiveTabContentOnly();
    }
  } catch (err) {
    console.error('Failed to load project data:', err);
  }
}

// --- Action RPC Calls ---
async function updateStoryStatus(storyId, status) {
  if (!state.projectData) return;
  try {
    const res = await fetch('/api/action/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skyhookDir: state.projectData.skyhookDir,
        storyId,
        status,
        metadata: { actor: 'web-dashboard' }
      })
    });
    const result = await res.json();
    if (!result.success) {
      alert(`Transition error: ${result.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Request error: ${err.message}`);
  }
}

async function releaseTaskLease(storyId) {
  if (!state.projectData) return;
  try {
    const res = await fetch('/api/action/release-lease', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skyhookDir: state.projectData.skyhookDir,
        storyId,
        force: true
      })
    });
    const result = await res.json();
    if (!result.success) {
      alert(`Release lease error: ${result.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Request error: ${err.message}`);
  }
}

async function adoptDriftTechnologies(technologies) {
  if (!state.projectData) return;
  try {
    const res = await fetch('/api/action/adopt-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skyhookDir: state.projectData.skyhookDir,
        technologies
      })
    });
    const result = await res.json();
    if (result.success) {
      alert(`Successfully adopted ${technologies.length} technologies into tech-stack.yaml!`);
      state.driftScorecard = null;
      renderDriftCenter();
    }
  } catch (err) {
    alert(`Failed to adopt drift: ${err.message}`);
  }
}

async function draftADRFromDriftAction(techName, category = 'technology') {
  if (!state.projectData) return;
  try {
    const res = await fetch('/api/action/draft-adr-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driftItem: {
          name: techName,
          category,
          title: `Adopt ${techName} for ${category}`,
          reason: `1-Click draft from visual dashboard architecture drift center.`
        }
      })
    });
    const result = await res.json();
    if (result.decisionId) {
      alert(`ADR Draft created: ${result.decisionId} (${techName})! Registered in .skyhook/decisions/`);
      state.driftScorecard = null;
      if (typeof loadProjectData === 'function') loadProjectData();
    }
  } catch (err) {
    alert(`Failed to draft ADR: ${err.message}`);
  }
}

function toggleC4View(view) {
  state.activeC4View = view;
  renderDriftCenter();
}

async function refreshDriftScorecard() {
  state.driftScorecard = null;
  renderDriftCenter();
}

async function recompileMasterPlan() {
  if (!state.projectData) return;
  const btn = document.getElementById('recompilePlanBtn');
  if (btn) btn.textContent = 'COMPILING...';
  try {
    const res = await fetch('/api/action/recompile-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skyhookDir: state.projectData.skyhookDir })
    });
    const result = await res.json();
    if (result.success) {
      alert('Master PROJECT_PLAN.md recompiled successfully!');
    }
  } catch (err) {
    alert(`Recompile failed: ${err.message}`);
  } finally {
    if (btn) btn.textContent = 'RECOMPILE PLAN';
  }
}

// Deep Linking to Code / IDE
async function openInCodeEditor(filePath, line = 1) {
  const pref = state.editorPreference;

  if (pref === 'modal') {
    await inspectFileInModal(filePath, line);
    return;
  }

  // Attempt server open-editor RPC (also launches CLI code/cursor)
  try {
    const res = await fetch('/api/action/open-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, line, preference: pref })
    });
    const result = await res.json();
    if (result.url) {
      // Trigger protocol URL in client
      window.location.href = result.url;
    }
  } catch {
    // Fallback to client protocol handler
    const clientUrl = pref === 'cursor' ? `cursor://file/${filePath}:${line}` : `vscode://file/${filePath}:${line}`;
    window.location.href = clientUrl;
  }
}

async function inspectFileInModal(filePath, targetLine = 1) {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    const file = await res.json();

    if (modalTitle) modalTitle.textContent = `${pathBasename(filePath)} (Line ${targetLine})`;
    if (openIdeBtn) {
      openIdeBtn.onclick = () => {
        window.location.href = `vscode://file/${filePath}:${targetLine}`;
      };
    }

    if (modalCodeLines && modalCodeContent) {
      const lines = file.content ? file.content.split('\n') : [];
      modalCodeLines.innerHTML = lines.map((_, i) => `<div class="${i + 1 === targetLine ? 'text-cyan font-bold' : ''}">${i + 1}</div>`).join('');
      modalCodeContent.innerHTML = lines.map((line, i) => {
        const isTarget = i + 1 === targetLine;
        return `<div style="${isTarget ? 'background: rgba(0, 240, 255, 0.15); border-left: 2px solid var(--neon-cyan);' : ''}">${escapeHtml(line) || ' '}</div>`;
      }).join('');
    }

    if (fileModal) fileModal.classList.add('active');
  } catch (err) {
    alert(`Could not open file: ${err.message}`);
  }
}

function pathBasename(pathStr) {
  return pathStr ? pathStr.split(/[\\/]/).pop() : '';
}

// --- Render Functions ---
function renderProjectSelector() {
  if (!projectSelect) return;
  projectSelect.innerHTML = state.projects.map(p => `
    <option value="${p.id}" ${p.id === state.currentProjectId ? 'selected' : ''}>
      ${p.isCurrentWorkspace ? '⚡ [Workspace] ' : '📦 '} ${escapeHtml(p.name)}
    </option>
  `).join('');
}

function renderTelemetryHUD() {
  const d = state.projectData;
  if (!d) return;

  const velEl = document.getElementById('statVelocity');
  const burndownEl = document.getElementById('statBurndown');
  const forecastEl = document.getElementById('statForecast');
  const criticalEl = document.getElementById('statCritical');
  const leasesEl = document.getElementById('statLeases');
  const blockersEl = document.getElementById('statBlockers');

  const cap = d.capacity || {};
  const stories = d.backlog?.stories || [];
  const activeLeases = stories.filter(s => s.lease && s.lease.agentId).length;
  const blockers = stories.filter(s => s.status === 'blocked').length;

  if (velEl) velEl.textContent = `${cap.weeklyVelocityPoints || 10} pts/wk`;
  if (burndownEl) burndownEl.textContent = `${cap.remainingPoints || 0} pts`;
  if (forecastEl) forecastEl.textContent = cap.forecast ? `${cap.forecast.weeksNeeded} wks` : 'On Track';
  if (criticalEl) criticalEl.textContent = `${stories.filter(s => s.dependsOn && s.dependsOn.length > 0).length} paths`;
  if (leasesEl) {
    leasesEl.textContent = activeLeases;
    leasesEl.style.color = activeLeases > 0 ? 'var(--neon-amber)' : 'var(--text-primary)';
  }
  if (blockersEl) {
    blockersEl.textContent = blockers;
    blockersEl.style.color = blockers > 0 ? 'var(--neon-rose)' : 'var(--neon-emerald)';
  }
}

function renderActiveTab() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === state.activeTab);
  });

  renderActiveTabContentOnly();
}

function renderActiveTabContentOnly() {
  if (!mainContent) return;

  switch (state.activeTab) {
    case 'kanban':
      renderKanbanBoard();
      break;
    case 'topology':
      renderTopologyGraph();
      break;
    case 'drift':
      renderDriftCenter();
      break;
    case 'decisions':
      renderDecisionsDAG();
      break;
    case 'mermaid':
      renderMermaidStudio();
      break;
    case 'darkmatter':
      renderDarkMatterRadar();
      break;
    default:
      renderKanbanBoard();
  }
}

// 1. KANBAN BOARD
function renderKanbanBoard() {
  const stories = state.projectData?.backlog?.stories || [];
  const epics = state.projectData?.backlog?.epics || [];
  const epicMap = new Map(epics.map(e => [e.id, e.title]));

  const columns = [
    { id: 'backlog', title: 'Backlog', icon: '📥' },
    { id: 'ready', title: 'Ready', icon: '🎯' },
    { id: 'in-progress', title: 'In Progress', icon: '⚡' },
    { id: 'in-review', title: 'In Review', icon: '🔍' },
    { id: 'done', title: 'Completed', icon: '✅' }
  ];

  const html = `
    <div class="kanban-grid">
      ${columns.map(col => {
        const colStories = stories.filter(s => s.status === col.id);
        return `
          <div class="kanban-col">
            <div class="col-header">
              <span class="col-title">${col.icon} ${col.title}</span>
              <span class="col-count">${colStories.length}</span>
            </div>
            <div class="col-body" data-status="${col.id}">
              ${colStories.map(story => renderStoryCard(story, epicMap)).join('')}
              ${colStories.length === 0 ? '<div style="text-align: center; color: var(--text-dim); padding: 32px 0; font-size: 0.8rem;">No stories</div>' : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  mainContent.innerHTML = html;
  startLeaseCountdownTimers();
}

function renderStoryCard(story, epicMap) {
  const isLeased = story.lease && story.lease.agentId;
  const epicTitle = epicMap.get(story.epicId) || 'General';

  return `
    <div class="story-card ${isLeased ? 'leased' : ''}" data-id="${story.id}">
      <div class="story-meta">
        <span class="story-badge">${escapeHtml(epicTitle)}</span>
        <span class="story-points">${story.storyPoints ? story.storyPoints + ' pts' : '—'}</span>
      </div>
      <div class="story-title" onclick="openStoryInspection('${story.id}')">${escapeHtml(story.title)}</div>
      
      ${isLeased ? `
        <div style="margin: 8px 0; display: flex; align-items: center; justify-content: space-between;">
          <div class="lease-badge">
            <span class="pulse-dot" style="background: var(--neon-amber); box-shadow: 0 0 6px var(--neon-amber);"></span>
            <span>${escapeHtml(story.lease.agentId)}</span>
            <span class="timer-countdown" data-expires="${story.lease.expiresAt}">--:--</span>
          </div>
          <button class="release-btn" onclick="releaseTaskLease('${story.id}')">Release</button>
        </div>
      ` : ''}

      <div class="story-footer">
        <select class="project-select" style="padding: 2px 6px; font-size: 0.75rem;" onchange="updateStoryStatus('${story.id}', this.value)">
          <option value="backlog" ${story.status === 'backlog' ? 'selected' : ''}>Backlog</option>
          <option value="ready" ${story.status === 'ready' ? 'selected' : ''}>Ready</option>
          <option value="in-progress" ${story.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
          <option value="in-review" ${story.status === 'in-review' ? 'selected' : ''}>In Review</option>
          <option value="done" ${story.status === 'done' ? 'selected' : ''}>Done</option>
        </select>
        <span style="cursor: pointer; color: var(--neon-cyan);" onclick="openInCodeEditor('${state.projectData.skyhookDir}/backlog/epics.yaml', 1)">Code ➔</span>
      </div>
    </div>
  `;
}

function startLeaseCountdownTimers() {
  const elements = document.querySelectorAll('.timer-countdown');
  elements.forEach(el => {
    const expiresAt = new Date(el.dataset.expires).getTime();
    function tick() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        el.textContent = 'Expired';
        el.style.color = 'var(--neon-rose)';
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        el.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    state.leaseTimers.set(el, interval);
  });
}

function openStoryInspection(storyId) {
  const story = state.projectData?.backlog?.stories?.find(s => s.id === storyId);
  if (!story) return;
  alert(`Story: ${story.title}\nID: ${story.id}\nPriority: ${story.priority || 'medium'}\nAcceptance Criteria:\n${(story.acceptanceCriteria || []).map(c => '• ' + c).join('\n')}`);
}

// 2. TOPOLOGY GRAPH CANVAS
function renderTopologyGraph() {
  const d = state.projectData;
  const reqs = [...(d.requirements?.functional?.requirements || []), ...(d.requirements?.nonFunctional?.requirements || [])];
  const epics = d.backlog?.epics || [];
  const stories = d.backlog?.stories || [];
  const symbols = (d.symbols || []).slice(0, 25); // Top 25 symbols for smooth rendering
  const decisions = d.decisions?.decisions || [];

  const html = `
    <div class="glass-panel topology-container" id="topologyViewport">
      <div class="canvas-hud">
        <button class="btn-secondary" onclick="renderTopologyGraph()">Reset Canvas</button>
        <div style="font-family: var(--font-mono); font-size: 0.8rem; padding: 6px 12px; background: rgba(0,0,0,0.5); border-radius: 6px;">
          Nodes: ${reqs.length} Reqs | ${epics.length} Epics | ${stories.length} Stories | ${symbols.length} AST Symbols | ${decisions.length} ADRs
        </div>
      </div>
      <svg id="topologySvg" width="100%" height="100%" style="cursor: grab;">
        <defs>
          <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.4"/>
          </linearGradient>
          <linearGradient id="violetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#a855f7" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.4"/>
          </linearGradient>
        </defs>
        <g id="topologyWorld"></g>
      </svg>
    </div>
  `;

  mainContent.innerHTML = html;
  drawTopologyElements(reqs, epics, stories, symbols, decisions);
}

function drawTopologyElements(reqs, epics, stories, symbols, decisions) {
  const world = document.getElementById('topologyWorld');
  if (!world) return;

  let svgContent = '';

  // Render Columns: X coords: Reqs (100), Epics (380), Stories (680), Code (980), ADRs (1280)
  const renderNodes = (items, x, color, type) => {
    return items.map((item, idx) => {
      const y = 80 + idx * 60;
      const title = item.title || item.name || item.id;
      const sub = item.filePath ? `${pathBasename(item.filePath)}:${item.line || 1}` : (item.status || type);
      return `
        <g class="graph-node" style="cursor: pointer;" onclick="handleTopologyNodeClick('${type}', '${item.id || item.name}', '${item.filePath || ''}', ${item.line || 1})">
          <rect x="${x}" y="${y}" width="220" height="46" rx="8" fill="rgba(14, 20, 36, 0.9)" stroke="${color}" stroke-width="1.5" />
          <text x="${x + 12}" y="${y + 20}" font-family="Inter" font-size="12" font-weight="600" fill="#f0f6fc">${escapeHtml(title.slice(0, 24))}</text>
          <text x="${x + 12}" y="${y + 36}" font-family="Fira Code" font-size="10" fill="#94a3b8">${escapeHtml(sub.slice(0, 28))}</text>
        </g>
      `;
    }).join('');
  };

  svgContent += renderNodes(reqs, 60, '#00f0ff', 'req');
  svgContent += renderNodes(epics, 340, '#38bdf8', 'epic');
  svgContent += renderNodes(stories, 620, '#a855f7', 'story');
  svgContent += renderNodes(symbols, 900, '#10b981', 'code');
  svgContent += renderNodes(decisions, 1180, '#f59e0b', 'adr');

  world.innerHTML = svgContent;
}

function handleTopologyNodeClick(type, id, filePath, line) {
  if (type === 'code' && filePath) {
    openInCodeEditor(filePath, line);
  } else if (type === 'adr') {
    openInCodeEditor(`${state.projectData.skyhookDir}/decisions/records/${id}.md`, 1);
  } else {
    alert(`Topology Node Selected:\nType: ${type.toUpperCase()}\nIdentifier: ${id}`);
  }
}

// 3. ARCHITECTURE DRIFT CENTER
async function renderDriftCenter() {
  const d = state.projectData;
  const declared = d.techStack?.technologies || [];
  const drift = d.drift || { detected: false, unauthorized: [] };
  const unauthorized = drift.unauthorized || [];

  // If drift scorecard is not yet loaded, show loading state and fetch it
  if (!state.driftScorecard) {
    mainContent.innerHTML = `
      <div class="glass-panel" style="padding: 40px; text-align: center;">
        <div style="font-family: var(--font-hud); font-size: 1.2rem; color: var(--neon-cyan); margin-bottom: 12px;">
          ⚡ SCANNING ARCHITECTURAL BOUNDARIES & AST TOPOLOGY...
        </div>
        <div style="color: var(--text-dim); font-size: 0.85rem; font-family: var(--font-mono);">
          Parsing polyglot import graph, evaluating DDD layer rules, and generating living C4 model...
        </div>
      </div>
    `;

    try {
      const res = await fetch('/api/drift');
      state.driftScorecard = await res.json();
    } catch (e) {
      console.warn('Failed to fetch /api/drift:', e);
    }
  }

  const sc = state.driftScorecard || {
    healthScore: 100,
    pass: true,
    summary: { criticalCount: 0, warningCount: 0, circularCyclesCount: 0, nodesCount: 0, edgesCount: 0, externalPackagesCount: 0 },
    criticalViolations: [],
    warnings: [],
    circularCycles: [],
    c4: { mermaidContainer: '', mermaidComponent: '', diff: { match: true } },
    remediation: { tasks: [] }
  };

  const healthColor = sc.healthScore >= 80 ? 'var(--neon-emerald)' : sc.healthScore >= 50 ? '#f59e0b' : 'var(--neon-rose)';
  const gaugeClass = sc.healthScore >= 80 ? '' : sc.healthScore >= 50 ? 'warn' : 'error';

  const html = `
    <!-- Top Summary & Health Gauge -->
    <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
        <div style="display: flex; align-items: center; gap: 20px;">
          <div class="gauge-circle ${gaugeClass}">
            <span class="gauge-score" style="color: ${healthColor};">${sc.healthScore}%</span>
            <span class="gauge-label">COMPLIANCE</span>
          </div>
          <div>
            <h2 style="font-family: var(--font-hud); font-size: 1.5rem; letter-spacing: 1px; color: ${sc.pass ? 'var(--neon-emerald)' : 'var(--neon-rose)'};">
              ${sc.pass ? '🛡️ SYSTEM BOUNDARIES VERIFIED' : '⚠️ ARCHITECTURAL DRIFT DETECTED'}
            </h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
              Continuous AST polyglot dependency inspection, DDD layer boundary governance, and living C4 models.
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          ${unauthorized.length > 0 ? `
            <button class="btn-cyber" onclick='adoptDriftTechnologies(${JSON.stringify(unauthorized)})'>
              ADOPT ALL DRIFT (1-CLICK)
            </button>
          ` : ''}
          <button class="btn-secondary" onclick="refreshDriftScorecard()">
            RE-SCAN SYSTEM
          </button>
        </div>
      </div>

      <!-- Quick Metrics Strip -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 24px;">
        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Critical Violations</div>
          <div style="font-family: var(--font-hud); font-size: 1.4rem; color: ${sc.summary.criticalCount > 0 ? 'var(--neon-rose)' : 'var(--neon-emerald)'};">
            ${sc.summary.criticalCount}
          </div>
        </div>
        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Circular Cycles</div>
          <div style="font-family: var(--font-hud); font-size: 1.4rem; color: ${sc.summary.circularCyclesCount > 0 ? 'var(--neon-rose)' : 'var(--neon-emerald)'};">
            ${sc.summary.circularCyclesCount}
          </div>
        </div>
        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Graph Topology</div>
          <div style="font-family: var(--font-hud); font-size: 1.4rem; color: var(--neon-cyan);">
            ${sc.summary.nodesCount} <span style="font-size: 0.85rem; color: var(--text-dim);">nodes</span> / ${sc.summary.edgesCount} <span style="font-size: 0.85rem; color: var(--text-dim);">edges</span>
          </div>
        </div>
        <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-dim); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">External Packages</div>
          <div style="font-family: var(--font-hud); font-size: 1.4rem; color: #a78bfa;">
            ${sc.summary.externalPackagesCount}
          </div>
        </div>
      </div>
    </div>

    <!-- Main 2-Column Grid -->
    <div class="drift-container" style="margin-bottom: 24px;">
      <!-- Left Column: Layer Violations & Circular Loops -->
      <div class="glass-panel diff-box" style="border-color: ${sc.criticalViolations.length > 0 ? 'var(--neon-rose)' : 'var(--border-neon)'};">
        <div class="diff-header" style="color: ${sc.criticalViolations.length > 0 ? 'var(--neon-rose)' : 'var(--text-primary)'};">
          <span>LAYER VIOLATIONS & BOUNDARIES (${sc.criticalViolations.length})</span>
          <span class="story-badge">DDD Enforcer</span>
        </div>

        <div>
          ${sc.criticalViolations.length > 0 ? sc.criticalViolations.map(v => `
            <div class="violation-card">
              <div class="violation-header">
                <div class="layer-vector">
                  <span class="layer-pill from">${escapeHtml(v.fromLayer || v.type || 'LAYER')}</span>
                  <span style="color: var(--neon-rose);">➔</span>
                  <span class="layer-pill to">${escapeHtml(v.toLayer || v.module || 'TARGET')}</span>
                </div>
                <button class="btn-secondary" style="font-size: 0.7rem; padding: 2px 8px;" onclick="openInCodeEditor('${escapeHtml(v.file || '')}', ${v.line || 1})">
                  ${escapeHtml(v.file ? v.file.split('/').slice(-1)[0] : 'Open')}:${v.line || 1} ↗
                </button>
              </div>
              <div style="font-size: 0.85rem; color: #fecdd3; margin-bottom: 6px;">
                ${escapeHtml(v.message || '')}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">
                💡 Fix: ${escapeHtml(v.recommendation || v.suggestion || 'Decouple layers using an abstraction.')}
              </div>
            </div>
          `).join('') : `
            <div style="color: var(--neon-emerald); padding: 16px 0; font-family: var(--font-mono); font-size: 0.85rem;">
              ✅ Zero boundary breaches. Strict layer directionality and encapsulation preserved.
            </div>
          `}

          <!-- Circular Loops -->
          ${sc.circularCycles.length > 0 ? `
            <div style="margin-top: 16px; border-top: 1px solid rgba(244, 63, 94, 0.2); padding-top: 12px;">
              <div style="font-family: var(--font-hud); font-size: 0.9rem; color: var(--neon-rose); margin-bottom: 8px;">
                🔄 CIRCULAR DEPENDENCY LOOPS (${sc.circularCycles.length})
              </div>
              ${sc.circularCycles.map(cycle => `
                <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
                    ${cycle.map((node, i) => `
                      <span class="cycle-step-tag">${escapeHtml(node.split('/').slice(-1)[0])}</span>
                      ${i < cycle.length - 1 ? '<span style="color: var(--neon-rose);">➔</span>' : '<span style="color: var(--neon-rose);">➔ 🔁</span>'}
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Right Column: Package Drift & 1-Click ADR Drafting -->
      <div class="glass-panel diff-box">
        <div class="diff-header">
          <span>PACKAGE DRIFT & ADR GOVERNANCE</span>
          <span class="story-points">tech-stack.yaml</span>
        </div>

        <div>
          <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">
            UNDECLARED DISCOVERED TECHNOLOGIES (${unauthorized.length})
          </div>
          ${unauthorized.length > 0 ? unauthorized.map(t => `
            <div class="tech-tag drift" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; width: 100%;">
              <div>
                <span style="font-weight: 600; color: #fff;">${escapeHtml(t.name)}</span>
                <div style="font-size: 0.72rem; color: #ff9fb0;">Used in source code but not declared in tech stack</div>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.72rem;" onclick='adoptDriftTechnologies([${JSON.stringify(t)}])'>
                  Adopt
                </button>
                <button class="btn-cyber" style="padding: 4px 8px; font-size: 0.72rem;" onclick='draftADRFromDriftAction("${escapeHtml(t.name)}", "${escapeHtml(t.category || 'technology')}")'>
                  Draft ADR
                </button>
              </div>
            </div>
          `).join('') : `
            <div style="color: var(--neon-emerald); padding: 12px 0; font-family: var(--font-mono); font-size: 0.85rem;">
              ✅ Zero package drift. All packages match declared tech stack.
            </div>
          `}

          <div style="font-size: 0.8rem; color: var(--text-dim); margin: 16px 0 8px 0; border-top: 1px solid var(--border-dim); padding-top: 12px;">
            DECLARED TECHNOLOGIES (${declared.length})
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${declared.map(t => `
              <div class="tech-tag">
                <span style="color: var(--neon-cyan); font-weight: 600;">${escapeHtml(t.name)}</span>
                <span style="color: var(--text-dim); font-size: 0.72rem;">(${escapeHtml(t.category || 'tech')})</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Living C4 Architecture Model -->
    <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="font-family: var(--font-hud); font-size: 1.2rem; letter-spacing: 1px; color: var(--neon-cyan);">
            🏛️ LIVING C4 ARCHITECTURE MODEL
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.85rem;">
            Reverse-engineered C4 Container and Component models generated directly from AST dependency graph.
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="c4-tab-btn ${state.activeC4View === 'container' ? 'active' : ''}" onclick="toggleC4View('container')">
            CONTAINER DIAGRAM
          </button>
          <button class="c4-tab-btn ${state.activeC4View === 'component' ? 'active' : ''}" onclick="toggleC4View('component')">
            COMPONENT DIAGRAM
          </button>
        </div>
      </div>

      <div style="background: #080c14; border-radius: 8px; border: 1px solid var(--border-dim); padding: 20px; overflow-x: auto; min-height: 280px;" id="c4RenderBox">
        <pre class="mermaid" style="display: flex; justify-content: center;">
${state.activeC4View === 'component' ? (sc.c4.mermaidComponent || 'C4Component\ntitle No Components') : (sc.c4.mermaidContainer || 'C4Container\ntitle No Containers')}
        </pre>
      </div>
    </div>
  `;

  mainContent.innerHTML = html;

  // Render Mermaid client-side
  if (window.mermaid) {
    try {
      window.mermaid.contentLoaded();
    } catch (e) {
      console.warn('Mermaid render error:', e);
    }
  }
}

// 4. DECISIONS DAG, KANBAN & POLICY RADAR STUDIO
async function renderDecisionsDAG() {
  state.adrViewMode = state.adrViewMode || 'kanban';
  const decisions = state.projectData?.decisions?.decisions || [];

  let viewHtml = '';

  if (state.adrViewMode === 'kanban') {
    const cols = [
      { id: 'draft', title: 'Draft / Proposed', color: 'var(--neon-cyan)', icon: '📝' },
      { id: 'under-review', title: 'Under Review', color: 'var(--neon-amber)', icon: '👀' },
      { id: 'accepted', title: 'Accepted & Enforced', color: 'var(--neon-emerald)', icon: '✅' },
      { id: 'superseded', title: 'Superseded / Deprecated', color: 'var(--neon-rose)', icon: '⚠️' }
    ];

    viewHtml = `
      <div class="kanban-grid" style="grid-template-columns: repeat(4, 1fr); min-height: 520px; gap: 16px;">
        ${cols.map(col => {
          const colDecisions = decisions.filter(d => {
            const st = (d.status || 'draft').toLowerCase();
            if (col.id === 'superseded') return st === 'superseded' || st === 'deprecated' || st === 'rejected';
            if (col.id === 'draft') return st === 'draft' || st === 'proposed';
            return st === col.id;
          });

          return `
            <div class="kanban-col glass-panel" style="border-top: 3px solid ${col.color}; padding: 16px;">
              <div class="kanban-col-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div class="kanban-col-title" style="color: ${col.color}; font-family: var(--font-hud); font-size: 1.05rem; font-weight: 700;">
                  <span>${col.icon}</span> ${col.title}
                </div>
                <div class="kanban-col-count" style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 10px;">${colDecisions.length}</div>
              </div>
              <div class="kanban-cards">
                ${colDecisions.map(d => {
                  const st = (d.status || 'draft').toLowerCase();
                  return `
                    <div class="glass-panel" style="padding: 14px; margin-bottom: 12px; background: rgba(14, 20, 36, 0.85); border-left: 3px solid ${col.color};">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span class="story-badge" style="font-family: var(--font-mono);">${escapeHtml(d.id)}</span>
                        <span style="font-size: 0.7rem; font-family: var(--font-mono); color: ${col.color}; text-transform: uppercase;">${escapeHtml(st)}</span>
                      </div>
                      <div style="font-weight: 600; font-size: 0.88rem; margin-bottom: 6px; color: var(--text-primary); line-height: 1.3;">${escapeHtml(d.title)}</div>
                      <div style="font-size: 0.72rem; color: var(--text-dim); margin-bottom: 8px;">
                        ${escapeHtml(d.category || 'architecture')} • ${d.author || 'AI Agent + Human'}
                      </div>
                      ${d.supersededBy ? `<div style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--neon-rose); margin-bottom: 8px;">⚠️ Superseded by ${escapeHtml(d.supersededBy)}</div>` : ''}
                      ${d.supersedes ? `<div style="font-size: 0.72rem; font-family: var(--font-mono); color: var(--neon-cyan); margin-bottom: 8px;">🔗 Supersedes ${escapeHtml(d.supersedes)}</div>` : ''}
                      
                      <div style="display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;">
                        ${st === 'draft' || st === 'proposed' ? `
                          <button class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px; flex: 1;" onclick="handleADRTransition('${d.id}', 'under-review')">
                            Review ➔
                          </button>
                        ` : ''}
                        ${st === 'under-review' ? `
                          <button class="btn-cyber" style="font-size: 0.72rem; padding: 4px 8px; flex: 1;" onclick="handleADRTransition('${d.id}', 'accepted')">
                            Accept ✅
                          </button>
                        ` : ''}
                        ${st === 'accepted' ? `
                          <button class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px; color: var(--neon-amber);" onclick="handleADRSupersedePrompt('${d.id}')">
                            Supersede...
                          </button>
                        ` : ''}
                        <button class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px;" onclick="handleADRDiffView('${d.id}')" title="View Before vs After Diff">
                          Diff 🔀
                        </button>
                        <button class="btn-secondary" style="font-size: 0.72rem; padding: 4px 8px;" onclick="openInCodeEditor('${state.projectData.skyhookDir}/decisions/records/${d.id}.md', 1)" title="Inspect Record">
                          Doc ➔
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
                ${colDecisions.length === 0 ? `<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 24px; font-family: var(--font-mono);">No decisions in ${col.title.toLowerCase()}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (state.adrViewMode === 'dag') {
    let dagMermaid = 'flowchart LR\n    Empty["Loading Decision DAG..."]';
    try {
      const res = await fetch('/api/adr/dag');
      if (res.ok) {
        const json = await res.json();
        if (json.mermaid) dagMermaid = json.mermaid;
      }
    } catch (e) {
      console.warn('Failed to load ADR DAG:', e);
    }

    viewHtml = `
      <div class="glass-panel" style="padding: 24px; background: #080c14; overflow-x: auto; min-height: 480px;">
        <pre class="mermaid" style="display: flex; justify-content: center;">
${dagMermaid}
        </pre>
      </div>
    `;
  } else if (state.adrViewMode === 'diff') {
    const selectedId = state.activeADRDiffId || (decisions[0]?.id || 'ADR-001');
    let diffMermaid = 'flowchart LR\n    Empty["Loading Visual Diff..."]';
    try {
      const res = await fetch(`/api/adr/diff?id=${encodeURIComponent(selectedId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.mermaid) diffMermaid = json.mermaid.replace(/^```mermaid\n/, '').replace(/\n```$/, '');
      }
    } catch (e) {
      console.warn('Failed to load ADR Diff:', e);
    }

    viewHtml = `
      <div class="glass-panel" style="padding: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="font-family: var(--font-hud); font-size: 1rem; color: var(--neon-cyan);">SELECT DECISION:</label>
            <select class="project-select" style="min-width: 260px;" onchange="handleADRDiffView(this.value)">
              ${decisions.map(d => `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${d.id}: ${escapeHtml(d.title)}</option>`).join('')}
            </select>
          </div>
          <div style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-dim);">
            <span style="color: var(--neon-rose); font-weight: 600;">■ Removed / Deprecated</span> | <span style="color: var(--neon-emerald); font-weight: 600;">■ Added</span> | <span style="color: var(--neon-amber); font-weight: 600;">■ Modified</span>
          </div>
        </div>
        <div class="glass-panel" style="padding: 24px; background: #080c14; overflow-x: auto; min-height: 440px;">
          <pre class="mermaid" style="display: flex; justify-content: center;">
${diffMermaid}
          </pre>
        </div>
      </div>
    `;
  }

  const html = `
    <div class="glass-panel" style="padding: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-family: var(--font-hud); font-size: 1.4rem; letter-spacing: 1px; color: var(--text-primary);">
            ADR STUDIO // DECISION GOVERNANCE
          </h2>
          <div style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">
            Lifecycle States: Draft ➔ Under Review ➔ Accepted ➔ Superseded | Living Policy Enforcement
          </div>
        </div>

        <!-- Controls & Mode Switcher -->
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; background: rgba(0,0,0,0.4); border-radius: 8px; padding: 2px; border: 1px solid var(--border-dim);">
            <button class="btn-secondary" style="font-size: 0.8rem; padding: 6px 14px; border: none; ${state.adrViewMode === 'kanban' ? 'background: var(--neon-cyan); color: #000; font-weight: 700;' : ''}" onclick="switchADRView('kanban')">
              ⚡ KANBAN
            </button>
            <button class="btn-secondary" style="font-size: 0.8rem; padding: 6px 14px; border: none; ${state.adrViewMode === 'dag' ? 'background: var(--neon-cyan); color: #000; font-weight: 700;' : ''}" onclick="switchADRView('dag')">
              ⚖️ EVOLUTION DAG
            </button>
            <button class="btn-secondary" style="font-size: 0.8rem; padding: 6px 14px; border: none; ${state.adrViewMode === 'diff' ? 'background: var(--neon-cyan); color: #000; font-weight: 700;' : ''}" onclick="switchADRView('diff')">
              🔀 BEFORE VS AFTER
            </button>
          </div>

          <button class="btn-cyber" style="font-size: 0.8rem; padding: 6px 14px;" onclick="triggerInterceptADR()" title="Scan for newly installed packages and migrations">
            📡 PROACTIVE SCAN
          </button>
          <button class="btn-secondary" style="font-size: 0.8rem; padding: 6px 14px; color: var(--neon-emerald);" onclick="triggerCompilePolicies()" title="Compile living policies to boundaries & ESLint rules">
            🛡️ COMPILE POLICIES
          </button>
        </div>
      </div>

      ${viewHtml}
    </div>
  `;

  mainContent.innerHTML = html;

  if (window.mermaid && (state.adrViewMode === 'dag' || state.adrViewMode === 'diff')) {
    try {
      window.mermaid.contentLoaded();
    } catch (e) {
      console.warn('Mermaid render error in ADR Studio:', e);
    }
  }
}

// 5. LIVING MERMAID STUDIO
function renderMermaidStudio() {
  const planMd = state.projectData?.planMarkdown || '';

  // Extract Mermaid block if available or synthesize Gantt
  let mermaidCode = '';
  const match = planMd.match(/```mermaid([\s\S]*?)```/);
  if (match) {
    mermaidCode = match[1].trim();
  } else {
    // Fallback Gantt
    mermaidCode = `gantt
    title Project Execution Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
    Discovery & Architecture :done, p1, 2026-09-01, 7d
    Core State Machine :done, p2, after p1, 10d
    section Phase 2
    Embedded Web Dashboard :active, p3, after p2, 5d`;
  }

  const html = `
    <div class="glass-panel" style="padding: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
        <h2 style="font-family: var(--font-hud); font-size: 1.4rem; letter-spacing: 1px;">
          LIVING MERMAID STUDIO & MASTER PLAN
        </h2>
        <button class="btn-cyber" id="recompilePlanBtn" onclick="recompileMasterPlan()">
          RECOMPILE MASTER PLAN
        </button>
      </div>

      <div class="glass-panel" style="padding: 24px; background: #080c14; overflow-x: auto; min-height: 400px;" id="mermaidRenderContainer">
        <pre class="mermaid" style="display: flex; justify-content: center;">
${mermaidCode}
        </pre>
      </div>
    </div>
  `;

  mainContent.innerHTML = html;

  // Run client-side mermaid rendering
  if (window.mermaid) {
    try {
      window.mermaid.contentLoaded();
    } catch (e) {
      console.warn('Mermaid rendering:', e);
    }
  }
}

// 6. DARK MATTER RADAR
async function renderDarkMatterRadar() {
  if (!mainContent) return;

  mainContent.innerHTML = `
    <div class="glass-panel" style="text-align: center; padding: 60px; color: var(--text-dim); font-family: var(--font-mono);">
      SCANNING POLYGLOT AST CODEBASE FOR DARK MATTER...
    </div>
  `;

  try {
    const res = await fetch('/api/dark-matter');
    const data = await res.json();
    const summary = data.summary || { totalSymbols: 0, tracedSymbols: 0, untracedSymbols: 0, overallCoverage: 0 };
    const files = data.files || [];
    const languages = data.languages || [];

    const html = `
      <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h2 style="font-family: var(--font-hud); font-size: 1.5rem; letter-spacing: 1px; color: ${summary.overallCoverage >= 70 ? 'var(--neon-emerald)' : summary.overallCoverage >= 40 ? 'var(--neon-amber)' : 'var(--neon-rose)'};">
              🔭 CODEBASE DARK MATTER RADAR
            </h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
              Multi-language AST symbol scanning discovering all grounded and ungrounded classes, functions, and structs.
            </p>
          </div>
          <div style="text-align: right;">
            <div style="font-family: var(--font-mono); font-size: 2rem; font-weight: 700; color: ${summary.overallCoverage >= 70 ? 'var(--neon-emerald)' : 'var(--neon-cyan)'};">
              ${summary.overallCoverage}%
            </div>
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;">Overall Grounding</div>
          </div>
        </div>
      </div>

      <!-- Language Distribution Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        ${languages.map(l => `
          <div class="glass-panel" style="padding: 16px; border-left: 3px solid ${l.coverage >= 70 ? 'var(--neon-emerald)' : l.coverage >= 40 ? 'var(--neon-amber)' : 'var(--neon-rose)'};">
            <div style="font-family: var(--font-hud); font-size: 1.1rem; font-weight: 700; text-transform: uppercase;">${escapeHtml(l.language)}</div>
            <div style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 4px 0;">
              ${l.coverage}%
            </div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">
              ${l.traced} traced / ${l.total} total symbols
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Untraced Dark Matter File Explorer -->
      <div class="glass-panel" style="padding: 24px;">
        <h3 style="font-family: var(--font-hud); font-size: 1.2rem; letter-spacing: 1px; margin-bottom: 16px;">
          FILES WITH UNTRACED CODE SYMBOLS (${files.filter(f => f.untraced > 0).length})
        </h3>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${files.filter(f => f.untraced > 0).slice(0, 30).map(f => `
            <div class="glass-panel" style="padding: 16px; background: rgba(14, 20, 36, 0.5);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="story-badge" style="background: rgba(0, 240, 255, 0.1); color: var(--neon-cyan);">${escapeHtml(f.language)}</span>
                  <span style="font-family: var(--font-mono); font-size: 0.9rem; font-weight: 600;">${escapeHtml(f.file)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-family: var(--font-mono); font-size: 0.8rem; color: ${f.risk === 'critical' ? 'var(--neon-rose)' : f.risk === 'moderate' ? 'var(--neon-amber)' : 'var(--neon-emerald)'}; font-weight: 600;">
                    ${f.untraced} untraced (${f.coverage}% coverage)
                  </span>
                  <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openInCodeEditor('${f.file}', ${f.untracedSymbols[0]?.line || 1})">
                    Open in Editor ➔
                  </button>
                </div>
              </div>
              
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                ${f.untracedSymbols.slice(0, 8).map(s => `
                  <span style="font-family: var(--font-mono); font-size: 0.75rem; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.25); color: #ff9fb0; padding: 2px 8px; border-radius: 4px; cursor: pointer;" onclick="openInCodeEditor('${f.file}', ${s.line})">
                    ${escapeHtml(s.name)} (L${s.line})
                  </span>
                `).join('')}
                ${f.untracedSymbols.length > 8 ? `<span style="font-size: 0.75rem; color: var(--text-dim); align-self: center;">+${f.untracedSymbols.length - 8} more</span>` : ''}
              </div>
            </div>
          `).join('')}
          ${files.filter(f => f.untraced > 0).length === 0 ? '<div style="color: var(--neon-emerald); padding: 24px; text-align: center; font-family: var(--font-mono);">🎉 100% Traceability! Zero Dark Matter code in the repository.</div>' : ''}
        </div>
      </div>
    `;

    mainContent.innerHTML = html;
  } catch (err) {
    mainContent.innerHTML = `<div class="glass-panel" style="padding: 40px; text-align: center; color: var(--neon-rose);">Failed to load Dark Matter Radar: ${escapeHtml(err.message)}</div>`;
  }
}

// --- Event Listeners ---
if (projectSelect) {
  projectSelect.addEventListener('change', (e) => {
    state.currentProjectId = e.target.value;
    loadCurrentProjectData(true);
  });
}

if (editorSelect) {
  editorSelect.value = state.editorPreference;
  editorSelect.addEventListener('change', (e) => {
    state.editorPreference = e.target.value;
    localStorage.setItem('skyhook_editor_pref', e.target.value);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeTab = btn.dataset.tab;
    renderActiveTab();
  });
});

if (fileModal) {
  document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
    fileModal.classList.remove('active');
  });
  fileModal.addEventListener('click', (e) => {
    if (e.target === fileModal) fileModal.classList.remove('active');
  });
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  fetchProjects();
});

// --- ADR Studio Interactive Handlers ---
window.switchADRView = function(mode) {
  state.adrViewMode = mode;
  renderDecisionsDAG();
};

window.handleADRDiffView = function(id) {
  state.activeADRDiffId = id;
  state.adrViewMode = 'diff';
  renderDecisionsDAG();
};

window.handleADRTransition = async function(decisionId, targetStatus) {
  try {
    const res = await fetch('/api/action/transition-adr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionId, targetStatus })
    });
    const result = await res.json();
    if (result.success || !result.error) {
      await loadCurrentProjectData(false);
      renderDecisionsDAG();
    } else {
      alert(`Transition failed: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Transition error: ${err.message}`);
  }
};

window.handleADRSupersedePrompt = async function(oldId) {
  const newId = prompt(`Enter the ID of the new ADR superseding ${oldId} (e.g. ADR-002):`);
  if (!newId || !newId.trim()) return;

  try {
    const res = await fetch('/api/action/supersede-adr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldId, newId: newId.trim() })
    });
    const result = await res.json();
    if (result.success || !result.error) {
      alert(`ADR ${oldId} is now superseded by ${newId.trim()}!`);
      await loadCurrentProjectData(false);
      renderDecisionsDAG();
    } else {
      alert(`Supersede failed: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Supersede error: ${err.message}`);
  }
};

window.triggerInterceptADR = async function() {
  try {
    const res = await fetch('/api/action/intercept-adr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await res.json();
    if (result.count > 0) {
      alert(`Proactive scan complete! Synthesized ${result.count} new draft ADR(s).`);
      await loadCurrentProjectData(false);
      renderDecisionsDAG();
    } else {
      alert('Proactive scan complete: No unrecorded architectural packages or database migrations detected.');
    }
  } catch (err) {
    alert(`Interception scan error: ${err.message}`);
  }
};

window.triggerCompilePolicies = async function() {
  try {
    const res = await fetch('/api/action/compile-policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await res.json();
    if (result.success) {
      alert(`Policies compiled successfully!\n• Active Rules: ${result.compiledCount}\n• Accepted ADRs: ${result.acceptedCount}\n• Deactivated Superseded: ${result.deactivatedCount}\nGenerated: architecture-boundaries.yaml & eslint-adr-rules.json`);
    } else {
      alert(`Compilation failed: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Compilation error: ${err.message}`);
  }
};
