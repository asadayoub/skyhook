/**
 * Dashboard Watcher
 * Observes file changes in .skyhook/ with debounced triggers to broadcast
 * real-time event notifications to the WebSocket gateway.
 */

import fs from 'fs';
import path from 'path';

export class DashboardWatcher {
  /**
   * @param {import('./WebSocketGateway.js').WebSocketGateway} gateway
   */
  constructor(gateway) {
    this.gateway = gateway;
    this.watchers = new Map(); // path -> fs.FSWatcher
    this.debounceTimers = new Map(); // key -> Timeout
  }

  /**
   * Watch a project's .skyhook directory
   * @param {string} skyhookDir
   * @param {string} projectId
   */
  watchProject(skyhookDir, projectId = 'active') {
    if (!skyhookDir || !fs.existsSync(skyhookDir)) return;
    if (this.watchers.has(skyhookDir)) return; // Already watching

    try {
      const watcher = fs.watch(skyhookDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Ignore lockfiles and temporary files
        if (filename.includes('.lock') || filename.endsWith('.tmp') || filename.includes('.git')) {
          return;
        }

        const debouncedKey = `${projectId}:${filename}`;
        if (this.debounceTimers.has(debouncedKey)) {
          clearTimeout(this.debounceTimers.get(debouncedKey));
        }

        const timer = setTimeout(() => {
          this.debounceTimers.delete(debouncedKey);
          this.handleFileChange(projectId, filename);
        }, 60);

        this.debounceTimers.set(debouncedKey, timer);
      });

      this.watchers.set(skyhookDir, watcher);
    } catch {
      // Non-fatal if recursive watch is unsupported on specific platform
    }
  }

  /**
   * Categorize change and broadcast typed event
   * @param {string} projectId
   * @param {string} filename
   */
  handleFileChange(projectId, filename) {
    const normalized = filename.replace(/\\/g, '/');

    if (normalized.includes('backlog/')) {
      this.gateway.broadcast('BACKLOG_UPDATED', { projectId, filename: normalized });
    } else if (normalized.includes('decisions/')) {
      this.gateway.broadcast('DECISIONS_UPDATED', { projectId, filename: normalized });
    } else if (normalized.includes('requirements/')) {
      this.gateway.broadcast('REQUIREMENTS_UPDATED', { projectId, filename: normalized });
    } else if (normalized.includes('tech-stack.yaml')) {
      this.gateway.broadcast('TECH_STACK_UPDATED', { projectId, filename: normalized });
    } else if (normalized.includes('plan/')) {
      this.gateway.broadcast('PLAN_UPDATED', { projectId, filename: normalized });
    } else {
      this.gateway.broadcast('PROJECT_UPDATED', { projectId, filename: normalized });
    }
  }

  /**
   * Stop all watchers
   */
  close() {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {
        // Ignore
      }
    }
    this.watchers.clear();
  }
}
