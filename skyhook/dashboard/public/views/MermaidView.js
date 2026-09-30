import { BaseView } from '../core/BaseView.js';
import { Toast } from '../components/Toast.js';
import { PanZoomController } from '../core/PanZoomController.js';

export class MermaidView extends BaseView {
  constructor(context) {
    super(context);
    this.panZoom = null;
    this.currentDiagramType = 'master-plan';
  }

  render() {
    return `
      <div class="glass-panel" style="padding: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 14px;">
          <div>
            <h2 style="font-family: var(--font-hud); font-size: 1.4rem; letter-spacing: 1px; color: var(--text-primary); display: flex; align-items: center; gap: 10px;">
              <span>📊</span> LIVING MERMAID STUDIO & ARCHITECTURE VISUALIZER
            </h2>
            <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">
              Interactive diagram engine with pan, zoom, and 1-click code deep-linking.
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <select id="diagramTypeSelect" class="project-select" style="min-width: 240px;" aria-label="Diagram Type">
              <option value="ast-graph" ${this.currentDiagramType === 'ast-graph' ? 'selected' : ''}>AST Codebase & Symbol Relationships</option>
              <option value="master-plan" ${this.currentDiagramType === 'master-plan' ? 'selected' : ''}>Master Plan Execution Gantt</option>
              <option value="c4-container" ${this.currentDiagramType === 'c4-container' ? 'selected' : ''}>C4 System Architecture</option>
              <option value="adr-evolution" ${this.currentDiagramType === 'adr-evolution' ? 'selected' : ''}>ADR Decision Evolution DAG</option>
              <option value="code-traceability" ${this.currentDiagramType === 'code-traceability' ? 'selected' : ''}>Code Traceability Graph</option>
            </select>

            <button id="recompileMasterPlanBtn" class="btn-cyber" style="padding: 8px 16px;">
              ⚡ RECOMPILE PLAN
            </button>
          </div>
        </div>

        <div class="glass-panel" style="position: relative; background: #070a12; min-height: 580px; height: 640px; overflow: hidden; border-radius: 12px;" id="mermaidViewport">
          <div id="mermaidTransformTarget" style="display: inline-block; min-width: 100%; min-height: 100%;">
            <pre class="mermaid" id="mermaidPre" style="display: flex; justify-content: center; align-items: center; margin: 0; padding: 40px; min-height: 560px;"></pre>
          </div>
        </div>
      </div>
    `;
  }

