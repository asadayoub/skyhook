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
  leaseTimers: new Map()
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
    'PLAN_RECOMPILED'
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
    }
  } catch (err) {
    alert(`Failed to adopt drift: ${err.message}`);
  }
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
function renderDriftCenter() {
  const d = state.projectData;
  const declared = d.techStack?.technologies || [];
  const drift = d.drift || { detected: false, unauthorized: [] };
  const unauthorized = drift.unauthorized || [];

  const html = `
    <div class="glass-panel" style="padding: 24px; margin-bottom: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h2 style="font-family: var(--font-hud); font-size: 1.5rem; letter-spacing: 1px; color: ${drift.detected ? 'var(--neon-rose)' : 'var(--neon-emerald)'};">
            ${drift.detected ? '⚠️ ARCHITECTURAL DRIFT DETECTED' : '✅ CODEBASE IN COMPLIANCE'}
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
            Continuous AST drift detection comparing inferred dependencies against declared <code>tech-stack.yaml</code>.
          </p>
        </div>
        ${unauthorized.length > 0 ? `
          <button class="btn-cyber" onclick='adoptDriftTechnologies(${JSON.stringify(unauthorized)})'>
            ADOPT ALL DRIFT (1-CLICK)
          </button>
        ` : ''}
      </div>
    </div>

    <div class="drift-container">
      <div class="glass-panel diff-box">
        <div class="diff-header">
          <span>DECLARED TECH STACK (${declared.length})</span>
          <span class="story-points">tech-stack.yaml</span>
        </div>
        <div>
          ${declared.map(t => `
            <div class="tech-tag">
              <span style="color: var(--neon-cyan); font-weight: 600;">${escapeHtml(t.name)}</span>
              <span style="color: var(--text-dim);">(${escapeHtml(t.category || 'general')})</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="glass-panel diff-box" style="border-color: ${unauthorized.length > 0 ? 'var(--neon-rose)' : 'var(--border-neon)'};">
        <div class="diff-header" style="color: ${unauthorized.length > 0 ? 'var(--neon-rose)' : 'var(--text-primary)'};">
          <span>INFERRED / UNDECLARED CODEBASE DRIFT (${unauthorized.length})</span>
          <span class="story-badge">AST Analyzer</span>
        </div>
        <div>
          ${unauthorized.length > 0 ? unauthorized.map(t => `
            <div class="tech-tag drift" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-weight: 600;">${escapeHtml(t.name)}</span>
                <div style="font-size: 0.75rem; color: #ff9fb0;">Used in codebase but undeclared</div>
              </div>
              <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick='adoptDriftTechnologies([${JSON.stringify(t)}])'>
                Adopt
              </button>
            </div>
          `).join('') : '<div style="color: var(--neon-emerald); padding: 20px 0; font-family: var(--font-mono); font-size: 0.85rem;">Zero drift detected. All packages comply with architecture standards.</div>'}
        </div>
      </div>
    </div>
  `;

  mainContent.innerHTML = html;
}

// 4. DECISIONS DAG & POLICY RADAR
function renderDecisionsDAG() {
  const decisions = state.projectData?.decisions?.decisions || [];

  const html = `
    <div class="glass-panel" style="padding: 24px;">
      <h2 style="font-family: var(--font-hud); font-size: 1.4rem; letter-spacing: 1px; margin-bottom: 16px;">
        ARCHITECTURAL DECISION RECORDS (ADR)
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
        ${decisions.map(d => `
          <div class="glass-panel" style="padding: 16px; border-left: 3px solid ${d.status === 'accepted' ? 'var(--neon-emerald)' : 'var(--neon-amber)'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span class="story-badge">${escapeHtml(d.id)}</span>
              <span class="story-points" style="color: ${d.status === 'accepted' ? 'var(--neon-emerald)' : 'var(--neon-amber)'};">${escapeHtml(d.status)}</span>
            </div>
            <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 6px;">${escapeHtml(d.title)}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 12px;">Category: ${escapeHtml(d.category || 'architecture')} • ${formatRelativeTime(d.createdAt)}</div>
            ${d.enforcement ? `<div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--neon-cyan); background: rgba(0, 240, 255, 0.08); padding: 4px 8px; border-radius: 4px; margin-bottom: 12px;">Policy: ${escapeHtml(d.enforcement.rule || 'Enforced')}</div>` : ''}
            <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; padding: 6px 12px;" onclick="openInCodeEditor('${state.projectData.skyhookDir}/decisions/records/${d.id}.md', 1)">
              Inspect ADR Record ➔
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  mainContent.innerHTML = html;
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
