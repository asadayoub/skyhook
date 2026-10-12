import fs from 'fs';
import { readYaml, writeYaml, getTimestamp } from '../utils.js';

export class BacklogMergeDriver {
  /**
   * Deep merge subtasks by id
   * @param {Array<Object>} baseSubtasks 
   * @param {Array<Object>} ourSubtasks 
   * @param {Array<Object>} theirSubtasks 
   * @returns {Array<Object>}
   */
  static mergeSubtasks(baseSubtasks = [], ourSubtasks = [], theirSubtasks = []) {
    const baseMap = new Map((baseSubtasks || []).map(s => [s.id, s]));
    const ourMap = new Map((ourSubtasks || []).map(s => [s.id, s]));
    const theirMap = new Map((theirSubtasks || []).map(s => [s.id, s]));

    const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
    const merged = [];

    for (const id of allIds) {
      const b = baseMap.get(id);
      const o = ourMap.get(id);
      const t = theirMap.get(id);

      if (o && t) {
        // If either completed it, mark completed
        const completed = o.completed || t.completed;
        const title = (t.title !== b?.title) ? t.title : o.title;
        merged.push({ ...b, ...o, ...t, title, completed });
      } else if (o && !t) {
        if (!b || JSON.stringify(o) !== JSON.stringify(b)) {
          merged.push(o);
        }
      } else if (!o && t) {
        if (!b || JSON.stringify(t) !== JSON.stringify(b)) {
          merged.push(t);
        }
      }
    }

    return merged;
  }

  /**
   * Three-way merge list of items (epics, stories, tasks) by unique ID
   * @param {Array<Object>} baseList 
   * @param {Array<Object>} ourList 
   * @param {Array<Object>} theirList 
   * @returns {Array<Object>}
   */
  static mergeItemLists(baseList = [], ourList = [], theirList = []) {
    const baseMap = new Map((baseList || []).map(item => [item.id, item]));
    const ourMap = new Map((ourList || []).map(item => [item.id, item]));
    const theirMap = new Map((theirList || []).map(item => [item.id, item]));

    const allIds = new Set([...baseMap.keys(), ...ourMap.keys(), ...theirMap.keys()]);
    const merged = [];

    for (const id of allIds) {
      const b = baseMap.get(id);
      const o = ourMap.get(id);
      const t = theirMap.get(id);

      if (o && t) {
        if (!b) {
          // Added concurrently on both branches - merge properties
          const combined = { ...o, ...t };
          if (Array.isArray(o.subtasks) || Array.isArray(t.subtasks)) {
            combined.subtasks = this.mergeSubtasks([], o.subtasks || [], t.subtasks || []);
          }
          if (Array.isArray(o.targetFiles) || Array.isArray(t.targetFiles)) {
            combined.targetFiles = [...new Set([...(o.targetFiles || []), ...(t.targetFiles || [])])];
          }
          if (Array.isArray(o.relatedRequirements) || Array.isArray(t.relatedRequirements)) {
            combined.relatedRequirements = [...new Set([...(o.relatedRequirements || []), ...(t.relatedRequirements || [])])];
          }
          merged.push(combined);
        } else {
          // Existed in base
          const ourChanged = JSON.stringify(o) !== JSON.stringify(b);
          const theirChanged = JSON.stringify(t) !== JSON.stringify(b);

          if (ourChanged && !theirChanged) {
            merged.push(o);
          } else if (!ourChanged && theirChanged) {
            merged.push(t);
          } else if (!ourChanged && !theirChanged) {
            merged.push(o);
          } else {
            // Both changed - three-way property merge
            const combined = { ...b, ...o, ...t };

            // Status resolution heuristics
            if (o.status !== t.status) {
              const terminalStatuses = ['done', 'implemented', 'in-review'];
              if (terminalStatuses.includes(o.status)) {
                combined.status = o.status;
              } else if (terminalStatuses.includes(t.status)) {
                combined.status = t.status;
              } else {
                combined.status = o.updatedAt >= (t.updatedAt || '') ? o.status : t.status;
              }
            }

            // Subtask array merge
            if (Array.isArray(o.subtasks) || Array.isArray(t.subtasks)) {
              combined.subtasks = this.mergeSubtasks(b.subtasks || [], o.subtasks || [], t.subtasks || []);
            }

            // Target files array merge
            if (Array.isArray(o.targetFiles) || Array.isArray(t.targetFiles)) {
              combined.targetFiles = [...new Set([...(o.targetFiles || []), ...(t.targetFiles || [])])];
            }

            // Related requirements array merge
            if (Array.isArray(o.relatedRequirements) || Array.isArray(t.relatedRequirements)) {
              combined.relatedRequirements = [...new Set([...(o.relatedRequirements || []), ...(t.relatedRequirements || [])])];
            }

            combined.updatedAt = getTimestamp();
            merged.push(combined);
          }
        }
      } else if (o && !t) {
        if (!b) {
          // Added only in our branch
          merged.push(o);
        } else {
          // Deleted in their branch
          const ourChanged = JSON.stringify(o) !== JSON.stringify(b);
          if (ourChanged) {
            // We modified it while they deleted it: keep our modified version
            merged.push(o);
          }
          // If we didn't touch it, respect deletion
        }
      } else if (!o && t) {
        if (!b) {
          // Added only in their branch
          merged.push(t);
        } else {
          // Deleted in our branch
          const theirChanged = JSON.stringify(t) !== JSON.stringify(b);
          if (theirChanged) {
            // They modified it while we deleted it: keep their modified version
            merged.push(t);
          }
          // If they didn't touch it, respect deletion
        }
      }
    }

    return merged;
  }

