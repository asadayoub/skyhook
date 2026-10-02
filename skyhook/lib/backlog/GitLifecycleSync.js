/**
 * Git Lifecycle Sync
 * Bridges Git events (branch checkouts, commits, PR merges) with Backlog State Machine transitions across Stories and Tasks.
 */

export class GitLifecycleSync {
  /**
   * Extract story or task ID from a git branch name
   * Examples: feat/01HX89ZABCDEF1234567890123-login, fix/STORY-42_db, feat/TASK-101-auth
   * @param {string} branchName
   * @returns {string|null}
   */
  static extractStoryIdFromBranch(branchName) {
    if (!branchName || typeof branchName !== 'string') return null;

    // 1. Check for ULID (26 characters Crockford Base32)
    const ulidMatch = branchName.match(/([0-9A-HJKMNP-TV-Z]{26})/i);
    if (ulidMatch) return ulidMatch[1];

    // 2. Check for TASK-XXX style IDs first (more specific)
    const taskMatch = branchName.match(/(TASK-[0-9]+)/i);
    if (taskMatch) return taskMatch[1].toUpperCase();

    // 3. Check for STORY-XXX style IDs
    const storyMatch = branchName.match(/(STORY-[0-9]+)/i);
    if (storyMatch) return storyMatch[1].toUpperCase();

    return null;
  }

  /**
   * Extract work item resolution actions from a commit message
   * Examples: "feat: add user login (closes #01HX...)", "fix: bug fixes TASK-12", "closes STORY-5"
   * @param {string} commitMessage
   * @returns {Array<{ action: string, workId: string, storyId: string }>}
   */
  static extractStoryActionsFromCommit(commitMessage) {
    if (!commitMessage || typeof commitMessage !== 'string') return [];

    const actions = [];
    const regex = /(?:closes?|closed|fixes?|fixed|resolves?|resolved)\s+:?#?([0-9A-HJKMNP-TV-Z]{26}|TASK-[0-9]+|STORY-[0-9]+)/gi;
    let match;

    while ((match = regex.exec(commitMessage)) !== null) {
      actions.push({
        action: 'close',
        workId: match[1],
        storyId: match[1] // backward compatibility
      });
    }

    return actions;
  }

  /**
   * Synchronize git state with the backlog state machine
   * @param {Object} ctx - SkyhookContext
   * @param {Object} gitContext - { branch, commitMessage }
   * @returns {Object} Sync actions performed
   */
  static sync(ctx, gitContext = {}) {
    const results = [];
    const backlog = ctx.readBacklog();
    const stories = backlog.stories || [];
    const tasks = backlog.tasks || [];

    // 1. Check branch name for active development
    if (gitContext.branch) {
      const workId = this.extractStoryIdFromBranch(gitContext.branch);
      if (workId) {
        const task = tasks.find(t => t.id === workId);
        const story = stories.find(s => s.id === workId);

        if (task && (task.status === 'ready' || task.status === 'backlog')) {
          if (typeof ctx.updateTaskStatus === 'function') {
            ctx.updateTaskStatus(workId, 'in-progress', {
              reason: `Branch '${gitContext.branch}' checked out for development`
            });
          } else {
            ctx.updateStoryStatus(workId, 'in-progress', {
              reason: `Branch '${gitContext.branch}' checked out for development`
            });
          }
          results.push({ workId, transition: `${task.status} -> in-progress`, trigger: 'branch', type: 'task' });
        } else if (story && (story.status === 'ready' || story.status === 'backlog')) {
          ctx.updateStoryStatus(workId, 'in-progress', {
            reason: `Branch '${gitContext.branch}' checked out for development`
          });
          results.push({ workId, storyId: workId, transition: `${story.status} -> in-progress`, trigger: 'branch', type: 'story' });
        }
      }
    }

    // 2. Check commit message for closing keywords
    if (gitContext.commitMessage) {
      const actions = this.extractStoryActionsFromCommit(gitContext.commitMessage);
      for (const act of actions) {
        const id = act.workId || act.storyId;
        const task = tasks.find(t => t.id === id);
        const story = stories.find(s => s.id === id);

        if (task && task.status !== 'done') {
          if (typeof ctx.updateTaskStatus === 'function') {
            ctx.updateTaskStatus(id, 'in-review', {
              commitMessage: gitContext.commitMessage,
              reason: `Referenced in commit: ${gitContext.commitMessage.slice(0, 60)}`
            });
          } else {
            ctx.updateStoryStatus(id, 'in-review', {
              commitMessage: gitContext.commitMessage,
              reason: `Referenced in commit: ${gitContext.commitMessage.slice(0, 60)}`
            });
          }
          results.push({ workId: id, transition: `${task.status} -> in-review`, trigger: 'commit', type: 'task' });
        } else if (story && story.status !== 'done') {
          ctx.updateStoryStatus(id, 'in-review', {
            commitMessage: gitContext.commitMessage,
            reason: `Referenced in commit: ${gitContext.commitMessage.slice(0, 60)}`
          });
          results.push({ workId: id, storyId: id, transition: `${story.status} -> in-review`, trigger: 'commit', type: 'story' });
        }
      }
    }

    return { synced: results.length > 0, actions: results };
  }
}
