/**
 * CodeModal Component - Cybernetic Source Code Inspector Dialog
 * Displays syntax-highlighted code lines with line numbering and IDE launch button.
 */

export class CodeModal {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.element
   * @param {import('../core/Bridge.js').Bridge} options.bridge
   * @param {import('../core/Store.js').Store} options.store
   */
  constructor(options = {}) {
    this.element = options.element;
    this.bridge = options.bridge;
    this.store = options.store;
    this.currentFilePath = null;
    this.currentLine = 1;
  }

  mount() {
    if (!this.element) return;

    this.element.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-family: var(--font-hud); font-size: 1.1rem; font-weight: 700; color: var(--neon-cyan);">CODE INSPECTOR</span>
            <span id="modalTitle" style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary);">path/to/file.js</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="openIdeBtn" class="btn-cyber" style="padding: 6px 14px; font-size: 0.8rem;">
              LAUNCH IN IDE
            </button>
            <button id="modalCloseBtn" class="btn-secondary" style="padding: 6px 14px; font-size: 0.8rem;">
              CLOSE
            </button>
          </div>
        </div>
        <div class="modal-body">
          <div class="code-container">
            <div id="modalCodeLines" class="code-lines"></div>
            <div id="modalCodeContent" class="code-content"></div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();

    this.bridge.on('OPEN_CODE_MODAL', ({ filePath, line }) => {
      this.open(filePath, line);
    });
  }

  bindEvents() {
    const closeBtn = document.getElementById('modalCloseBtn');
    const openIdeBtn = document.getElementById('openIdeBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (openIdeBtn) {
      openIdeBtn.addEventListener('click', () => {
        if (this.currentFilePath) {
          const pref = this.store.getState().editorPreference || 'vscode';
          this.bridge.openEditor(this.currentFilePath, this.currentLine, pref === 'modal' ? 'vscode' : pref);
        }
      });
    }

    // Close on backdrop click or Escape
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.element.classList.contains('active')) {
        this.close();
      }
    });
  }

  async open(filePath, line = 1) {
    this.currentFilePath = filePath;
    this.currentLine = line;

    const modalTitle = document.getElementById('modalTitle');
    const modalCodeContent = document.getElementById('modalCodeContent');
    const modalCodeLines = document.getElementById('modalCodeLines');

    if (modalTitle) modalTitle.textContent = filePath;
    if (modalCodeContent) modalCodeContent.innerHTML = '<div style="color: var(--text-dim); padding: 20px;">Loading file contents...</div>';
    if (modalCodeLines) modalCodeLines.innerHTML = '';

    this.element.classList.add('active');

    try {
      const projectDir = this.store.getState().projectData?.projectDir;
      const data = await this.bridge.get('/api/file', { path: filePath, projectDir });
      const lines = (data.content || '').split('\n');

      let linesHtml = '';
      let contentHtml = '';

      for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const isTarget = lineNum === Number(line);
        const lineClass = isTarget ? 'code-line target-line' : 'code-line';

        linesHtml += `<div class="${lineClass}">${lineNum}</div>`;
        contentHtml += `<div class="${lineClass}">${this.escapeHtml(lines[i]) || '&nbsp;'}</div>`;
      }

      if (modalCodeLines) modalCodeLines.innerHTML = linesHtml;
      if (modalCodeContent) modalCodeContent.innerHTML = contentHtml;

      // Scroll target line into view
      setTimeout(() => {
        const targetEl = modalCodeContent?.querySelector('.target-line');
        if (targetEl) {
          targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 50);
    } catch (err) {
      if (modalCodeContent) {
        modalCodeContent.innerHTML = `<div style="color: var(--neon-rose); padding: 20px;">Failed to load file: ${err.message}</div>`;
      }
    }
  }

  close() {
    this.element.classList.remove('active');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
