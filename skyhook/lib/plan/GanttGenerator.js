/**
 * Gantt Generator
 * Compiles epics, stories, and dependencies into native Mermaid.js Gantt chart syntax.
 */

export class GanttGenerator {
  /**
   * Sanitize text for Mermaid syntax
   */
  static sanitize(text) {
    if (!text) return '';
    return text.replace(/[:;#`"<>{}|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Format ISO date to YYYY-MM-DD
   */
  static formatDate(isoString, fallback = '2026-09-01') {
    if (!isoString) return fallback;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return fallback;
      return d.toISOString().split('T')[0];
    } catch {
      return fallback;
    }
  }

  /**
   * Generate Mermaid Gantt syntax from backlog
   * @param {Object} backlog - { epics: [], stories: [] }
   * @param {Object} options - { criticalPathIds: Set, defaultDurationDays: number }
   * @returns {string} Mermaid code block
   */
  static generateGantt(backlog = {}, options = {}) {
    const epics = backlog.epics || [];
    const stories = backlog.stories || [];
    const criticalPathIds = options.criticalPathIds || new Set();
    const defaultDuration = options.defaultDurationDays || 5;

    let mermaid = '```mermaid\ngantt\n';
    mermaid += '    title Project Delivery Roadmap\n';
    mermaid += '    dateFormat  YYYY-MM-DD\n';
    mermaid += '    axisFormat  %b %d\n\n';

    if (epics.length === 0 && stories.length === 0) {
      mermaid += '    section Backlog\n';
      mermaid += '    No active epics or stories :milestone, m1, 2026-09-01, 0d\n';
      mermaid += '```\n';
      return mermaid;
    }

    const storyMap = new Map(stories.map(s => [s.id, s]));

    for (const epic of epics) {
      const epicTitle = this.sanitize(epic.title) || epic.id;
      mermaid += `    section ${epicTitle}\n`;

      const childStories = stories.filter(s => s.epicId === epic.id || (Array.isArray(epic.childStories) && epic.childStories.includes(s.id)));

      if (childStories.length === 0) {
        // Render epic itself as a milestone or task
        const statusTag = epic.status === 'done' ? ':done, ' : epic.status === 'in-progress' ? ':active, ' : ': ';
        const date = this.formatDate(epic.createdAt);
        mermaid += `    ${epicTitle} ${statusTag}epic_${epic.id}, ${date}, 7d\n`;
      } else {
        for (const story of childStories) {
          const title = this.sanitize(story.title) || story.id;
          const storyId = `s_${story.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

          // Determine tags
          const tags = [];
          if (criticalPathIds.has(story.id)) tags.push('crit');
          if (story.status === 'done') tags.push('done');
          else if (story.status === 'in-progress') tags.push('active');

          const tagStr = tags.length ? `:${tags.join(', ')}, ` : ': ';

          // Estimate duration
          const durationDays = story.storyPoints ? Math.max(2, Math.round(story.storyPoints * 1.5)) : defaultDuration;

          // Dependencies
          const deps = (story.dependsOn || [])
            .filter(rawId => storyMap.has(rawId))
            .map(rawId => `s_${rawId.replace(/[^a-zA-Z0-9_]/g, '_')}`);

          if (deps.length > 0 && story.status !== 'done') {
            mermaid += `    ${title} ${tagStr}${storyId}, after ${deps[0]}, ${durationDays}d\n`;
          } else if (story.status === 'done' && story.startedAt && story.completedAt) {
            const start = this.formatDate(story.startedAt);
            const end = this.formatDate(story.completedAt);
            mermaid += `    ${title} ${tagStr}${storyId}, ${start}, ${end}\n`;
          } else {
            const start = this.formatDate(story.startedAt || story.createdAt);
            mermaid += `    ${title} ${tagStr}${storyId}, ${start}, ${durationDays}d\n`;
          }
        }
      }

      // Direct epic tasks (e.g. spikes, chores, architectural investigations)
      const directEpicTasks = (backlog.tasks || []).filter(t => (t.parentId === epic.id || t.epicId === epic.id) && t.parentType === 'epic');
      for (const task of directEpicTasks) {
        const title = this.sanitize(task.title) || task.id;
        const taskId = `t_${task.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const tags = [];
        if (task.status === 'done') tags.push('done');
        else if (task.status === 'in-progress') tags.push('active');
        const tagStr = tags.length ? `:${tags.join(', ')}, ` : ': ';
        const durationDays = task.estimatedMinutes ? Math.max(1, Math.round(task.estimatedMinutes / 480)) : 2;
        const start = this.formatDate(task.startedAt || task.createdAt);
        mermaid += `    [Task] ${title} ${tagStr}${taskId}, ${start}, ${durationDays}d\n`;
      }
      mermaid += '\n';
    }

    mermaid += '```\n';
    return mermaid;
  }
}
