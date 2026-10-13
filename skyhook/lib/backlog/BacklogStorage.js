import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml, getTimestamp } from '../utils.js';

export class BacklogStorage {
  /**
   * Check if a project uses modular directory-based backlog storage
   * @param {string} skyhookDir 
   * @returns {boolean}
   */
  static isModular(skyhookDir) {
    if (!skyhookDir) return false;
    const backlogDir = path.join(skyhookDir, 'backlog');
    if (!fs.existsSync(backlogDir)) return false;

    return (
      fs.existsSync(path.join(backlogDir, 'epics')) ||
      fs.existsSync(path.join(backlogDir, 'stories')) ||
      fs.existsSync(path.join(backlogDir, 'tasks'))
    );
  }

  /**
   * Read backlog from modular directory layout
   * @param {string} skyhookDir 
   * @returns {Object} Backlog object with epics, stories, tasks
   */
  static readModularBacklog(skyhookDir) {
    const backlogDir = path.join(skyhookDir, 'backlog');
    const metaPath = path.join(backlogDir, 'metadata.yaml');
    const metaDoc = fs.existsSync(metaPath) ? readYaml(metaPath) : {};

    const backlog = {
      schemaVersion: metaDoc?.schemaVersion || '1.0.0',
      metadata: metaDoc?.metadata || {
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
        version: '0.1.0'
      },
      prioritization: metaDoc?.prioritization || {
        method: 'wsjf',
        criteria: {}
      },
      epics: [],
      stories: [],
      tasks: []
    };

    const readDirectoryItems = (subDir) => {
      const dirPath = path.join(backlogDir, subDir);
      if (!fs.existsSync(dirPath)) return [];
      const items = [];
      try {
        const files = fs.readdirSync(dirPath);
        for (const f of files) {
          if (f.endsWith('.yaml') || f.endsWith('.yml')) {
            const item = readYaml(path.join(dirPath, f));
            if (item && item.id) {
              items.push(item);
            }
          }
        }
      } catch {}
      return items;
    };

    backlog.epics = readDirectoryItems('epics');
    backlog.stories = readDirectoryItems('stories');
    backlog.tasks = readDirectoryItems('tasks');

    return backlog;
  }

