/**
 * Event Ledger
 * Append-only immutable event sourcing engine for the Skyhook Backlog.
 * Records all state transitions, leases, and work item mutations in .skyhook/backlog/events.jsonl.
 */

import fs from 'fs';
import path from 'path';
import { generateULID, getTimestamp } from '../utils.js';

export const EVENT_TYPES = {
  EPIC_CREATED: 'EPIC_CREATED',
  STORY_CREATED: 'STORY_CREATED',
  STATE_TRANSITIONED: 'STATE_TRANSITIONED',
  TASK_LEASED: 'TASK_LEASED',
  TASK_RELEASED: 'TASK_RELEASED',
  BLOCKER_FLAGGED: 'BLOCKER_FLAGGED',
  BLOCKER_RESOLVED: 'BLOCKER_RESOLVED',
  EPIC_COMPLETED: 'EPIC_COMPLETED'
};

export class EventLedger {
  /**
   * Get the absolute path to events.jsonl
   */
  static getLedgerPath(skyhookDir) {
    return path.join(skyhookDir, 'backlog', 'events.jsonl');
  }

  /**
   * Append an event to the ledger file
   * @param {string} skyhookDir
   * @param {Object} eventData - { type, actor, payload }
   * @returns {Object} Complete recorded event with id and timestamp
   */
  static appendEvent(skyhookDir, eventData) {
    if (!skyhookDir) return null;

    const backlogDir = path.join(skyhookDir, 'backlog');
    if (!fs.existsSync(backlogDir)) {
      fs.mkdirSync(backlogDir, { recursive: true });
    }

    const ledgerPath = this.getLedgerPath(skyhookDir);
    const event = {
      eventId: generateULID(),
      timestamp: getTimestamp(),
      type: eventData.type,
      actor: eventData.actor || 'system',
      payload: eventData.payload || {}
    };

    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(ledgerPath, line, 'utf-8');

    return event;
  }

  /**
   * Read events from the ledger
   * @param {string} skyhookDir
   * @param {number} limit - Maximum events to read (default 100, 0 for all)
   * @returns {Array<Object>}
   */
  static readEvents(skyhookDir, limit = 100) {
    const ledgerPath = this.getLedgerPath(skyhookDir);
    if (!fs.existsSync(ledgerPath)) {
      return [];
    }

    const content = fs.readFileSync(ledgerPath, 'utf-8').trim();
    if (!content) return [];

    const lines = content.split('\n').filter(Boolean);
    const events = [];

    const slice = limit > 0 ? lines.slice(-limit) : lines;
    for (const line of slice) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  }

  /**
   * Project a complete backlog state by replaying an array of events
   * @param {Array<Object>} events
   * @returns {Object} Reconstructed backlog object
   */
  static projectBacklog(events = []) {
    const backlog = {
      schemaVersion: '1.0.0',
      epics: [],
      stories: [],
      tasks: [],
      metadata: { updatedAt: getTimestamp() }
    };

    for (const evt of events) {
      const p = evt.payload;
      switch (evt.type) {
        case EVENT_TYPES.EPIC_CREATED: {
          backlog.epics.push({ ...p, childStories: p.childStories || [], status: p.status || 'backlog' });
          break;
        }
        case EVENT_TYPES.STORY_CREATED: {
          backlog.stories.push({ ...p, status: p.status || 'backlog' });
          const parent = backlog.epics.find(e => e.id === p.epicId);
          if (parent) {
            parent.childStories = parent.childStories || [];
            if (!parent.childStories.includes(p.id)) {
              parent.childStories.push(p.id);
            }
          }
          break;
        }
        case EVENT_TYPES.STATE_TRANSITIONED: {
          const story = backlog.stories.find(s => s.id === p.storyId);
          if (story) {
            story.status = p.to;
            story.updatedAt = evt.timestamp;
            if (p.to === 'in-progress' && !story.startedAt) story.startedAt = evt.timestamp;
            if (p.to === 'done' && !story.completedAt) story.completedAt = evt.timestamp;
          }
          break;
        }
        case EVENT_TYPES.TASK_LEASED: {
          const story = backlog.stories.find(s => s.id === p.storyId);
          if (story) {
            story.lease = {
              agentId: p.agentId,
              leasedAt: evt.timestamp,
              expiresAt: p.expiresAt
            };
            story.assignee = { type: 'agent', identifier: p.agentId, name: p.agentId };
          }
          break;
        }
        case EVENT_TYPES.TASK_RELEASED: {
          const story = backlog.stories.find(s => s.id === p.storyId);
          if (story) {
            delete story.lease;
          }
          break;
        }
        case EVENT_TYPES.BLOCKER_FLAGGED: {
          const story = backlog.stories.find(s => s.id === p.storyId);
          if (story) {
            story.status = 'blocked';
            story.blockerReason = p.reason;
          }
          break;
        }
        case EVENT_TYPES.BLOCKER_RESOLVED: {
          const story = backlog.stories.find(s => s.id === p.storyId);
          if (story) {
            delete story.blockerReason;
            story.status = p.nextStatus || 'ready';
          }
          break;
        }
        case EVENT_TYPES.EPIC_COMPLETED: {
          const epic = backlog.epics.find(e => e.id === p.epicId);
          if (epic) epic.status = 'done';
          break;
        }
      }
    }

    return backlog;
  }

  /**
   * Calculate lead and cycle time metrics from events
   * @param {Array<Object>} events
   * @returns {Object}
   */
  static calculateMetrics(events = []) {
    const storyCreatedTimes = new Map();
    const storyStartTimes = new Map();
    const cycleTimesHours = [];
    const leadTimesHours = [];

    for (const evt of events) {
      const p = evt.payload;
      const t = new Date(evt.timestamp).getTime();

      if (evt.type === EVENT_TYPES.STORY_CREATED && p.id) {
        storyCreatedTimes.set(p.id, t);
      } else if (evt.type === EVENT_TYPES.STATE_TRANSITIONED && p.storyId) {
        if (p.to === 'in-progress' && !storyStartTimes.has(p.storyId)) {
          storyStartTimes.set(p.storyId, t);
        } else if (p.to === 'done') {
          if (storyStartTimes.has(p.storyId)) {
            const cycleMs = t - storyStartTimes.get(p.storyId);
            cycleTimesHours.push(cycleMs / (1000 * 60 * 60));
          }
          if (storyCreatedTimes.has(p.storyId)) {
            const leadMs = t - storyCreatedTimes.get(p.storyId);
            leadTimesHours.push(leadMs / (1000 * 60 * 60));
          }
        }
      }
    }

    const avg = arr => arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;

    return {
      completedStoriesCount: leadTimesHours.length,
      averageLeadTimeHours: avg(leadTimesHours),
      averageCycleTimeHours: avg(cycleTimesHours)
    };
  }
}
