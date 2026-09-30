import test from 'node:test';
import assert from 'node:assert';
import { DependencyResolver } from '../lib/backlog/DependencyResolver.js';
import { CriticalPathAnalyzer } from '../lib/plan/CriticalPathAnalyzer.js';
import { TraceabilityMatrix } from '../lib/plan/TraceabilityMatrix.js';

test('DependencyResolver - Unmet Dependencies & Blocker Checks', () => {
  const allStories = [
    { id: 'S1', title: 'Story 1', status: 'done', dependsOn: [] },
    { id: 'S2', title: 'Story 2', status: 'in-progress', dependsOn: ['S1'] },
    { id: 'S3', title: 'Story 3', status: 'ready', dependsOn: ['S2', 'MISSING_DEP'] },
    { id: 'S4', title: 'Story 4', status: 'blocked', dependsOn: ['S1'] }
  ];

  // 1. Story with completed dependency
  const unmetS2 = DependencyResolver.getUnmetDependencies(allStories[1], allStories);
  assert.strictEqual(unmetS2.length, 0);
  assert.strictEqual(DependencyResolver.isBlocked(allStories[1], allStories), false);

  // 2. Story with in-progress and missing dependency
  const unmetS3 = DependencyResolver.getUnmetDependencies(allStories[2], allStories);
  assert.strictEqual(unmetS3.length, 2);
  assert.ok(unmetS3.some(u => u.id === 'S2' && u.status === 'in-progress'));
  assert.ok(unmetS3.some(u => u.id === 'MISSING_DEP' && u.status === 'missing'));
  assert.strictEqual(DependencyResolver.isBlocked(allStories[2], allStories), true);

  // 3. Story explicitly marked blocked
  assert.strictEqual(DependencyResolver.isBlocked(allStories[3], allStories), true);
});

test('DependencyResolver - DFS Cycle Detection', () => {
  // 1. Clean DAG
  const cleanDAG = [
    { id: 'A', dependsOn: [] },
    { id: 'B', dependsOn: ['A'] },
    { id: 'C', dependsOn: ['A', 'B'] }
  ];
  assert.deepStrictEqual(DependencyResolver.detectCycles(cleanDAG), []);

  // 2. Direct self-cycle: A -> A
  const selfCycle = [
    { id: 'A', dependsOn: ['A'] }
  ];
  const selfCycles = DependencyResolver.detectCycles(selfCycle);
  assert.ok(selfCycles.length > 0);
  assert.ok(selfCycles[0].includes('A'));

  // 3. 2-node cycle: A -> B -> A
  const twoNodeCycle = [
    { id: 'A', dependsOn: ['B'] },
    { id: 'B', dependsOn: ['A'] }
  ];
  const twoCycles = DependencyResolver.detectCycles(twoNodeCycle);
  assert.ok(twoCycles.length > 0);

  // 4. Multi-node cycle: A -> B -> C -> A
  const multiNodeCycle = [
    { id: 'A', dependsOn: ['C'] },
    { id: 'B', dependsOn: ['A'] },
    { id: 'C', dependsOn: ['B'] },
    { id: 'D', dependsOn: ['C'] } // Downstream node
  ];
  const multiCycles = DependencyResolver.detectCycles(multiNodeCycle);
  assert.ok(multiCycles.length > 0);
});

test('DependencyResolver - Cascading Dependency Unblocks', () => {
  const stories = [
    { id: 'ROOT', title: 'Database Schema', status: 'in-progress', dependsOn: [] },
    { id: 'CHILD1', title: 'Auth API', status: 'blocked', dependsOn: ['ROOT'] },
    { id: 'CHILD2', title: 'Payment API', status: 'blocked', dependsOn: ['ROOT', 'OTHER'] },
    { id: 'OTHER', title: 'Third party setup', status: 'backlog', dependsOn: [] }
  ];

  // When ROOT completes:
  // - CHILD1 should be unblocked (only depended on ROOT)
  // - CHILD2 should NOT be unblocked (still waiting on OTHER)
  const unblocked = DependencyResolver.findNewlyUnblockedStories('ROOT', stories);
  assert.strictEqual(unblocked.length, 1);
  assert.strictEqual(unblocked[0].id, 'CHILD1');
});