  /**
   * Write backlog to modular directory layout
   * @param {string} skyhookDir 
   * @param {Object} data 
   */
  static writeModularBacklog(skyhookDir, data) {
    const backlogDir = path.join(skyhookDir, 'backlog');
    const epicsDir = path.join(backlogDir, 'epics');
    const storiesDir = path.join(backlogDir, 'stories');
    const tasksDir = path.join(backlogDir, 'tasks');

    if (!fs.existsSync(epicsDir)) fs.mkdirSync(epicsDir, { recursive: true });
    if (!fs.existsSync(storiesDir)) fs.mkdirSync(storiesDir, { recursive: true });
    if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });

    // Write metadata.yaml
    const metaPath = path.join(backlogDir, 'metadata.yaml');
    writeYaml(metaPath, {
      schemaVersion: data.schemaVersion || '1.0.0',
      metadata: data.metadata || {
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
        version: '0.1.0'
      },
      prioritization: data.prioritization || {
        method: 'wsjf',
        criteria: {}
      }
    });

    const writeItemsAndPrune = (dirPath, items) => {
      const activeIds = new Set();
      for (const item of items || []) {
        if (!item || !item.id) continue;
        activeIds.add(`${item.id}.yaml`);
        activeIds.add(`${item.id}.yml`);
        const filePath = path.join(dirPath, `${item.id}.yaml`);
        writeYaml(filePath, item);
      }

      // Prune deleted items
      try {
        const existingFiles = fs.readdirSync(dirPath);
        for (const file of existingFiles) {
          if ((file.endsWith('.yaml') || file.endsWith('.yml')) && !activeIds.has(file)) {
            try {
              fs.unlinkSync(path.join(dirPath, file));
            } catch {}
          }
        }
      } catch {}
    };

    writeItemsAndPrune(epicsDir, data.epics);
    writeItemsAndPrune(storiesDir, data.stories);
    writeItemsAndPrune(tasksDir, data.tasks);

    // Keep monolithic epics.yaml in sync as a combined rollup snapshot
    const rollupPath = path.join(backlogDir, 'epics.yaml');
    writeYaml(rollupPath, {
      schemaVersion: data.schemaVersion || '1.0.0',
      metadata: data.metadata || {
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
        version: '0.1.0'
      },
      epics: data.epics || [],
      stories: data.stories || [],
      tasks: data.tasks || [],
      prioritization: data.prioritization || {
        method: 'wsjf',
        criteria: {}
      }
    });
  }

  /**
   * Migrate backlog between modular and monolithic formats
   * @param {string} skyhookDir 
   * @param {'modular'|'monolithic'} targetFormat 
   * @returns {Object} Migration result
   */
  static migrateBacklog(skyhookDir, targetFormat = 'modular') {
    const backlogDir = path.join(skyhookDir, 'backlog');
    if (!fs.existsSync(backlogDir)) {
      fs.mkdirSync(backlogDir, { recursive: true });
    }

    const isCurrentlyModular = this.isModular(skyhookDir);

    if (targetFormat === 'modular') {
      let data;
      if (isCurrentlyModular) {
        data = this.readModularBacklog(skyhookDir);
      } else {
        const monolithicPath = path.join(backlogDir, 'epics.yaml');
        data = fs.existsSync(monolithicPath) ? readYaml(monolithicPath) : null;
      }

      data = data || { epics: [], stories: [], tasks: [] };
      if (!data.epics) data.epics = [];
      if (!data.stories) data.stories = [];
      if (!data.tasks) data.tasks = [];

      this.writeModularBacklog(skyhookDir, data);

      return {
        success: true,
        format: 'modular',
        message: `Successfully migrated backlog to modular storage layout.`,
        counts: {
          epics: data.epics.length,
          stories: data.stories.length,
          tasks: data.tasks.length
        }
      };
    } else if (targetFormat === 'monolithic') {
      let data;
      if (isCurrentlyModular) {
        data = this.readModularBacklog(skyhookDir);
      } else {
        const monolithicPath = path.join(backlogDir, 'epics.yaml');
        data = fs.existsSync(monolithicPath) ? readYaml(monolithicPath) : null;
      }

      data = data || { epics: [], stories: [], tasks: [] };
      if (!data.epics) data.epics = [];
      if (!data.stories) data.stories = [];
      if (!data.tasks) data.tasks = [];

      // Write monolithic epics.yaml
      const rollupPath = path.join(backlogDir, 'epics.yaml');
      writeYaml(rollupPath, {
        schemaVersion: data.schemaVersion || '1.0.0',
        metadata: data.metadata || {
          createdAt: getTimestamp(),
          updatedAt: getTimestamp(),
          version: '0.1.0'
        },
        epics: data.epics,
        stories: data.stories,
        tasks: data.tasks,
        prioritization: data.prioritization || {
          method: 'wsjf',
          criteria: {}
        }
      });

      // Remove modular directories and metadata.yaml
      for (const sub of ['epics', 'stories', 'tasks']) {
        const subPath = path.join(backlogDir, sub);
        if (fs.existsSync(subPath)) {
          try {
            fs.rmSync(subPath, { recursive: true, force: true });
          } catch {}
        }
      }
      const metaPath = path.join(backlogDir, 'metadata.yaml');
      if (fs.existsSync(metaPath)) {
        try {
          fs.unlinkSync(metaPath);
        } catch {}
      }

      return {
        success: true,
        format: 'monolithic',
        message: `Successfully consolidated backlog into monolithic epics.yaml.`,
        counts: {
          epics: data.epics.length,
          stories: data.stories.length,
          tasks: data.tasks.length
        }
      };
    } else {
      throw new Error(`Unsupported target format '${targetFormat}'. Expected 'modular' or 'monolithic'.`);
    }
  }
}

