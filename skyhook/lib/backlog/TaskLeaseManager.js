/**
 * Task Lease Manager
 * Coordinates atomic task checkouts for AI agents and human contributors.
 * Implements Two-Tier Locking:
 * 1. Granular Task Leases: Multiple agents can concurrently lease different tasks under the same story.
 * 2. Exclusive Story Leases: Locks an entire story and its child tasks for single-agent deep execution.
 * Prevents multiple agents from grabbing and clobbering the same task or files.
 */

import { getTimestamp } from '../utils.js';

export class TaskLeaseManager {
  /**
   * Check if a story or task has an active, unexpired lease
   * @param {Object} item - Story or Task object
   * @param {number} [now=Date.now()]
   * @returns {boolean}
   */
  static isLeased(item, now = Date.now()) {
    if (!item || !item.lease) return false;
    const expiresAt = new Date(item.lease.expiresAt).getTime();
    return now < expiresAt;
  }

  /**
   * Acquire or lease a story or task for an agent
   * @param {Object} item - Story or Task object
   * @param {string} agentId - Identifier of claiming agent
   * @param {number} [leaseMinutes=30] - Lease duration in minutes
   * @param {Object} [options={}] - { backlog: Object, allowStoryShare: boolean } or backlog object directly
   * @returns {Object} Updated item with active lease
   */
  static acquireLease(item, agentId, leaseMinutes = 30, options = {}) {
    const now = Date.now();
    const backlog = (options && (options.epics || options.stories || options.tasks)) ? options : (options.backlog || null);

    // 1. Direct lease check on this item
    if (this.isLeased(item, now)) {
      if (item.lease.agentId !== agentId) {
        throw new Error(
          `Work item '${item.id}' is currently leased by agent '${item.lease.agentId}' until ${item.lease.expiresAt}`
        );
      }
    }

    // 2. Hierarchical Concurrency Validation if full backlog is available
    if (backlog) {
      const allStories = backlog.stories || [];
      const allTasks = backlog.tasks || [];

      const isStory = allStories.some(s => s.id === item.id) || Array.isArray(item.childTasks);
      const isTask = allTasks.some(t => t.id === item.id) || item.parentId || item.parentType;

      if (isStory) {
        // When leasing a STORY exclusively: check if any child task is actively leased by another agent
        const childTasks = allTasks.filter(t => t.parentId === item.id);
        const leasedChild = childTasks.find(t => this.isLeased(t, now) && t.lease.agentId !== agentId);
        if (leasedChild) {
          throw new Error(
            `Cannot acquire exclusive lease on story '${item.id}': child task '${leasedChild.id}' is actively leased by agent '${leasedChild.lease.agentId}'`
          );
        }
      } else if (isTask && item.parentId && (item.parentType === 'story' || !item.parentType)) {
        // When leasing a TASK: check if parent story is under exclusive lease by another agent
        const parentStory = allStories.find(s => s.id === item.parentId);
        if (parentStory && this.isLeased(parentStory, now) && parentStory.lease.agentId !== agentId) {
          throw new Error(
            `Cannot acquire lease on task '${item.id}': parent story '${item.parentId}' is exclusively leased by agent '${parentStory.lease.agentId}'`
          );
        }
      }
    }

    const leasedAt = getTimestamp();
    const expiresAt = new Date(now + leaseMinutes * 60 * 1000).toISOString();

    item.lease = {
      agentId,
      leasedAt,
      expiresAt,
      durationMinutes: leaseMinutes,
      heartbeatAt: leasedAt
    };

    item.assignee = {
      type: 'agent',
      identifier: agentId,
      name: agentId
    };

    item.updatedAt = leasedAt;

    // 3. Advisory File Conflict Warning Check
    if (backlog && Array.isArray(backlog.tasks) && Array.isArray(item.targetFiles) && item.targetFiles.length > 0) {
      const conflicts = this.checkFileConflicts(item, backlog.tasks, now);
      if (conflicts.length > 0) {
        item.fileConflictWarnings = conflicts;
      }
    }

    return item;
  }

