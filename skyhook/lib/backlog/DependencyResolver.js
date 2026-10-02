/**
 * Dependency Resolver
 * Directed Acyclic Graph (DAG) validator and dependency checker for stories and technical tasks.
 * Enforces that prerequisite work is completed before tasks/stories can be marked ready.
 */

export class DependencyResolver {
  /**
   * Get all unmet dependencies for a given story or task
   * @param {Object} item - The story or task to inspect
   * @param {Array} allStories - Full list of stories in the backlog
   * @param {Array} [allTasks=[]] - Full list of tasks in the backlog
   * @returns {Array<Object>} List of dependency items that are not 'done'
   */
  static getUnmetDependencies(item, allStories = [], allTasks = []) {
    const dependsOn = item.dependsOn || [];
    if (!Array.isArray(dependsOn) || dependsOn.length === 0) {
      return [];
    }

    const itemMap = new Map();
    for (const s of allStories) itemMap.set(s.id, s);
    for (const t of allTasks) itemMap.set(t.id, t);

    const unmet = [];

    for (const depId of dependsOn) {
      const dep = itemMap.get(depId);
      if (!dep) {
        unmet.push({ id: depId, title: 'Unknown Dependency', status: 'missing' });
      } else if (dep.status !== 'done') {
        unmet.push({ id: dep.id, title: dep.title, status: dep.status });
      }
    }

    return unmet;
  }

  /**
   * Check if a story or task is blocked by unfulfilled dependencies or explicit blockers
   * @param {Object} item
   * @param {Array} allStories
   * @param {Array} [allTasks=[]]
   * @returns {boolean}
   */
  static isBlocked(item, allStories = [], allTasks = []) {
    if (item.status === 'blocked') return true;
    const unmet = this.getUnmetDependencies(item, allStories, allTasks);
    return unmet.length > 0;
  }

  /**
   * Detect circular dependencies in a collection of items (stories, tasks, or combined)
   * @param {Array} items - Array of items with id and dependsOn
   * @returns {Array<Array<string>>} List of detected cycles, or empty array if DAG is acyclic
   */
  static detectCycles(items = []) {
    const adj = new Map();
    items.forEach(s => adj.set(s.id, s.dependsOn || []));

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

    for (const item of items) {
      if (!visited.has(item.id)) {
        dfs(item.id, []);
      }
    }

    return cycles;
  }

  /**
   * Find downstream stories or tasks that were waiting on `completedId`
   * and now have ALL of their dependencies completed.
   * @param {string} completedId
   * @param {Array} allStories
   * @param {Array} [allTasks=[]]
   * @returns {Array<Object>} Newly unblocked items
   */
  static findNewlyUnblockedStories(completedId, allStories = [], allTasks = []) {
    const unblocked = [];
    const allCombined = [...allStories, ...allTasks];

    const simulatedStories = allStories.map(s => 
      s.id === completedId ? { ...s, status: 'done' } : s
    );
    const simulatedTasks = allTasks.map(t =>
      t.id === completedId ? { ...t, status: 'done' } : t
    );

    for (const item of allCombined) {
      if (item.id === completedId) continue;
      const deps = item.dependsOn || [];
      if (deps.includes(completedId)) {
        const remainingUnmet = this.getUnmetDependencies(item, simulatedStories, simulatedTasks);
        if (remainingUnmet.length === 0 && (item.status === 'blocked' || item.status === 'backlog')) {
          unblocked.push(item);
        }
      }
    }

    return unblocked;
  }
}
