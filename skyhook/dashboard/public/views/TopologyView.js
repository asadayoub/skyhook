/**
 * TopologyView - Interactive SVG Architecture & Traceability Graph
 * Maps Requirements ➔ Epics ➔ Stories ➔ AST Code Symbols ➔ ADR Decisions.
 */

import { BaseView } from '../core/BaseView.js';
import { PanZoomController } from '../core/PanZoomController.js';
import { StoryModal } from '../components/StoryModal.js';
import { ADRModal } from '../components/ADRModal.js';
import { RequirementModal } from '../components/RequirementModal.js';

export class TopologyView extends BaseView {
  constructor(context) {
    super(context);
    this.panZoom = null;
    this.storyModal = new StoryModal({ bridge: this.bridge, store: this.store });
    this.adrModal = new ADRModal({ bridge: this.bridge, store: this.store });
    this.reqModal = new RequirementModal({ bridge: this.bridge, store: this.store });
  }
  render() {
    const d = this.store.getState().projectData || {};
    const reqs = [
      ...(Array.isArray(d.requirements?.functional?.requirements) ? d.requirements.functional.requirements : []),
      ...(Array.isArray(d.requirements?.nonFunctional?.requirements) ? d.requirements.nonFunctional.requirements : [])
    ];
    const epics = Array.isArray(d.backlog?.epics) ? d.backlog.epics : [];
    const stories = Array.isArray(d.backlog?.stories) ? d.backlog.stories : [];
    const symbols = Array.isArray(d.symbols) ? d.symbols.slice(0, 25) : [];
    const decisions = Array.isArray(d.decisions?.decisions) ? d.decisions.decisions : [];

    return `
      <div class="glass-panel topology-container topology-scroll-wrapper" id="topologyViewport" style="min-height: 700px; position: relative; overflow: auto; border-radius: 12px;">
        <div class="canvas-hud" style="position: sticky; top: 16px; left: 16px; z-index: 10; display: inline-flex; gap: 12px; align-items: center; margin-bottom: -50px; pointer-events: none;">
          <button id="resetTopologyBtn" class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; pointer-events: auto;">Reset View</button>
          <div style="font-family: var(--font-mono); font-size: 0.8rem; padding: 6px 12px; background: rgba(0,0,0,0.75); border-radius: 6px; border: 1px solid var(--border-dim); pointer-events: auto;">
            Nodes: ${reqs.length} Reqs &bull; ${epics.length} Epics &bull; ${stories.length} Stories &bull; ${symbols.length} Symbols &bull; ${decisions.length} ADRs
          </div>
        </div>

        <svg id="topologySvg" viewBox="0 0 1460 760" width="100%" height="100%" style="min-width: 1200px; min-height: 680px; cursor: grab; display: block;">
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
  }

  async postRender() {
    this.drawNodes();

    const viewport = this.container?.querySelector('#topologyViewport');
    const world = this.container?.querySelector('#topologyWorld');
    if (viewport && world) {
      this.panZoom = new PanZoomController({
        container: viewport,
        target: world,
        minScale: 0.2,
        maxScale: 3.5
      });
      this.panZoom.mountHUD(viewport);
    }

    const resetBtn = this.container?.querySelector('#resetTopologyBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.panZoom) this.panZoom.reset();
        this.drawNodes();
      });
    }

    this.registerSubscription(
      this.store.subscribe('projectData', () => {
        this.drawNodes();
      })
    );
  }

  async unmount() {
    if (this.panZoom) {
      this.panZoom.destroy();
      this.panZoom = null;
    }
    await super.unmount();
  }

  drawNodes() {
    const world = this.container?.querySelector('#topologyWorld');
    if (!world) return;

    const d = this.store.getState().projectData || {};

    const extractList = (source) => {
      if (!source) return [];
      if (Array.isArray(source)) return source;
      if (Array.isArray(source.requirements)) return source.requirements;
      if (typeof source === 'object') {
        return Object.entries(source)
          .filter(([k]) => k !== 'schemaVersion')
          .map(([k, v]) => (typeof v === 'object' && v !== null ? { id: k, ...v } : { id: k, title: String(v) }));
      }
      return [];
    };

    const reqs = [
      ...extractList(d.requirements?.functional),
      ...extractList(d.requirements?.nonFunctional)
    ];
    const epics = Array.isArray(d.backlog?.epics) ? d.backlog.epics : [];
    const stories = Array.isArray(d.backlog?.stories) ? d.backlog.stories : [];
    const symbols = Array.isArray(d.symbols) ? d.symbols.slice(0, 30) : [];
    const decisions = Array.isArray(d.decisions?.decisions) ? d.decisions.decisions : [];

    const pathBasename = (p) => p ? String(p).split(/[\\/]/).pop() : '';

    const maxCount = Math.max(reqs.length, epics.length, stories.length, symbols.length, decisions.length, 6);
    const canvasHeight = Math.max(760, 140 + maxCount * 64);
    const svgEl = this.container?.querySelector('#topologySvg');
    if (svgEl) {
      svgEl.setAttribute('viewBox', `0 0 1460 ${canvasHeight}`);
      svgEl.style.minHeight = `${canvasHeight}px`;
    }

    const extractNodeInfo = (item, type, idx) => {
      if (typeof item === 'string') {
        return { title: item, sub: type.toUpperCase(), itemId: item, filePath: '', line: 1 };
      }

      const filePath = item.filePath || item.file || '';
      const line = Number(item.line || 1);

      if (type === 'code') {
        const symbolType = item.symbolType || 'symbol';
        const name = item.symbolName || item.name || (filePath ? pathBasename(filePath) : `Symbol ${idx + 1}`);
        const title = symbolType === 'class' ? `class ${name}` : `${name}()`;
        const sub = filePath ? `${pathBasename(filePath)}:${line}` : symbolType;
        const itemId = String(item.symbolName || item.name || `code-${idx}`);
        return { title, sub, itemId, filePath, line };
      }

      if (type === 'req') {
        const title = item.title || item.statement || item.name || item.id || `Requirement ${idx + 1}`;
        const itemId = String(item.id || `REQ-${idx + 1}`);
        const sub = `${itemId} • ${item.status || item.priority || 'requirement'}`;
        return { title, sub, itemId, filePath, line };
      }

      if (type === 'epic') {
        const title = item.title || item.name || item.id || `Epic ${idx + 1}`;
        const itemId = String(item.id || `EPIC-${idx + 1}`);
        const storyCount = Array.isArray(item.stories) ? item.stories.length : 0;
        const sub = `${itemId} • ${storyCount} stories`;
        return { title, sub, itemId, filePath, line };
      }

      if (type === 'story') {
        const title = item.title || item.name || item.id || `Story ${idx + 1}`;
        const itemId = String(item.id || `STORY-${idx + 1}`);
        const points = item.storyPoints ? `${item.storyPoints} pts` : '';
        const sub = `${itemId} • ${item.status || 'backlog'} ${points}`.trim();
        return { title, sub, itemId, filePath, line };
      }

      if (type === 'adr') {
        const title = item.title || item.id || `Decision ${idx + 1}`;
        const itemId = String(item.id || `ADR-${idx + 1}`);
        const sub = `${itemId} • ${item.status || 'accepted'}`;
        return { title, sub, itemId, filePath, line };
      }

      const title = item.title || item.name || item.symbolName || item.id || `Node ${idx + 1}`;
      const itemId = String(item.id || item.name || title || `node-${idx}`);
      const sub = filePath ? `${pathBasename(filePath)}:${line}` : type.toUpperCase();
      return { title, sub, itemId, filePath, line };
    };

    const renderNodes = (items, x, color, type) => {
      if (!Array.isArray(items) || items.length === 0) {
        return `
          <g transform="translate(${x}, 100)">
            <rect width="220" height="48" rx="8" fill="rgba(14, 20, 36, 0.4)" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4,4" />
            <text x="110" y="28" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#64748b">No ${type}s found</text>
          </g>
        `;
      }

      return items.filter(Boolean).map((item, idx) => {
        const y = 100 + idx * 64;
        const info = extractNodeInfo(item, type, idx);

        return `
          <g class="graph-node" style="cursor: pointer;" data-type="${type}" data-id="${this.escapeHtml(info.itemId)}" data-filepath="${this.escapeHtml(info.filePath)}" data-line="${info.line}">
            <rect x="${x}" y="${y}" width="220" height="48" rx="8" fill="rgba(14, 20, 36, 0.92)" stroke="${color}" stroke-width="1.5" />
            <text x="${x + 12}" y="${y + 20}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="600" fill="#f0f6fc">
              ${this.escapeHtml(info.title.length > 25 ? info.title.slice(0, 24) + '…' : info.title)}
            </text>
            <text x="${x + 12}" y="${y + 36}" font-family="Fira Code, monospace" font-size="10" fill="#94a3b8">
              ${this.escapeHtml(info.sub.length > 28 ? info.sub.slice(0, 27) + '…' : info.sub)}
            </text>
          </g>
        `;
      }).join('');
    };

    const columns = [
      { title: '📋 REQUIREMENTS', x: 60, count: reqs.length, color: '#00f0ff' },
      { title: '⚡ EPICS', x: 340, count: epics.length, color: '#38bdf8' },
      { title: '🎯 STORIES', x: 620, count: stories.length, color: '#a855f7' },
      { title: '💻 CODE (AST SYMBOLS)', x: 900, count: symbols.length, color: '#10b981' },
      { title: '⚖️ ADR DECISIONS', x: 1180, count: decisions.length, color: '#f59e0b' }
    ];

    let headersSvg = columns.map(c => `
      <g transform="translate(${c.x}, 40)">
        <text x="0" y="20" font-family="var(--font-hud, Inter)" font-size="12" font-weight="700" fill="${c.color}" letter-spacing="1">
          ${c.title} (${c.count})
        </text>
        <line x1="0" y1="28" x2="220" y2="28" stroke="${c.color}" stroke-opacity="0.3" stroke-width="1" />
      </g>
    `).join('');

    let svg = headersSvg;
    svg += renderNodes(reqs, 60, '#00f0ff', 'req');
    svg += renderNodes(epics, 340, '#38bdf8', 'epic');
    svg += renderNodes(stories, 620, '#a855f7', 'story');
    svg += renderNodes(symbols, 900, '#10b981', 'code');
    svg += renderNodes(decisions, 1180, '#f59e0b', 'adr');

    world.innerHTML = svg;

    // Attach click listeners to SVG nodes
    const nodeEls = world.querySelectorAll('.graph-node');
    nodeEls.forEach(node => {
      node.addEventListener('click', () => {
        const type = node.dataset.type;
        const id = node.dataset.id;
        const filePath = node.dataset.filepath;
        const line = Number(node.dataset.line || 1);
        const pref = this.store.getState().editorPreference;

        if (type === 'code' && filePath) {
          this.bridge.openEditor(filePath, line, pref);
        } else if (type === 'adr') {
          const allDecisions = this.store.getState().projectData?.decisions?.decisions || [];
          const adr = allDecisions.find(d => d.id === id);
          if (adr) {
            this.adrModal.open(adr);
          } else {
            const skyhookDir = this.store.getState().projectData?.skyhookDir;
            if (skyhookDir) this.bridge.openEditor(`${skyhookDir}/decisions/records/${id}.md`, 1, pref);
          }
        } else if (type === 'story') {
          const allStories = this.store.getState().projectData?.backlog?.stories || [];
          const story = allStories.find(s => s.id === id);
          if (story) {
            this.storyModal.open(story);
          }
        } else if (type === 'req') {
          const allReqs = [
            ...extractList(this.store.getState().projectData?.requirements?.functional),
            ...extractList(this.store.getState().projectData?.requirements?.nonFunctional)
          ];
          const req = allReqs.find(r => r.id === id);
          if (req) {
            this.reqModal.open(req, req.type || 'functional');
          }
        } else {
          const skyhookDir = this.store.getState().projectData?.skyhookDir;
          if (skyhookDir) {
            this.bridge.openEditor(`${skyhookDir}/backlog/epics.yaml`, 1, pref);
          }
        }
      });
    });
  }
}
