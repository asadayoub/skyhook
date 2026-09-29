/**
 * PanZoomController - Universal Hardware-Accelerated Matrix Pan & Zoom Engine
 * Zero-dependency interactive viewport manager for SVG and HTML canvas elements.
 * Supports mouse-wheel zoom, drag-to-pan, pinch-to-zoom, 1:1 reset, and fit-to-viewport.
 */

export class PanZoomController {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent viewport container
   * @param {SVGElement|HTMLElement} options.target - Inner element being transformed
   * @param {number} [options.minScale=0.2]
   * @param {number} [options.maxScale=4.0]
   * @param {Function} [options.onTransform] - Callback when matrix updates
   */
  constructor(options = {}) {
    this.container = options.container;
    this.target = options.target;
    this.minScale = options.minScale || 0.2;
    this.maxScale = options.maxScale || 4.0;
    this.onTransform = options.onTransform || null;

    this.scale = 1.0;
    this.translateX = 0;
    this.translateY = 0;

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.touchDistance = null;

    this._boundHandlers = {};
    this.init();
  }

  init() {
    if (!this.container || !this.target) return;

    this.target.style.transformOrigin = '0 0';
    this.target.style.transition = 'none';

    // Mouse drag & wheel
    this._boundHandlers.onMouseDown = this.onMouseDown.bind(this);
    this._boundHandlers.onMouseMove = this.onMouseMove.bind(this);
    this._boundHandlers.onMouseUp = this.onMouseUp.bind(this);
    this._boundHandlers.onWheel = this.onWheel.bind(this);

    // Touchpad & touch gestures
    this._boundHandlers.onTouchStart = this.onTouchStart.bind(this);
    this._boundHandlers.onTouchMove = this.onTouchMove.bind(this);
    this._boundHandlers.onTouchEnd = this.onTouchEnd.bind(this);

    this.container.addEventListener('mousedown', this._boundHandlers.onMouseDown);
    window.addEventListener('mousemove', this._boundHandlers.onMouseMove);
    window.addEventListener('mouseup', this._boundHandlers.onMouseUp);
    this.container.addEventListener('wheel', this._boundHandlers.onWheel, { passive: false });

    this.container.addEventListener('touchstart', this._boundHandlers.onTouchStart, { passive: true });
    this.container.addEventListener('touchmove', this._boundHandlers.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this._boundHandlers.onTouchEnd);

    this.container.style.cursor = 'grab';
    this.container.style.userSelect = 'none';

    this.applyTransform();
  }

  onMouseDown(e) {
    // Only drag on left click and not clicking directly on buttons or inputs
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, .pan-zoom-hud')) return;

    this.isDragging = true;
    this.startX = e.clientX - this.translateX;
    this.startY = e.clientY - this.translateY;
    this.container.style.cursor = 'grabbing';
  }

