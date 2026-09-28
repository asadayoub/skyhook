/**
 * Capacity Planner
 * Analyzes historical velocity and cycle times from events.jsonl to project
 * mathematical milestone completion dates and detect scope creep.
 */

import { EventLedger, EVENT_TYPES } from '../backlog/EventLedger.js';

export class CapacityPlanner {
  /**
   * Plan capacity and forecast delivery dates
   * @param {string} skyhookDir
   * @param {Object} backlog - Current backlog { stories: [] }
   * @param {Object} options - { windowDays: number }
   * @returns {Object} Capacity and forecasting metrics
   */
  static plan(skyhookDir, backlog = {}, options = {}) {
    const windowDays = options.windowDays || 14;
    const now = Date.now();
    const windowCutoff = now - windowDays * 24 * 60 * 60 * 1000;

    const allEvents = skyhookDir ? EventLedger.readEvents(skyhookDir, 0) : [];
    
    // Filter window events
    let recentEvents = allEvents.filter(e => new Date(e.timestamp).getTime() >= windowCutoff);
    if (recentEvents.filter(e => e.type === EVENT_TYPES.STATE_TRANSITIONED && e.payload?.to === 'done').length < 2) {
      // Fallback to all-time if recent window has sparse completions
      recentEvents = allEvents;
    }

    // 1. Calculate Historical Velocity
    const completedStoryIds = new Set();
    const storyStartTimes = new Map();
    const storyDoneTimes = new Map();
    const cycleTimesHours = [];
    let completedPoints = 0;
    let addedPoints = 0;

    const stories = backlog.stories || [];
    const storyMap = new Map(stories.map(s => [s.id, s]));

    for (const evt of recentEvents) {
      const p = evt.payload;
      const t = new Date(evt.timestamp).getTime();

      if (evt.type === EVENT_TYPES.STORY_CREATED) {
        addedPoints += Number(p.storyPoints || p.priority ? 3 : 1);
      } else if (evt.type === EVENT_TYPES.STATE_TRANSITIONED && p.storyId) {
        if (p.to === 'in-progress' && !storyStartTimes.has(p.storyId)) {
          storyStartTimes.set(p.storyId, t);
        } else if (p.to === 'done') {
          storyDoneTimes.set(p.storyId, t);
          completedStoryIds.add(p.storyId);

          if (storyStartTimes.has(p.storyId)) {
            const cycleMs = t - storyStartTimes.get(p.storyId);
            cycleTimesHours.push(cycleMs / (1000 * 60 * 60));
          }

          const storyObj = storyMap.get(p.storyId);
          completedPoints += Number(storyObj?.storyPoints || 3);
        }
      }
    }

    // Effective days observed
    const firstEventTime = recentEvents.length ? new Date(recentEvents[0].timestamp).getTime() : now - 7 * 24 * 60 * 60 * 1000;
    const elapsedDays = Math.max(1, (now - firstEventTime) / (24 * 60 * 60 * 1000));
    const elapsedWeeks = Math.max(0.2, elapsedDays / 7);

    // Weekly velocity (default to baseline 10 points/wk if brand new project)
    const observedWeeklyVelocity = completedPoints > 0 ? completedPoints / elapsedWeeks : 10;
    const weeklyVelocity = Number(observedWeeklyVelocity.toFixed(1));

    // Average cycle time in hours
    const avgCycleHours = cycleTimesHours.length 
      ? Number((cycleTimesHours.reduce((a, b) => a + b, 0) / cycleTimesHours.length).toFixed(1))
      : 4.5;

    // 2. Calculate Remaining Work
    let remainingPoints = 0;
    let remainingStoriesCount = 0;

    for (const s of stories) {
      if (s.status !== 'done' && s.status !== 'cancelled') {
        remainingPoints += Number(s.storyPoints || 3);
        remainingStoriesCount++;
      }
    }

    // 3. Forecast Delivery Dates
    const remainingWeeksP50 = remainingPoints > 0 ? Number((remainingPoints / weeklyVelocity).toFixed(1)) : 0;
    const remainingWeeksP90 = remainingPoints > 0 ? Number((remainingWeeksP50 * 1.35).toFixed(1)) : 0;

    const p50Date = new Date(now + remainingWeeksP50 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const p90Date = new Date(now + remainingWeeksP90 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 4. Scope Creep Detection
    const netPointsAdded = addedPoints - completedPoints;
    const hasScopeCreep = addedPoints > completedPoints && addedPoints > 5;

    return {
      windowDays,
      completedStoriesCount: completedStoryIds.size,
      completedPoints,
      weeklyVelocityPoints: weeklyVelocity,
      averageCycleTimeHours: avgCycleHours,
      remainingStoriesCount,
      remainingPoints,
      forecast: {
        remainingWeeksP50,
        remainingWeeksP90,
        projectedCompletionDateP50: p50Date,
        projectedCompletionDateP90: p90Date
      },
      scopeCreep: {
        detected: hasScopeCreep,
        addedPoints,
        completedPoints,
        netPointsGrowth: netPointsAdded
      }
    };
  }
}