  async getDiagramCode() {
    const d = this.store.getState().projectData || {};

    if (this.currentDiagramType === 'ast-graph') {
      try {
        const projectDir = d.projectDir;
        const res = await this.bridge.get('/api/ast/graph', projectDir ? { projectDir } : {});
        if (res && res.mermaid) return res.mermaid;
      } catch (err) {
        console.warn('[MermaidView] Failed to fetch AST graph:', err);
      }
    }

    if (this.currentDiagramType === 'master-plan') {
      const planMd = d.planMarkdown || '';
      const match = planMd.match(/```mermaid([\s\S]*?)```/);
      if (match) return match[1].trim();

      const epics = Array.isArray(d.backlog?.epics) ? d.backlog.epics : [];
      const stories = Array.isArray(d.backlog?.stories) ? d.backlog.stories : [];
      let code = 'gantt\n  title Project Execution Timeline\n  dateFormat YYYY-MM-DD\n';
      for (const e of epics) {
        code += `  section ${e.title.replace(/[:`]/g, '')}\n`;
        const childStories = stories.filter(s => s.epicId === e.id);
        if (childStories.length === 0) {
          code += `  ${e.title.slice(0, 24)} :done, 2026-09-01, 7d\n`;
        } else {
          for (const s of childStories.slice(0, 5)) {
            const status = s.status === 'done' ? 'done' : s.status === 'in-progress' ? 'active' : '';
            code += `  ${s.title.slice(0, 24)} :${status}, 2026-09-01, ${s.storyPoints || 3}d\n`;
          }
        }
      }
      return code;
    }

    if (this.currentDiagramType === 'c4-container') {
      return `C4Container
  title System Architecture & Inferred Containers
  Person(user, "User / AI Agent", "Interacts via CLI or Web Dashboard")
  System_Boundary(c1, "Skyhook Local Runtime") {
    Container(daemon, "Skyhook Daemon & HTTP/WS Gateway", "Node.js", "Handles RPC requests and file watches")
    ContainerDb(store, "Local State Engine", ".skyhook YAML", "Single source of truth for decisions & backlog")
    Container(ast, "AST Codebase Tracer", "Tree-Sitter", "Polyglot AST parser and grounding radar")
  }
  Rel(user, daemon, "Issues RPC commands", "REST / WebSocket")
  Rel(daemon, store, "Reads & writes atomically", "Advisory lock")
  Rel(daemon, ast, "Indexes codebase", "AST walker")`;
    }

    if (this.currentDiagramType === 'adr-evolution') {
      const decisions = Array.isArray(d.decisions?.decisions) ? d.decisions.decisions : [];
      if (decisions.length === 0) {
        return 'flowchart TD\n  Start[No ADR Decisions Recorded Yet]';
      }
      let code = 'flowchart TD\n';
      for (const dec of decisions) {
        const shape = dec.status === 'superseded' ? `["${dec.id}: ${dec.title.slice(0, 20)}<br/>(SUPERSEDED)"]` : `["${dec.id}: ${dec.title.slice(0, 20)}"]`;
        code += `  ${dec.id.replace(/-/g, '_')}${shape}\n`;
        if (dec.supersedes) {
          code += `  ${dec.supersedes.replace(/-/g, '_')} -->|superseded by| ${dec.id.replace(/-/g, '_')}\n`;
        }
      }
      return code;
    }

    if (this.currentDiagramType === 'code-traceability') {
      const symbols = Array.isArray(d.symbols) ? d.symbols.slice(0, 15) : [];
      const stories = Array.isArray(d.backlog?.stories) ? d.backlog.stories.slice(0, 8) : [];
      let code = 'graph LR\n';
      for (const s of stories) {
        code += `  story_${s.id.replace(/-/g, '_')}["Story: ${s.title.slice(0, 18)}"]\n`;
      }
      for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i];
        const symId = `sym_${i}`;
        code += `  ${symId}["${sym.name || 'symbol'}<br/>${sym.file || ''}"]\n`;
        if (stories[i % stories.length]) {
          code += `  story_${stories[i % stories.length].id.replace(/-/g, '_')} -.->|grounded in| ${symId}\n`;
        }
      }
      return code;
    }

    return 'graph TD\n  A[Skyhook] --> B[Architecture Radar]';
  }

  async postRender() {
    this.renderDiagram();

    const typeSelect = this.container?.querySelector('#diagramTypeSelect');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        this.currentDiagramType = e.target.value;
        this.renderDiagram();
      });
    }

    const recompileBtn = this.container?.querySelector('#recompileMasterPlanBtn');
    if (recompileBtn) {
      recompileBtn.addEventListener('click', async () => {
        const skyhookDir = this.store.getState().projectData?.skyhookDir;
        try {
          await this.bridge.call('recompile-plan', { skyhookDir });
          Toast.show('Master project plan recompiled successfully', 'success');
          this.renderDiagram();
        } catch (err) {
          Toast.show(`Recompilation failed: ${err.message}`, 'error');
        }
      });
    }
  }

  async renderDiagram() {
    const viewport = this.container?.querySelector('#mermaidViewport');
    const target = this.container?.querySelector('#mermaidTransformTarget');
    const pre = this.container?.querySelector('#mermaidPre');
    if (!pre || !target || !viewport) return;

    if (this.panZoom) {
      this.panZoom.destroy();
      this.panZoom = null;
    }

    // Remove existing HUD
    const oldHud = viewport.querySelector('.pan-zoom-hud');
    if (oldHud) oldHud.remove();

    const code = await this.getDiagramCode();
    pre.removeAttribute('data-processed');
    pre.innerHTML = this.escapeHtml(code);

    if (typeof window !== 'undefined' && window.mermaid) {
      try {
        await window.mermaid.run({ nodes: [pre] });
      } catch (err) {
        console.warn('[MermaidView] Render warning:', err);
      }
    }

    // Mount PanZoomController
    this.panZoom = new PanZoomController({
      container: viewport,
      target: target,
      minScale: 0.15,
      maxScale: 3.5
    });
    this.panZoom.mountHUD(viewport);

    // Attach AST symbol deep-linking on SVG text elements
    this.attachSymbolDeepLinks(viewport);
  }

  attachSymbolDeepLinks(container) {
    const textEls = container.querySelectorAll('svg text, svg .node');
    const symbols = this.store.getState().projectData?.symbols || [];
    const pref = this.store.getState().editorPreference;

    textEls.forEach(el => {
      const text = el.textContent || '';
      const matched = symbols.find(s => s.name && text.includes(s.name));
      if (matched && matched.file) {
        el.style.cursor = 'pointer';
        el.setAttribute('title', `Click to open ${matched.file}:${matched.line || 1} in editor`);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.bridge.openEditor(matched.file, matched.line || 1, pref);
        });
      }
    });
  }

  async unmount() {
    if (this.panZoom) {
      this.panZoom.destroy();
      this.panZoom = null;
    }
    await super.unmount();
  }
}
