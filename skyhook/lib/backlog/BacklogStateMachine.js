/**
 * Backlog State Machine
 * Deterministic Finite State Machine (FSM) governing work item lifecycles across Epics, Stories, and Tasks.
 * Enforces valid transition paths, entry/exit guards, Definition of Done (DoD) invariants,
 * and hierarchical bottom-up/top-down status rollups.
 */

import fs from 'fs';
import path from 'path';
import { getTimestamp, readYaml } from '../utils.js';
import { DependencyResolver } from './DependencyResolver.js';
import { TaskLeaseManager } from './TaskLeaseManager.js';

export const VALID_STATUSES = [
  'backlog',
  'ready',
  'in-progress',
  'implemented',
  'in-review',
  'verified',
  'done',
  'blocked',
  'cancelled'
];

export const ALLOWED_TRANSITIONS = {
  backlog: ['ready', 'cancelled', 'in-progress'],
  ready: ['in-progress', 'blocked', 'backlog', 'cancelled'],
  'in-progress': ['implemented', 'in-review', 'blocked', 'ready', 'cancelled', 'done'],
  implemented: ['verified', 'in-review', 'in-progress', 'blocked', 'cancelled', 'done'],
  'in-review': ['verified', 'done', 'in-progress', 'blocked', 'cancelled'],
  verified: ['done', 'in-review', 'in-progress', 'blocked', 'cancelled'],
  blocked: ['ready', 'in-progress', 'cancelled'],
  done: ['in-progress'], // Allow reopening when defects are found
  cancelled: ['backlog'] // Allow restoring cancelled work
};

