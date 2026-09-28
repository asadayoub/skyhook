/**
 * Critical Path Analyzer
 * Analyzes the backlog Directed Acyclic Graph (DAG) to determine the Critical Path,
 * task execution waves, and parallel work streams.
 */

export class CriticalPathAnalyzer {
  /**
   * Analyze the backlog to determine the Critical Path and execution waves
   * @param {Array<Object>} stories - All backlog stories
   * @returns {Object} { criticalPath: Array<string>, criticalPathSet: Set<string>, waves: Array<Array<string>> }
   */
  static analyze(stories = []) {
    if (!Array.isArray(stories) || stories.length === 0) {
      return {
        criticalPath: [],
        criticalPathSet: new Set(),
        waves: []
      };
    }

    const storyMap = new Map(stories.map(s => [s.id, s]));
    
    // Build adjacency list: Prerequisite -> Dependent
    // i.e., If B depends on A, edge is A -> B
    const dependentsMap = new Map();
    const inDegree = new Map();

    stories.forEach(s => {
      dependentsMap.set(s.id, []);
      inDegree.set(s.id, 0);
    });

    for (const story of stories) {
      const deps = story.dependsOn || [];
      for (const depId of deps) {
        if (dependentsMap.has(depId)) {
          dependentsMap.get(depId).push(story.id);
          inDegree.set(story.id, (inDegree.get(story.id) || 0) + 1);
        }
      }
    }

    // 1. Calculate Execution Waves (Topological Sort Leveling)
    const waves = [];
    let currentWave = [];
    const tempInDegree = new Map(inDegree);

    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) {
        currentWave.push(id);
      }
    }

    const visitedCount = { count: 0 };
    while (currentWave.length > 0) {
      waves.push([...currentWave]);
      visitedCount.count += currentWave.length;
      const nextWave = [];

      for (const u of currentWave) {
        for (const v of dependentsMap.get(u) || []) {
          tempInDegree.set(v, tempInDegree.get(v) - 1);
          if (tempInDegree.get(v) === 0) {
            nextWave.push(v);
          }
        }
      }

      currentWave = nextWave;
    }

    // 2. Calculate Longest Path (Critical Path)
    // Weight = storyPoints || 3
    const weights = new Map();
    stories.forEach(s => weights.set(s.id, Number(s.storyPoints) || 3));

    const dist = new Map();
    const parent = new Map();
    stories.forEach(s => dist.set(s.id, -Infinity));

    // Initialize root nodes (inDegree === 0)
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        dist.set(id, weights.get(id));
      }
    }

    // Relax in topological wave order
    for (const wave of waves) {
      for (const u of wave) {
        const uDist = dist.get(u);
        for (const v of dependentsMap.get(u) || []) {
          const vWeight = weights.get(v);
          if (uDist + vWeight > dist.get(v)) {
            dist.set(v, uDist + vWeight);
            parent.set(v, u);
          }
        }
      }
    }

    // Find node with maximum distance
    let maxNode = null;
    let maxDist = -Infinity;
    for (const [id, d] of dist.entries()) {
      if (d > maxDist) {
        maxDist = d;
        maxNode = id;
      }
    }

    // Backtrack to find critical path sequence
    const criticalPath = [];
    let curr = maxNode;
    while (curr) {
      criticalPath.unshift(curr);
      curr = parent.get(curr);
    }

    return {
      criticalPath,
      criticalPathSet: new Set(criticalPath),
      waves,
      totalCriticalDurationEstimate: maxDist > 0 ? maxDist : 0
    };
  }
}
