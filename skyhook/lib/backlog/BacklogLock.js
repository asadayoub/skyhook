/**
 * Backlog Lock
 * Provides cross-platform advisory file locking for .skyhook/backlog/
 * Prevents race conditions and lost updates when multiple processes or agents modify the backlog concurrently.
 */

import fs from 'fs';
import path from 'path';

export class BacklogLock {
  constructor(skyhookDir, options = {}) {
    this.skyhookDir = skyhookDir;
    this.backlogDir = path.join(skyhookDir, 'backlog');
    this.lockPath = path.join(this.backlogDir, '.lock');
    this.lockTtlMs = options.ttlMs || 10000; // 10s default TTL before stale
    this.acquired = false;
  }

  /**
   * Acquire the lock with retry and exponential backoff
   * @param {number} timeoutMs - Max time to wait before timing out (default 5000ms)
   * @returns {Promise<boolean>} True if acquired
   */
  async acquire(timeoutMs = 5000) {
    if (!fs.existsSync(this.backlogDir)) {
      fs.mkdirSync(this.backlogDir, { recursive: true });
    }

    const startTime = Date.now();
    let delay = 30;

    while (Date.now() - startTime < timeoutMs) {
      try {
        // 'wx' flag: open for writing, fails if path exists (atomic on POSIX and Windows)
        const fd = fs.openSync(this.lockPath, 'wx');
        const lockInfo = JSON.stringify({
          pid: process.pid,
          createdAt: Date.now(),
          expiresAt: Date.now() + this.lockTtlMs
        });
        fs.writeSync(fd, lockInfo, 0, 'utf-8');
        fs.closeSync(fd);
        this.acquired = true;
        return true;
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Check if lock is stale
          if (this.isLockStale()) {
            this.forceBreakStaleLock();
            continue;
          }
          // Wait and retry with jittered exponential backoff
          await new Promise(r => setTimeout(r, delay + Math.random() * 20));
          delay = Math.min(delay * 1.5, 500);
        } else {
          throw err;
        }
      }
    }

    throw new Error(`Failed to acquire Backlog lock at ${this.lockPath} after ${timeoutMs}ms (contention detected)`);
  }

  /**
   * Check if current lock file has exceeded TTL
   */
  isLockStale() {
    try {
      if (!fs.existsSync(this.lockPath)) return false;
      const content = fs.readFileSync(this.lockPath, 'utf-8');
      const data = JSON.parse(content);
      return Date.now() > (data.expiresAt || (data.createdAt + this.lockTtlMs));
    } catch {
      // If corrupted or unreadable, check file modification time
      try {
        const stats = fs.statSync(this.lockPath);
        return (Date.now() - stats.mtimeMs) > this.lockTtlMs;
      } catch {
        return false;
      }
    }
  }

  /**
   * Safely break a stale lock
   */
  forceBreakStaleLock() {
    try {
      if (fs.existsSync(this.lockPath)) {
        fs.unlinkSync(this.lockPath);
      }
    } catch {
      // Ignore if unlinked concurrently
    }
  }

  /**
   * Synchronous acquisition with short busy-wait retry
   * @param {number} timeoutMs
   * @returns {boolean}
   */
  acquireSync(timeoutMs = 3000) {
    if (!fs.existsSync(this.backlogDir)) {
      fs.mkdirSync(this.backlogDir, { recursive: true });
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const fd = fs.openSync(this.lockPath, 'wx');
        const lockInfo = JSON.stringify({
          pid: process.pid,
          createdAt: Date.now(),
          expiresAt: Date.now() + this.lockTtlMs
        });
        fs.writeSync(fd, lockInfo, 0, 'utf-8');
        fs.closeSync(fd);
        this.acquired = true;
        return true;
      } catch (err) {
        if (err.code === 'EEXIST') {
          if (this.isLockStale()) {
            this.forceBreakStaleLock();
            continue;
          }
          const waitEnd = Date.now() + 20;
          while (Date.now() < waitEnd) {}
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Failed to acquire Backlog lock at ${this.lockPath} after ${timeoutMs}ms (contention detected)`);
  }

  /**
   * Release the lock
   */
  release() {
    if (this.acquired || fs.existsSync(this.lockPath)) {
      try {
        fs.unlinkSync(this.lockPath);
      } catch {
        // Ignored
      }
      this.acquired = false;
    }
  }

  /**
   * Static helper to execute an async callback with atomic lock acquisition
   * @param {string} skyhookDir - Directory containing .skyhook
   * @param {Function} callback - Function to execute inside lock
   * @param {Object} options - Lock options
   */
  static async withLock(skyhookDir, callback, options = {}) {
    if (!skyhookDir) {
      return await callback();
    }
    const lock = new BacklogLock(skyhookDir, options);
    try {
      await lock.acquire(options.timeoutMs || 5000);
      return await callback();
    } finally {
      lock.release();
    }
  }

  /**
   * Static helper to execute a synchronous callback with atomic lock acquisition
   * @param {string} skyhookDir
   * @param {Function} callback
   * @param {Object} options
   */
  static withLockSync(skyhookDir, callback, options = {}) {
    if (!skyhookDir) {
      return callback();
    }
    const lock = new BacklogLock(skyhookDir, options);
    try {
      lock.acquireSync(options.timeoutMs || 3000);
      return callback();
    } finally {
      lock.release();
    }
  }
}
