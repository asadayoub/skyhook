/**
 * Toast Component - Cybernetic HUD Floating Toast Notifications
 */

export class Toast {
  static container = null;

  static init() {
    if (typeof document === 'undefined') return;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'hudToastContainer';
      this.container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show a toast message
   * @param {string} message
   * @param {'info'|'success'|'warn'|'error'} [type='info']
   * @param {number} [duration=3500]
   */
  static show(message, type = 'info', duration = 3500) {
    this.init();
    if (!this.container) return;

    const colors = {
      info: { border: 'var(--neon-cyan)', bg: 'rgba(0, 240, 255, 0.15)', text: '#e0f2fe' },
      success: { border: 'var(--neon-emerald)', bg: 'rgba(16, 185, 129, 0.15)', text: '#d1fae5' },
      warn: { border: 'var(--neon-amber)', bg: 'rgba(245, 158, 11, 0.15)', text: '#fef3c7' },
      error: { border: 'var(--neon-rose)', bg: 'rgba(244, 63, 94, 0.15)', text: '#ffe4e6' }
    };

    const c = colors[type] || colors.info;

    const el = document.createElement('div');
    el.style.cssText = `
      background: rgba(13, 18, 30, 0.95);
      border: 1px solid ${c.border};
      backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 10px ${c.border};
      border-radius: 8px;
      padding: 10px 18px;
      color: ${c.text};
      font-family: var(--font-hud);
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      pointer-events: auto;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      opacity: 0;
      transform: translateY(10px);
    `;
    el.textContent = message;

    this.container.appendChild(el);

    // Fade in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    // Fade out and remove
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-10px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
}