export class BacklogStateMachine {
  /**
   * Validate whether a story or task can transition to targetStatus
   * @param {Object} item - The story or task object
   * @param {string} targetStatus - The desired new status
   * @param {Array} allItems - Complete list of stories/tasks for dependency checking
   * @param {Object} options - { force: boolean, metadata: Object, allTasks: Array }
   * @returns {Object} { valid: boolean, error?: string, warnings?: Array<string> }
   */
  static validateTransition(item, targetStatus, allItems = [], options = {}) {
    if (!item) {
      return { valid: false, error: 'Work item is null or undefined' };
    }

    if (!VALID_STATUSES.includes(targetStatus)) {
      return {
        valid: false,
        error: `Invalid status '${targetStatus}'. Must be one of: ${VALID_STATUSES.join(', ')}`
      };
    }

    const noun = (item && item.id && item.id.startsWith('TASK-')) ? 'task' : 'story';
    const Noun = (item && item.id && item.id.startsWith('TASK-')) ? 'Task' : 'Story';

    const currentStatus = item.status || 'backlog';
    if (currentStatus === targetStatus) {
      return { valid: true, noop: true };
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    const isDirectAllowed = allowed.includes(targetStatus);

    if (!isDirectAllowed && !options.force) {
      return {
        valid: false,
        error: `Illegal state transition: Cannot move ${noun} from '${currentStatus}' to '${targetStatus}'. Valid target states are: [${allowed.join(', ')}]. Use --force to override.`
      };
    }

    const warnings = [];

    // Guard 1: Transitioning to 'ready' requires checking dependencies
    if (targetStatus === 'ready' && !options.force) {
      const unmet = DependencyResolver.getUnmetDependencies(item, allItems, options.allTasks || []);
      if (unmet.length > 0) {
        const unmetDesc = unmet.map(d => `${d.id} (${d.status})`).join(', ');
        return {
          valid: false,
          error: `Cannot transition to 'ready': ${Noun} has unresolved dependencies: ${unmetDesc}. Resolve dependencies or move to 'blocked'.`
        };
      }
    }

    // Guard 2: Transitioning to 'in-progress' checks lease lockouts
    if (targetStatus === 'in-progress' && !options.force) {
      if (TaskLeaseManager.isLeased(item)) {
        const currentAgent = options.agentId || options.assignee;
        if (currentAgent && item.lease.agentId !== currentAgent) {
          return {
            valid: false,
            error: `Cannot transition to 'in-progress': ${Noun} is leased by agent '${item.lease.agentId}' until ${item.lease.expiresAt}`
          };
        }
      }
    }

    // Guard 2B: Consequential Work Guard
    const isConsequential = Boolean(
      item.consequential === true ||
      item.type === 'spike' ||
      (Array.isArray(item.tags) && item.tags.some(t => typeof t === 'string' && t.toLowerCase() === 'consequential'))
    );

    if (targetStatus === 'in-progress' && isConsequential && !options.force) {
      let availableDecisions = [];
      if (Array.isArray(options.decisions)) {
        availableDecisions = options.decisions;
      } else {
        const candidateDir = options.skyhookDir || (options.projectDir ? path.join(options.projectDir, '.skyhook') : null);
        if (candidateDir && fs.existsSync(path.join(candidateDir, 'decisions', 'index.yaml'))) {
          try {
            const decData = readYaml(path.join(candidateDir, 'decisions', 'index.yaml'));
            if (Array.isArray(decData?.decisions)) {
              availableDecisions = decData.decisions;
            }
          } catch {
            // ignore disk read errors
          }
        }
      }

      const linkedDecisions = [];
      if (item.decisionId) linkedDecisions.push(item.decisionId);
      if (item.decision?.id) linkedDecisions.push(item.decision.id);
      if (Array.isArray(item.relatedDecisions)) {
        for (const d of item.relatedDecisions) {
          if (typeof d === 'string') linkedDecisions.push(d);
          else if (d?.id) linkedDecisions.push(d.id);
        }
      }
      if (Array.isArray(item.decisions)) {
        for (const d of item.decisions) {
          if (typeof d === 'string') linkedDecisions.push(d);
          else if (d?.id) linkedDecisions.push(d.id);
        }
      }
      if (options.decisionId) linkedDecisions.push(options.decisionId);
      if (options.metadata?.decisionId) linkedDecisions.push(options.metadata.decisionId);

      if (linkedDecisions.length === 0) {
        return {
          valid: false,
          error: `Cannot start consequential ${noun} '${item.id}' without an accepted ADR. Link an accepted ADR or use --force.`
        };
      }

      let hasAcceptedADR = false;

      // 1. Check embedded item decision
      if (item.decision && item.decision.status === 'accepted') {
        hasAcceptedADR = true;
      }

      // 2. Check embedded relatedDecisions objects
      if (!hasAcceptedADR && Array.isArray(item.relatedDecisions)) {
        if (item.relatedDecisions.some(d => typeof d === 'object' && d?.status === 'accepted')) {
          hasAcceptedADR = true;
        }
      }

      // 3. Check in available decisions registry
      if (!hasAcceptedADR && availableDecisions.length > 0) {
        for (const decId of linkedDecisions) {
          const match = availableDecisions.find(d => d.id === decId);
          if (match && match.status === 'accepted') {
            hasAcceptedADR = true;
            break;
          }
        }
      }

      if (!hasAcceptedADR) {
        return {
          valid: false,
          error: `Cannot start consequential ${noun} '${item.id}' without an accepted ADR. Link an accepted ADR or use --force.`
        };
      }
    }

    // Guard 3: Transitioning to 'blocked' requires a reason
    if (targetStatus === 'blocked') {
      const reason = (options.metadata && options.metadata.reason) || item.blockerReason;
      if (!reason && !options.force) {
        warnings.push(`${Noun} transitioned to blocked without an explicit blocker reason.`);
      }
    }

    // Guard 4: Definition of Done (DoD) - Subtask completeness check
    if (['implemented', 'verified', 'done'].includes(targetStatus) && !options.force) {
      if (Array.isArray(item.subtasks) && item.subtasks.length > 0) {
        const uncompleted = item.subtasks.filter(s => !s.completed);
        if (uncompleted.length > 0) {
          return {
            valid: false,
            error: `Cannot mark '${item.id}' as ${targetStatus}: ${uncompleted.length} uncompleted subtask(s) remain. Complete all subtasks or use --force to override.`
          };
        }
      }

      if (targetStatus === 'done') {
        const ac = item.acceptanceCriteria || [];
        if (ac.length === 0 && !item.subtasks) {
          warnings.push('Story marked done with no acceptance criteria defined.');
        }
      }
    }

    // Guard 5: Evidence Validation Guard (Transitioning to 'verified' or 'done')
    if (['verified', 'done'].includes(targetStatus)) {
      const evidence = (options.metadata && options.metadata.evidence) || options.evidence || item.evidence;

      // 1. Automated checks integrity
      if (evidence && evidence.automatedChecks && typeof evidence.automatedChecks.exitCode === 'number') {
        if (evidence.automatedChecks.exitCode !== 0 && !options.force) {
          return {
            valid: false,
            error: `Cannot transition '${item.id}' to '${targetStatus}': automated check failed with exit code ${evidence.automatedChecks.exitCode}. Fix failing tests before verifying.`
          };
        }
      }

      // 2. Strict evidence enforcement
      const isStrict = options.strictEvidence || options.strict;
      if (isStrict && !evidence && !options.force) {
        return {
          valid: false,
          error: `Cannot mark '${item.id}' as ${targetStatus} without verification evidence (strictEvidence enabled). Provide test results or use --force.`
        };
      }

      // 3. Advisory warning for unverified done
      if (targetStatus === 'done' && !evidence) {
        warnings.push('Item marked done without automated verification evidence.');
      }
    }

    return { valid: true, warnings };
  }

  /**
   * Execute a state transition on a backlog story or task with automatic hierarchical rollup
   * @param {Object} backlog - The backlog containing epics, stories, and tasks
   * @param {string} itemId - The story ID or task ID (ULID or STORY-XXX or TASK-XXX)
   * @param {string} targetStatus - The desired target status
   * @param {Object} metadata - Optional metadata (reason, agentId, commitHash, etc.)
   * @param {Object} options - Optional flags (force: boolean)
   * @returns {Object} Result of transition
   */
  static transition(backlog, itemId, targetStatus, metadata = {}, options = {}) {
    backlog.stories = backlog.stories || [];
    backlog.tasks = backlog.tasks || [];
    backlog.epics = backlog.epics || [];

    const story = backlog.stories.find(s => s.id === itemId);
    const task = backlog.tasks.find(t => t.id === itemId);

    if (!story && !task) {
      throw new Error(`Work item not found: ${itemId}`);
    }

    const item = story || task;
    const isTask = !!task;
    const allItems = isTask ? backlog.tasks : backlog.stories;

    const validation = this.validateTransition(item, targetStatus, allItems, {
      ...options,
      metadata,
      allTasks: backlog.tasks,
      decisions: options.decisions || backlog.decisions
    });
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const oldStatus = item.status || 'backlog';
    const now = getTimestamp();

    // Apply state change
    item.status = targetStatus;
    item.updatedAt = now;

    // Manage timestamps
    if (targetStatus === 'in-progress' && !item.startedAt) {
      item.startedAt = now;
    }
    if (targetStatus === 'implemented' && !item.implementedAt) {
      item.implementedAt = now;
    }
    if (targetStatus === 'verified' && !item.verifiedAt) {
      item.verifiedAt = now;
    }
    if (targetStatus === 'done') {
      item.completedAt = now;
      delete item.lease;
      delete item.blockerReason;
      delete item.fileConflictWarnings;
    }
    if (targetStatus === 'blocked' && metadata.reason) {
      item.blockerReason = metadata.reason;
    }
    if (targetStatus !== 'blocked' && oldStatus === 'blocked') {
      delete item.blockerReason;
    }

    // Evidence recording
    const evidence = (metadata && metadata.evidence) || options.evidence;
    if (evidence) {
      item.evidence = evidence;
      item.verificationStatus = 'verified';
    } else if (targetStatus === 'verified') {
      item.verificationStatus = 'verified';
    } else if (targetStatus === 'done' && !item.verificationStatus) {
      item.verificationStatus = 'unverified';
    }

    // Handle agent assignment or lease
    if (metadata.agentId) {
      if (metadata.leaseMinutes) {
        TaskLeaseManager.acquireLease(item, metadata.agentId, metadata.leaseMinutes, { backlog });
      } else {
        item.assignee = { type: 'agent', identifier: metadata.agentId, name: metadata.agentId };
      }
    }

    let rolledUpStory = null;
    let rolledUpEpic = null;

    // Hierarchical Rollups
    if (isTask) {
      // 1. Task -> Story Rollup
      if (item.parentType === 'story' && item.parentId) {
        const parentStory = backlog.stories.find(s => s.id === item.parentId);
        if (parentStory) {
          // If task starts, story advances to in-progress
          if (targetStatus === 'in-progress' && (parentStory.status === 'backlog' || parentStory.status === 'ready')) {
            parentStory.status = 'in-progress';
            parentStory.updatedAt = now;
            if (!parentStory.startedAt) parentStory.startedAt = now;
            rolledUpStory = { id: parentStory.id, status: 'in-progress' };
          }
          // If task finishes, check if all sibling tasks are done or verified
          if (targetStatus === 'done' || targetStatus === 'verified') {
            const siblingTasks = backlog.tasks.filter(t => t.parentId === parentStory.id);
            const allTasksDone = siblingTasks.length > 0 && siblingTasks.every(t => t.status === 'done' || t.status === 'verified');
            if (allTasksDone && parentStory.status !== 'done') {
              parentStory.status = 'in-review';
              parentStory.updatedAt = now;
              rolledUpStory = { id: parentStory.id, status: 'in-review' };
            }
          }
        }
      } else if (item.parentType === 'epic' && item.parentId) {
        // Direct epic task rollup
        const parentEpic = backlog.epics.find(e => e.id === item.parentId);
        if (parentEpic && targetStatus === 'in-progress' && parentEpic.status === 'backlog') {
          parentEpic.status = 'in-progress';
          parentEpic.updatedAt = now;
          rolledUpEpic = { id: parentEpic.id, status: 'in-progress' };
        }
      }
    }

    // Check if parent epic should be marked done when story is done
    let epicCompleted = false;
    const targetStory = isTask ? (rolledUpStory ? backlog.stories.find(s => s.id === rolledUpStory.id) : null) : story;

    if (targetStory && targetStory.status === 'done' && targetStory.epicId) {
      const parentEpic = backlog.epics.find(e => e.id === targetStory.epicId);
      if (parentEpic && parentEpic.status !== 'done') {
        const siblingStories = backlog.stories.filter(s => s.epicId === targetStory.epicId);
        const siblingDirectTasks = backlog.tasks.filter(t => t.parentType === 'epic' && t.parentId === parentEpic.id);
        const allCompleted = siblingStories.every(s => s.status === 'done') &&
                             siblingDirectTasks.every(t => t.status === 'done');
        if (allCompleted) {
          parentEpic.status = 'done';
          parentEpic.updatedAt = now;
          epicCompleted = true;
          rolledUpEpic = { id: parentEpic.id, status: 'done' };
        }
      }
    }

    // Check if downstream dependencies are now unblocked
    let unblockedItems = [];
    if (targetStatus === 'done') {
      unblockedItems = DependencyResolver.findNewlyUnblockedStories(itemId, backlog.stories, backlog.tasks);
      for (const u of unblockedItems) {
        if (u.status === 'blocked') {
          u.status = 'ready';
          delete u.blockerReason;
          u.updatedAt = now;
        }
      }
    }

    backlog.metadata = backlog.metadata || {};
    backlog.metadata.updatedAt = now;

    return {
      success: true,
      itemId,
      storyId: isTask ? item.parentId : itemId,
      taskId: isTask ? itemId : null,
      oldStatus,
      newStatus: targetStatus,
      item,
      rolledUpStory,
      rolledUpEpic,
      unblockedStories: unblockedItems.map(s => s.id),
      epicCompleted,
      warnings: validation.warnings || []
    };
  }

  /**
   * Convenience alias for transitioning a task
   */
  static transitionTask(backlog, taskId, targetStatus, metadata = {}, options = {}) {
    return this.transition(backlog, taskId, targetStatus, metadata, options);
  }
}
