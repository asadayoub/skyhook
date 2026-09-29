/**
 * TopologyView - Interactive SVG Architecture & Traceability Graph
 * Maps Requirements ➔ Epics ➔ Stories ➔ AST Code Symbols ➔ ADR Decisions.
 */

import { BaseView } from '../core/BaseView.js';

export class TopologyView extends BaseView {
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

    const resetBtn = this.container?.querySelector('#resetTopologyBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.drawNodes());
    }

    this.registerSubscription(
      this.store.subscribe('projectData', () => {
        this.drawNodes();
      })
    );
  }

  drawNodes() {
    const world = this.container?.querySelector('#topologyWorld');
    if (!world) return;

    const d = this.store.getState().projectData || {};
    const reqs = [
      ...(Array.isArray(d.requirements?.functional?.requirements) ? d.requirements.functional.requirements : []),
      ...(Array.isArray(d.requirements?.nonFunctional?.requirements) ? d.requirements.nonFunctional.requirements : [])
    ];
    const epics = Array.isArray(d.backlog?.epics) ? d.backlog.epics : [];
    const stories = Array.isArray(d.backlog?.stories) ? d.backlog.stories : [];
    const symbols = Array.isArray(d.symbols) ? d.symbols.slice(0, 25) : [];
    const decisions = Array.isArray(d.decisions?.decisions) ? d.decisions.decisions : [];

    const pathBasename = (p) => p ? String(p).split(/[\\/]/).pop() : '';

    const renderNodes = (items, x, color, type) => {
      if (!Array.isArray(items)) return '';
      return items.filter(Boolean).map((item, idx) => {
        const y = 80 + idx * 60;
        const titleRaw = typeof item === 'string'
          ? item
          : (item.title || item.name || item.id || item.statement || item.description || `Node ${idx + 1}`);
        const title = String(titleRaw || 'Untitled');

        const filePath = item.filePath || item.file || '';
        const subRaw = filePath
          ? `${pathBasename(filePath)}:${item.line || 1}`
          : (item.status || item.type || type || '');
        const sub = String(subRaw || '');

        const itemId = String(typeof item === 'string' ? item : (item.id || item.name || title || `node-${idx}`));

        return `
          <g class="graph-node" style="cursor: pointer;" data-type="${type}" data-id="${this.escapeHtml(itemId)}" data-filepath="${this.escapeHtml(filePath)}" data-line="${item.line || 1}">
            <rect x="${x}" y="${y}" width="220" height="46" rx="8" fill="rgba(14, 20, 36, 0.9)" stroke="${color}" stroke-width="1.5" />
            <text x="${x + 12}" y="${y + 20}" font-family="Inter" font-size="12" font-weight="600" fill="#f0f6fc">${this.escapeHtml(title.slice(0, 24))}</text>
            <text x="${x + 12}" y="${y + 36}" font-family="Fira Code" font-size="10" fill="#94a3b8">${this.escapeHtml(sub.slice(0, 28))}</text>
          </g>
        `;
      }).join('');
    };

    let svg = '';
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
          const skyhookDir = this.store.getState().projectData?.skyhookDir;
          if (skyhookDir) {
            this.bridge.openEditor(`${skyhookDir}/decisions/records/${id}.md`, 1, pref);
          }
        } else {
          alert(`Topology Node Selected:\nType: ${type.toUpperCase()}\nIdentifier: ${id}`);
        }
      });
    });
  }
}
