/**
 * Live ADR File Watcher
 * Watches .skyhook/decisions/records/ for edits in markdown files and triggers instant sync.
 */

import fs from 'fs';
import path from 'path';
import { ADRSyncEngine } from './ADRSyncEngine.js';

export class ADRWatcher {
  constructor(skyhookDir, options = {}) {
    this.skyhookDir = skyhookDir;
    this.recordsDir = path.join(skyhookDir, 'decisions', 'records');
    this.debounceMs = options.debounceMs || 300;
    this.onChange = options.onChange || null;
    this.watcher = null;
    this.debounceTimer = null;
    this.syncEngine = new ADRSyncEngine(skyhookDir);
  }

  start(ctx = {}) {
    if (!fs.existsSync(this.recordsDir)) {
      fs.mkdirSync(this.recordsDir, { recursive: true });
    }

    if (this.watcher) {
      return;
    }

    this.watcher = fs.watch(this.recordsDir, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;

      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        try {
          const syncResult = this.syncEngine.sync(ctx);
          if (typeof this.onChange === 'function') {
            this.onChange({ eventType, filename, syncResult });
          }
        } catch (err) {
          console.error('[Skyhook ADR Watcher Error]:', err.message);
        }
      }, this.debounceMs);
    });

    return {
      watching: true,
      directory: this.recordsDir
    };
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    clearTimeout(this.debounceTimer);
    return { watching: false };
  }
}