  /**
   * Three-way merge complete backlog objects
   * @param {Object} baseBacklog 
   * @param {Object} ourBacklog 
   * @param {Object} theirBacklog 
   * @returns {Object} Merged backlog
   */
  static mergeBacklogs(baseBacklog = {}, ourBacklog = {}, theirBacklog = {}) {
    const epics = this.mergeItemLists(
      baseBacklog.epics || [],
      ourBacklog.epics || [],
      theirBacklog.epics || []
    );

    const stories = this.mergeItemLists(
      baseBacklog.stories || [],
      ourBacklog.stories || [],
      theirBacklog.stories || []
    );

    const tasks = this.mergeItemLists(
      baseBacklog.tasks || [],
      ourBacklog.tasks || [],
      theirBacklog.tasks || []
    );

    return {
      schemaVersion: ourBacklog.schemaVersion || baseBacklog.schemaVersion || '1.0.0',
      metadata: {
        createdAt: baseBacklog.metadata?.createdAt || ourBacklog.metadata?.createdAt || getTimestamp(),
        updatedAt: getTimestamp(),
        version: ourBacklog.metadata?.version || baseBacklog.metadata?.version || '0.1.0'
      },
      epics,
      stories,
      tasks,
      prioritization: {
        method: ourBacklog.prioritization?.method || baseBacklog.prioritization?.method || 'wsjf',
        criteria: {
          ...(baseBacklog.prioritization?.criteria || {}),
          ...(theirBacklog.prioritization?.criteria || {}),
          ...(ourBacklog.prioritization?.criteria || {})
        }
      }
    };
  }

  /**
   * Execute 3-way merge on files from disk
   * @param {string} basePath Ancestor file path (%O)
   * @param {string} ourPath Current file path (%A)
   * @param {string} theirPath Other file path (%B)
   * @returns {boolean} True if merge succeeded
   */
  static mergeFiles(basePath, ourPath, theirPath) {
    const baseBacklog = fs.existsSync(basePath) ? (readYaml(basePath) || {}) : {};
    const ourBacklog = fs.existsSync(ourPath) ? (readYaml(ourPath) || {}) : {};
    const theirBacklog = fs.existsSync(theirPath) ? (readYaml(theirPath) || {}) : {};

    const merged = this.mergeBacklogs(baseBacklog, ourBacklog, theirBacklog);
    writeYaml(ourPath, merged);
    return true;
  }
}
