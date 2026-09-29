/**
 * Bridge - Universal Platform Bridge Abstraction
 * Automatically engages BrowserBridge or VSCodeBridge depending on runtime.
 */

import { BrowserBridge } from './BrowserBridge.js';
import { VSCodeBridge } from './VSCodeBridge.js';

export class Bridge {
  /**
   * Factory creating the appropriate bridge for the current environment
   * @param {Object} [options]
   * @returns {BrowserBridge|VSCodeBridge}
   */
  static create(options = {}) {
    // Detect VS Code or Cursor Webview environment
    const isVSCode = typeof acquireVsCodeApi !== 'undefined' ||
      (typeof window !== 'undefined' && window.__VSCODE_WEBVIEW__);

    if (isVSCode) {
      return new VSCodeBridge(options);
    }
    return new BrowserBridge(options);
  }
}
