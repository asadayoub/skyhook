/**
 * Task Lease Manager
 * Coordinates atomic task checkouts for AI agents and human contributors.
 * Prevents multiple agents from grabbing and clobbering the same task.
 */

import { getTimestamp } from '../utils.js';

export class TaskLeaseManager {
  /**
   * Check if a story has an active, unexpired lease
   * @param {Object} story
   * @param {number} now
   * @returns {boolean}
   */
  static isLeased(story, now = Date.now()) {
    if (!story || !story.lease) return false;
    const expiresAt = new Date(story.lease.expiresAt).getTime();
    return now < expiresAt;
  }

  /**
   * Acquire or lease a story for an agent
   * @param {Object} story
   * @param {string} agentId
   * @param {number} leaseMinutes
   * @returns {Object} Updated story
   */
  static acquireLease(story, agentId, leaseMinutes = 30) {
    const now = Date.now();
    if (this.isLeased(story, now)) {
      if (story.lease.agentId !== agentId) {
        throw new Error(
          `Task '${story.id}' is currently leased by agent '${story.lease.agentId}' until ${story.lease.expiresAt}`
        );
      }
    }

    const leasedAt = getTimestamp();
    const expiresAt = new Date(now + leaseMinutes * 60 * 1000).toISOString();

    story.lease = {
      agentId,
      leasedAt,
      expiresAt,
      durationMinutes: leaseMinutes
    };

    story.assignee = {
      type: 'agent',
      identifier: agentId,
      name: agentId
    };

    story.updatedAt = leasedAt;
    return story;
  }

  /**
   * Renew an existing lease
   * @param {Object} story
   * @param {string} agentId
   * @param {number} additionalMinutes
   * @returns {Object}
   */
  static renewLease(story, agentId, additionalMinutes = 30) {
    if (!story.lease || story.lease.agentId !== agentId) {
      throw new Error(`Cannot renew lease: Task '${story.id}' is not leased to agent '${agentId}'`);
    }

    const baseTime = Math.max(Date.now(), new Date(story.lease.expiresAt).getTime());
    story.lease.expiresAt = new Date(baseTime + additionalMinutes * 60 * 1000).toISOString();
    story.updatedAt = getTimestamp();
    return story;
  }

  /**
   * Release a lease explicitly
   * @param {Object} story
   * @param {string} agentId
   * @param {boolean} force
   * @returns {boolean}
   */
  static releaseLease(story, agentId = null, force = false) {
    if (!story || !story.lease) return false;

    if (!force && agentId && story.lease.agentId !== agentId) {
      throw new Error(`Cannot release lease: Task '${story.id}' is leased to '${story.lease.agentId}', not '${agentId}'`);
    }

    delete story.lease;
    story.updatedAt = getTimestamp();
    return true;
  }

  /**
   * Clean up expired leases across the backlog
   * @param {Object} backlog
   * @param {number} now
   * @returns {number} Count of expired leases cleared
   */
  static sweepExpiredLeases(backlog, now = Date.now()) {
    let sweptCount = 0;
    const stories = backlog.stories || [];

    for (const story of stories) {
      if (story.lease) {
        const expires = new Date(story.lease.expiresAt).getTime();
        if (now >= expires) {
          delete story.lease;
          story.updatedAt = getTimestamp();
          sweptCount++;
        }
      }
    }

    return sweptCount;
  }
}
