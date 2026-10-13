import fs from 'fs';
import path from 'path';

export class SymbolCache {
  /**
   * @param {string} projectDir - Workspace root
   * @param {string} [customCachePath] - Optional override for cache file path
   */
  constructor(projectDir, customCachePath = null) {
    this.projectDir = path.resolve(projectDir);
    this.cacheDir = path.join(this.projectDir, '.skyhook', '.cache');
    this.cacheFile = customCachePath ? path.resolve(customCachePath) : path.join(this.cacheDir, 'symbols.json');
    this.data = {
      version: '1.0',
      files: {}
    };
    this.isDirty = false;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Load cache from disk if it exists
   * @returns {boolean} True if loaded successfully
   */
  load() {
    if (!fs.existsSync(this.cacheFile)) {
      return false;
    }
    try {
      const raw = fs.readFileSync(this.cacheFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === '1.0' && typeof parsed.files === 'object') {
        this.data = parsed;
        return true;
      }
    } catch {}
    return false;
  }

  /**
   * Get cached symbols for a file if mtime and size match
   * @param {string} relPath 
   * @param {number} mtimeMs 
   * @param {number} size 
   * @returns {Array<Object>|null}
   */
  get(relPath, mtimeMs, size) {
    const entry = this.data.files[relPath];
    if (!entry) {
      this.misses++;
      return null;
    }
    // Check mtime tolerance (within 1ms) and exact file size
    if (Math.abs(entry.mtimeMs - mtimeMs) < 2 && entry.size === size && Array.isArray(entry.symbols)) {
      this.hits++;
      return entry.symbols;
    }
    this.misses++;
    return null;
  }

  /**
   * Set cache entry for a file
   * @param {string} relPath 
   * @param {number} mtimeMs 
   * @param {number} size 
   * @param {string} hash 
   * @param {Array<Object>} symbols 
   */
  set(relPath, mtimeMs, size, hash, symbols) {
    this.data.files[relPath] = {
      mtimeMs,
      size,
      hash,
      symbols
    };
    this.isDirty = true;
  }

  /**
   * Remove deleted files from cache
   * @param {Set<string>} activeFilesSet 
   */
  prune(activeFilesSet) {
    let pruned = false;
    for (const cachedPath of Object.keys(this.data.files)) {
      if (!activeFilesSet.has(cachedPath)) {
        delete this.data.files[cachedPath];
        pruned = true;
      }
    }
    if (pruned) {
      this.isDirty = true;
    }
  }

  /**
   * Save cache to disk
   */
  save() {
    if (!this.isDirty) return;
    try {
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.data, null, 2), 'utf-8');
      this.isDirty = false;
    } catch {}
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.data = {
      version: '1.0',
      files: {}
    };
    this.isDirty = true;
    if (fs.existsSync(this.cacheFile)) {
      try {
        fs.unlinkSync(this.cacheFile);
      } catch {}
    }
  }
}

