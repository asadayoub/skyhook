/**
 * Dependency Resolver
 * Directed Acyclic Graph (DAG) validator and dependency checker for stories.
 * Enforces that prerequisite work is completed before tasks can be marked ready.
 */

export class DependencyResolver {
  /**
   * Get all unmet dependencies for a given story
   * @param {Object} story - The story to inspect
   * @param {Array} allStories - Full list of stories in the backlog
   * @returns {Array<Object>} List of dependency stories that are not 'done'
   */
  static getUnmetDependencies(story, allStories = []) {
    const dependsOn = story.dependsOn || [];
    if (!Array.isArray(dependsOn) || dependsOn.length === 0) {
      return [];
    }

    const storyMap = new Map(allStories.map(s => [s.id, s]));
    const unmet = [];

    for (const depId of dependsOn) {
      const dep = storyMap.get(depId);
      if (!dep) {
        unmet.push({ id: depId, title: 'Unknown Dependency', status: 'missing' });
      } else if (dep.status !== 'done') {
        unmet.push({ id: dep.id, title: dep.title, status: dep.status });
      }
    }

    return unmet;
  }

  /**
   * Check if a story is blocked by unfulfilled dependencies or explicit blockers
   * @param {Object} story
   * @param {Array} allStories
   * @returns {boolean}
   */
  static isBlocked(story, allStories = []) {
    if (story.status === 'blocked') return true;
    const unmet = this.getUnmetDependencies(story, allStories);
    return unmet.length > 0;
  }

  /**
   * Detect circular dependencies in a collection of stories
   * @param {Array} stories - Array of stories with id and dependsOn
   * @returns {Array<Array<string>>} List of detected cycles, or empty array if DAG is acyclic
   */
  static detectCycles(stories = []) {
    const adj = new Map();
    stories.forEach(s => adj.set(s.id, s.dependsOn || []));

    const visited = new Set();
    const inStack = new Set();
    const cycles = [];

    function dfs(node, path) {
      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (inStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart).concat(neighbor));
        }
      }

      inStack.delete(node);
    }

    for (const story of stories) {
      if (!visited.has(story.id)) {
        dfs(story.id, []);
      }
    }

    return cycles;
  }

  /**
   * Find downstream stories that were waiting on `completedStoryId`
   * and now have ALL of their dependencies completed.
   * @param {string} completedStoryId
   * @param {Array} allStories
   * @returns {Array<Object>} Newly unblocked stories
   */
  static findNewlyUnblockedStories(completedStoryId, allStories = []) {
    const unblocked = [];
    const simulatedStories = allStories.map(s => 
      s.id === completedStoryId ? { ...s, status: 'done' } : s
    );

    for (const s of allStories) {
      if (s.id === completedStoryId) continue;
      const deps = s.dependsOn || [];
      if (deps.includes(completedStoryId)) {
        const remainingUnmet = this.getUnmetDependencies(s, simulatedStories);
        if (remainingUnmet.length === 0 && (s.status === 'blocked' || s.status === 'backlog')) {
          unblocked.push(s);
        }
      }
    }

    return unblocked;
  }
}
