/**
 * Backlog State Machine
 * Deterministic Finite State Machine (FSM) governing work item lifecycles.
 * Enforces valid transition paths, entry/exit guards, and Definition of Done (DoD) invariants.
 */

import { getTimestamp } from '../utils.js';
import { DependencyResolver } from './DependencyResolver.js';
import { TaskLeaseManager } from './TaskLeaseManager.js';

export const VALID_STATUSES = [
  'backlog',
  'ready',
  'in-progress',
  'in-review',
  'done',
  'blocked',
  'cancelled'
];

export const ALLOWED_TRANSITIONS = {
  backlog: ['ready', 'cancelled', 'in-progress'],
  ready: ['in-progress', 'blocked', 'backlog', 'cancelled'],
  'in-progress': ['in-review', 'blocked', 'ready', 'cancelled', 'done'],
  'in-review': ['done', 'in-progress', 'blocked', 'cancelled'],
  blocked: ['ready', 'in-progress', 'cancelled'],
  done: ['in-progress'], // Allow reopening when defects are found
  cancelled: ['backlog'] // Allow restoring cancelled work
};

export class BacklogStateMachine {
  /**
   * Validate whether a story can transition to targetStatus
   * @param {Object} story - The story object
   * @param {string} targetStatus - The desired new status
   * @param {Array} allStories - Complete list of stories for dependency checking
   * @param {Object} options - { force: boolean, metadata: Object }
   * @returns {Object} { valid: boolean, error?: string, warnings?: Array<string> }
   */
  static validateTransition(story, targetStatus, allStories = [], options = {}) {
    if (!story) {
      return { valid: false, error: 'Story is null or undefined' };
    }

    if (!VALID_STATUSES.includes(targetStatus)) {
      return {
        valid: false,
        error: `Invalid status '${targetStatus}'. Must be one of: ${VALID_STATUSES.join(', ')}`
      };
    }

    const currentStatus = story.status || 'backlog';
    if (currentStatus === targetStatus) {
      return { valid: true, noop: true };
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    const isDirectAllowed = allowed.includes(targetStatus);

    if (!isDirectAllowed && !options.force) {
      return {
        valid: false,
        error: `Illegal state transition: Cannot move story from '${currentStatus}' to '${targetStatus}'. Valid target states are: [${allowed.join(', ')}]. Use --force to override.`
      };
    }

    const warnings = [];

    // Guard 1: Transitioning to 'ready' requires checking dependencies
    if (targetStatus === 'ready' && !options.force) {
      const unmet = DependencyResolver.getUnmetDependencies(story, allStories);
      if (unmet.length > 0) {
        const unmetDesc = unmet.map(d => `${d.id} (${d.status})`).join(', ');
        return {
          valid: false,
          error: `Cannot transition to 'ready': Story has unresolved dependencies: ${unmetDesc}. Resolve dependencies or move to 'blocked'.`
        };
      }
    }

    // Guard 2: Transitioning to 'in-progress' checks lease lockouts
    if (targetStatus === 'in-progress' && !options.force) {
      if (TaskLeaseManager.isLeased(story)) {
        const currentAgent = options.agentId || options.assignee;
        if (currentAgent && story.lease.agentId !== currentAgent) {
          return {
            valid: false,
            error: `Cannot transition to 'in-progress': Story is leased by agent '${story.lease.agentId}' until ${story.lease.expiresAt}`
          };
        }
      }
    }

    // Guard 3: Transitioning to 'blocked' requires a reason
    if (targetStatus === 'blocked') {
      const reason = (options.metadata && options.metadata.reason) || story.blockerReason;
      if (!reason && !options.force) {
        warnings.push('Story transitioned to blocked without an explicit blocker reason.');
      }
    }

    // Guard 4: Transitioning to 'done' checks acceptance criteria
    if (targetStatus === 'done' && !options.force) {
      const ac = story.acceptanceCriteria || [];
      if (ac.length === 0) {
        warnings.push('Story marked done with no acceptance criteria defined.');
      }
    }

    return { valid: true, warnings };
  }

  /**
   * Execute a state transition on a backlog story
   * @param {Object} backlog - The backlog containing epics and stories
   * @param {string} storyId - The story ULID or ID
   * @param {string} targetStatus - The desired target status
   * @param {Object} metadata - Optional metadata (reason, agentId, commitHash, etc.)
   * @param {Object} options - Optional flags (force: boolean)
   * @returns {Object} Result of transition
   */
  static transition(backlog, storyId, targetStatus, metadata = {}, options = {}) {
    const stories = backlog.stories || [];
    const story = stories.find(s => s.id === storyId);

    if (!story) {
      throw new Error(`Story not found: ${storyId}`);
    }

    const validation = this.validateTransition(story, targetStatus, stories, { ...options, metadata });
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const oldStatus = story.status || 'backlog';
    const now = getTimestamp();

    // Apply state change
    story.status = targetStatus;
    story.updatedAt = now;

    // Manage timestamps
    if (targetStatus === 'in-progress' && !story.startedAt) {
      story.startedAt = now;
    }
    if (targetStatus === 'done') {
      story.completedAt = now;
      // Clear active lease upon completion
      delete story.lease;
      delete story.blockerReason;
    }
    if (targetStatus === 'blocked' && metadata.reason) {
      story.blockerReason = metadata.reason;
    }
    if (targetStatus !== 'blocked' && oldStatus === 'blocked') {
      delete story.blockerReason;
    }

    // Handle agent assignment or lease if passed
    if (metadata.agentId) {
      if (metadata.leaseMinutes) {
        TaskLeaseManager.acquireLease(story, metadata.agentId, metadata.leaseMinutes);
      } else {
        story.assignee = { type: 'agent', identifier: metadata.agentId, name: metadata.agentId };
      }
    }

    // Check if downstream dependencies are now unblocked
    let unblockedStories = [];
    if (targetStatus === 'done') {
      unblockedStories = DependencyResolver.findNewlyUnblockedStories(storyId, stories);
      for (const u of unblockedStories) {
        if (u.status === 'blocked') {
          u.status = 'ready';
          delete u.blockerReason;
          u.updatedAt = now;
        }
      }
    }

    // Check if parent epic should be marked done
    let epicCompleted = false;
    if (targetStatus === 'done' && story.epicId) {
      const parentEpic = (backlog.epics || []).find(e => e.id === story.epicId);
      if (parentEpic && parentEpic.status !== 'done') {
        const siblingStories = stories.filter(s => s.epicId === story.epicId);
        const allCompleted = siblingStories.every(s => s.status === 'done');
        if (allCompleted) {
          parentEpic.status = 'done';
          parentEpic.updatedAt = now;
          epicCompleted = true;
        }
      }
    }

    backlog.metadata = backlog.metadata || {};
    backlog.metadata.updatedAt = now;

    return {
      success: true,
      storyId,
      oldStatus,
      newStatus: targetStatus,
      story,
      unblockedStories: unblockedStories.map(s => s.id),
      epicCompleted,
      warnings: validation.warnings || []
    };
  }
}
