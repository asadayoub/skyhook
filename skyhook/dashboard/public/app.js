/**
 * Legacy app.js forwarder
 * Redirects to the modular architecture entrypoint main.js
 * Provides backward-compatible initWebSocket export.
 */
import './main.js';

export function initWebSocket() {
  // Handled automatically by modular Bridge / BrowserBridge
  return true;
}