  /**
   * Renew an existing lease
   * @param {Object} item
   * @param {string} agentId
   * @param {number} [additionalMinutes=30]
   * @returns {Object}
   */
  static renewLease(item, agentId, additionalMinutes = 30) {
    if (!item.lease || item.lease.agentId !== agentId) {
      throw new Error(`Cannot renew lease: Work item '${item.id}' is not leased to agent '${agentId}'`);
    }

    const baseTime = Math.max(Date.now(), new Date(item.lease.expiresAt).getTime());
    item.lease.expiresAt = new Date(baseTime + additionalMinutes * 60 * 1000).toISOString();
    item.lease.heartbeatAt = getTimestamp();
    item.updatedAt = getTimestamp();
    return item;
  }

  /**
   * Send heartbeat to keep lease alive and optionally extend expiration
   * @param {Object} item
   * @param {string} agentId
   * @param {number} [extendMinutes=15]
   * @returns {Object}
   */
  static heartbeatLease(item, agentId, extendMinutes = 15) {
    if (!item.lease || item.lease.agentId !== agentId) {
      throw new Error(`Cannot send heartbeat: Work item '${item.id}' is not leased to agent '${agentId}'`);
    }

    const now = Date.now();
    if (extendMinutes > 0) {
      item.lease.durationMinutes = extendMinutes;
      item.lease.expiresAt = new Date(now + extendMinutes * 60 * 1000).toISOString();
    }

    item.lease.heartbeatAt = getTimestamp();
    item.updatedAt = getTimestamp();
    return item.lease;
  }

  /**
   * Release a lease explicitly
   * @param {Object} item
   * @param {string} [agentId=null]
   * @param {boolean} [force=false]
   * @returns {boolean}
   */
  static releaseLease(item, agentId = null, force = false) {
    if (!item || !item.lease) return false;

    if (!force && agentId && item.lease.agentId !== agentId) {
      throw new Error(`Cannot release lease: Work item '${item.id}' is leased to '${item.lease.agentId}', not '${agentId}'`);
    }

    delete item.lease;
    delete item.fileConflictWarnings;
    item.updatedAt = getTimestamp();
    return true;
  }

  /**
   * Clean up expired leases across stories and tasks in the backlog
   * @param {Object} backlog
   * @param {number} [now=Date.now()]
   * @returns {number} Count of expired leases cleared
   */
  static sweepExpiredLeases(backlog, now = Date.now()) {
    let sweptCount = 0;
    const stories = backlog.stories || [];
    const tasks = backlog.tasks || [];

    for (const story of stories) {
      if (story.lease) {
        const expires = new Date(story.lease.expiresAt).getTime();
        if (now >= expires) {
          delete story.lease;
          delete story.fileConflictWarnings;
          story.updatedAt = getTimestamp();
          sweptCount++;
        }
      }
    }

    for (const task of tasks) {
      if (task.lease) {
        const expires = new Date(task.lease.expiresAt).getTime();
        if (now >= expires) {
          delete task.lease;
          delete task.fileConflictWarnings;
          task.updatedAt = getTimestamp();
          sweptCount++;
        }
      }
    }

    return sweptCount;
  }

  /**
   * Acquire a lease specifically on a fine-grained task
   */
  static acquireTaskLease(task, agentId, leaseMinutes = 30, backlog = null) {
    return this.acquireLease(task, agentId, leaseMinutes, { backlog });
  }

  /**
   * Check for file target overlap between a task and other actively leased tasks
   * @param {Object} task
   * @param {Array<Object>|Object} allTasks - List of tasks or backlog object containing tasks
   * @param {number} [now=Date.now()]
   * @returns {Array<Object>} List of conflicts
   */
  static checkFileConflicts(task, allTasks = [], now = Date.now()) {
    const tasksList = Array.isArray(allTasks) ? allTasks : (allTasks && Array.isArray(allTasks.tasks) ? allTasks.tasks : []);
    const targetFiles = Array.isArray(task.targetFiles) ? task.targetFiles : [];
    if (targetFiles.length === 0) return [];

    const conflicts = [];
    for (const other of tasksList) {
      if (other.id === task.id || !this.isLeased(other, now)) continue;
      const otherFiles = Array.isArray(other.targetFiles) ? other.targetFiles : [];
      const overlap = targetFiles.filter(f => otherFiles.includes(f));
      if (overlap.length > 0) {
        conflicts.push({
          taskId: other.id,
          agentId: other.lease.agentId,
          conflictingFiles: overlap,
          overlappingFiles: overlap,
          message: `Target files [${overlap.join(', ')}] overlap with active lease on ${other.id} held by agent '${other.lease.agentId}'`
        });
      }
    }
    return conflicts;
  }
}