test('CriticalPathAnalyzer - Topological Waves & Critical Path Calculation', () => {
  // Empty input safety
  const emptyRes = CriticalPathAnalyzer.analyze([]);
  assert.deepStrictEqual(emptyRes.criticalPath, []);
  assert.deepStrictEqual(emptyRes.waves, []);

  // Standard backlog DAG:
  // Root: S1 (3 pts), S2 (5 pts)
  // Wave 1: S3 dependsOn S1 (8 pts), S4 dependsOn S2 (2 pts)
  // Wave 2: S5 dependsOn S3, S4 (5 pts)
  const stories = [
    { id: 'S1', storyPoints: 3, dependsOn: [] },
    { id: 'S2', storyPoints: 5, dependsOn: [] },
    { id: 'S3', storyPoints: 8, dependsOn: ['S1'] },
    { id: 'S4', storyPoints: 2, dependsOn: ['S2'] },
    { id: 'S5', storyPoints: 5, dependsOn: ['S3', 'S4'] }
  ];

  const analysis = CriticalPathAnalyzer.analyze(stories);

  // 1. Verify waves (Topological Levels)
  assert.strictEqual(analysis.waves.length, 3);
  assert.ok(analysis.waves[0].includes('S1') && analysis.waves[0].includes('S2'));
  assert.ok(analysis.waves[1].includes('S3') && analysis.waves[1].includes('S4'));
  assert.ok(analysis.waves[2].includes('S5'));

  // 2. Verify Critical Path:
  // Path 1: S1 (3) -> S3 (8) -> S5 (5) = 16 pts
  // Path 2: S2 (5) -> S4 (2) -> S5 (5) = 12 pts
  // Longest path must be S1 -> S3 -> S5 (total duration 16)
  assert.deepStrictEqual(analysis.criticalPath, ['S1', 'S3', 'S5']);
  assert.strictEqual(analysis.totalCriticalDurationEstimate, 16);
  assert.ok(analysis.criticalPathSet.has('S1'));
  assert.ok(analysis.criticalPathSet.has('S3'));
  assert.ok(analysis.criticalPathSet.has('S5'));
  assert.ok(!analysis.criticalPathSet.has('S2'));
  assert.ok(!analysis.criticalPathSet.has('S4'));
});

test('TraceabilityMatrix - Correlation Table & Status Badges', () => {
  // 1. Empty requirements
  assert.strictEqual(TraceabilityMatrix.generate({}), '*No requirements defined yet.*');

  // 2. Populated matrix with all 4 status states
  const data = {
    functionalReqs: {
      requirements: [
        { id: 'REQ-01', title: 'User Login | Web', category: 'auth' },
        { id: 'REQ-02', title: 'Payment Processing', category: 'billing' },
        { id: 'REQ-03', title: 'Task Scheduling', category: 'core' },
        { id: 'REQ-04', title: 'Audit Trail', category: 'compliance' }
      ]
    },
    backlog: {
      stories: [
        { id: 'S-01', status: 'ready', relatedRequirements: ['REQ-03'] },
        { id: 'S-02', status: 'in-progress', relatedRequirements: ['REQ-02'] }
      ]
    },
    decisions: {
      decisions: [
        { id: 'ADR-001', title: 'Use Stripe', relatedRequirements: ['REQ-02'] }
      ]
    },
    symbols: [
      { requirementId: 'REQ-01', traced: true, symbolName: 'loginHandler' }
    ]
  };

  const md = TraceabilityMatrix.generate(data);

  // Markdown table headers
  assert.ok(md.includes('| Req ID | Requirement Title | Category | Stories | Code Symbols | ADRs | Status |'));

  // REQ-01: Implemented
  assert.ok(md.includes('**REQ-01**'));
  assert.ok(md.includes('User Login - Web'), 'Pipe character replaced with hyphen');
  assert.ok(md.includes('`loginHandler`'));
  assert.ok(md.includes('🟢 Implemented'));

  // REQ-02: In-Progress
  assert.ok(md.includes('**REQ-02**'));
  assert.ok(md.includes('ADR-001'));
  assert.ok(md.includes('🟡 In-Progress'));

  // REQ-03: Ready
  assert.ok(md.includes('**REQ-03**'));
  assert.ok(md.includes('⚪ Ready'));

  // REQ-04: Untraced
  assert.ok(md.includes('**REQ-04**'));
  assert.ok(md.includes('🔴 Untraced'));
});
