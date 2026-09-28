/**
 * Git Lifecycle Sync
 * Bridges Git events (branch checkouts, commits, PR merges) with Backlog State Machine transitions.
 */

export class GitLifecycleSync {
  /**
   * Extract story ID from a git branch name
   * Examples: feat/01HX89ZABCDEF1234567890123-login, fix/STORY-42_db, 01HX89...
   * @param {string} branchName
   * @returns {string|null}
   */
  static extractStoryIdFromBranch(branchName) {
    if (!branchName || typeof branchName !== 'string') return null;

    // 1. Check for ULID (26 characters Crockford Base32)
    const ulidMatch = branchName.match(/([0-9A-HJKMNP-TV-Z]{26})/i);
    if (ulidMatch) return ulidMatch[1];

    // 2. Check for STORY-XXX or TASK-XXX style IDs
    const storyMatch = branchName.match(/(STORY-[0-9]+|TASK-[0-9]+)/i);
    if (storyMatch) return storyMatch[1].toUpperCase();

    return null;
  }

  /**
   * Extract story resolution actions from a commit message
   * Examples: "feat: add user login (closes #01HX...)", "fix: bug fixes STORY-12"
   * @param {string} commitMessage
   * @returns {Array<{ action: string, storyId: string }>}
   */
  static extractStoryActionsFromCommit(commitMessage) {
    if (!commitMessage || typeof commitMessage !== 'string') return [];

    const actions = [];
    // Regex for: closes|closed|close|fixes|fixed|fix|resolves|resolved|resolve followed by #?ID
    const regex = /(?:closes?|closed|fixes?|fixed|resolves?|resolved)\s+:?#?([0-9A-HJKMNP-TV-Z]{26}|STORY-[0-9]+|TASK-[0-9]+)/gi;
    let match;

    while ((match = regex.exec(commitMessage)) !== null) {
      actions.push({
        action: 'close',
        storyId: match[1]
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

    // 1. Check branch name for active development
    if (gitContext.branch) {
      const storyId = this.extractStoryIdFromBranch(gitContext.branch);
      if (storyId) {
        const story = stories.find(s => s.id === storyId);
        if (story && (story.status === 'ready' || story.status === 'backlog')) {
          ctx.updateStoryStatus(storyId, 'in-progress', {
            reason: `Branch '${gitContext.branch}' checked out for development`
          });
          results.push({ storyId, transition: `${story.status} -> in-progress`, trigger: 'branch' });
        }
      }
    }

    // 2. Check commit message for closing keywords
    if (gitContext.commitMessage) {
      const actions = this.extractStoryActionsFromCommit(gitContext.commitMessage);
      for (const act of actions) {
        const story = stories.find(s => s.id === act.storyId);
        if (story && story.status !== 'done') {
          ctx.updateStoryStatus(act.storyId, 'in-review', {
            commitMessage: gitContext.commitMessage,
            reason: `Referenced in commit: ${gitContext.commitMessage.slice(0, 60)}`
          });
          results.push({ storyId: act.storyId, transition: `${story.status} -> in-review`, trigger: 'commit' });
        }
      }
    }

    return { synced: results.length > 0, actions: results };
  }
}