  onMouseMove(e) {
    if (!this.isDragging) return;
    this.translateX = e.clientX - this.startX;
    this.translateY = e.clientY - this.startY;
    this.applyTransform();
  }

  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.style.cursor = 'grab';
    }
  }

  onWheel(e) {
    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.min(Math.max(this.scale * zoomFactor, this.minScale), this.maxScale);

    if (newScale === this.scale) return;

    // Anchor zoom to cursor point
    this.translateX = mouseX - (mouseX - this.translateX) * (newScale / this.scale);
    this.translateY = mouseY - (mouseY - this.translateY) * (newScale / this.scale);
    this.scale = newScale;

    this.applyTransform();
  }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.startX = e.touches[0].clientX - this.translateX;
      this.startY = e.touches[0].clientY - this.translateY;
    } else if (e.touches.length === 2) {
      this.isDragging = false;
      this.touchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }

  onTouchMove(e) {
    if (e.touches.length === 1 && this.isDragging) {
      e.preventDefault();
      this.translateX = e.touches[0].clientX - this.startX;
      this.translateY = e.touches[0].clientY - this.startY;
      this.applyTransform();
    } else if (e.touches.length === 2 && this.touchDistance) {
      e.preventDefault();
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = currentDistance / this.touchDistance;
      this.scale = Math.min(Math.max(this.scale * factor, this.minScale), this.maxScale);
      this.touchDistance = currentDistance;
      this.applyTransform();
    }
  }

  onTouchEnd() {
    this.isDragging = false;
    this.touchDistance = null;
  }

  zoomIn(step = 0.25) {
    const newScale = Math.min(this.scale * (1 + step), this.maxScale);
    this.zoomToCenter(newScale);
  }

  zoomOut(step = 0.25) {
    const newScale = Math.max(this.scale * (1 - step), this.minScale);
    this.zoomToCenter(newScale);
  }

  zoomToCenter(newScale) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.translateX = centerX - (centerX - this.translateX) * (newScale / this.scale);
    this.translateY = centerY - (centerY - this.translateY) * (newScale / this.scale);
    this.scale = newScale;

    this.applyTransform();
  }

  reset() {
    this.scale = 1.0;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransform();
  }

  fitToViewport(padding = 40) {
    if (!this.container || !this.target) return;

    let bbox = null;
    if (typeof this.target.getBBox === 'function') {
      try {
        bbox = this.target.getBBox();
      } catch (_) {}
    }

    if (!bbox || !bbox.width || !bbox.height) {
      bbox = {
        x: 0,
        y: 0,
        width: this.target.scrollWidth || 1200,
        height: this.target.scrollHeight || 700
      };
    }

    const containerRect = this.container.getBoundingClientRect();
    const availableWidth = containerRect.width - padding * 2;
    const availableHeight = containerRect.height - padding * 2;

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const scaleX = availableWidth / bbox.width;
    const scaleY = availableHeight / bbox.height;
    this.scale = Math.min(Math.max(Math.min(scaleX, scaleY), this.minScale), 1.25);

    this.translateX = (containerRect.width - bbox.width * this.scale) / 2 - bbox.x * this.scale;
    this.translateY = (containerRect.height - bbox.height * this.scale) / 2 - bbox.y * this.scale;

    this.applyTransform();
  }

  applyTransform() {
    if (!this.target) return;
    this.target.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;

    if (typeof this.onTransform === 'function') {
      this.onTransform({
        scale: this.scale,
        translateX: this.translateX,
        translateY: this.translateY
      });
    }
  }

  /**
   * Mount a cybernetic HUD toolbar for Pan/Zoom controls
   * @param {HTMLElement} parentContainer
   * @returns {HTMLElement}
   */
  mountHUD(parentContainer = this.container) {
    if (!parentContainer) return null;

    const hud = document.createElement('div');
    hud.className = 'pan-zoom-hud';
    hud.innerHTML = `
      <button class="pz-btn" data-action="zoom-in" title="Zoom In (+)">➕</button>
      <button class="pz-btn" data-action="zoom-out" title="Zoom Out (-)">➖</button>
      <button class="pz-btn" data-action="reset" title="Reset View (1:1)">1:1</button>
      <button class="pz-btn" data-action="fit" title="Fit to Canvas (⛶)">⛶</button>
      <span class="pz-scale-badge">${Math.round(this.scale * 100)}%</span>
    `;

    hud.querySelector('[data-action="zoom-in"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomIn();
      this.updateHUDScale(hud);
    });
    hud.querySelector('[data-action="zoom-out"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomOut();
      this.updateHUDScale(hud);
    });
    hud.querySelector('[data-action="reset"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.reset();
      this.updateHUDScale(hud);
    });
    hud.querySelector('[data-action="fit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.fitToViewport();
      this.updateHUDScale(hud);
    });

    parentContainer.appendChild(hud);
    return hud;
  }

  updateHUDScale(hudElement) {
    if (!hudElement) return;
    const badge = hudElement.querySelector('.pz-scale-badge');
    if (badge) {
      badge.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }

  destroy() {
    if (!this.container) return;
    this.container.removeEventListener('mousedown', this._boundHandlers.onMouseDown);
    window.removeEventListener('mousemove', this._boundHandlers.onMouseMove);
    window.removeEventListener('mouseup', this._boundHandlers.onMouseUp);
    this.container.removeEventListener('wheel', this._boundHandlers.onWheel);
    this.container.removeEventListener('touchstart', this._boundHandlers.onTouchStart);
    this.container.removeEventListener('touchmove', this._boundHandlers.onTouchMove);
    this.container.removeEventListener('touchend', this._boundHandlers.onTouchEnd);
  }
}
