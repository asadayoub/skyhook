import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ScopedPlanGenerator } from '../lib/plan/ScopedPlanGenerator.js';

function createMockContext(tmpDir) {
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const funcReqs = {
    requirements: [
      {
        id: 'REQ-001',
        title: 'User Authentication',
        userStory: 'As a user I want to log in with email and password',
        category: 'security',
        priority: 'critical',
        status: 'in-progress',
        acceptanceCriteria: ['Valid credentials return JWT', 'Invalid credentials return 401']
      }
    ]
  };

  const nonFuncReqs = {
    requirements: [
      {
        id: 'REQ-002',
        title: 'Response Latency',
        metric: 'p99 latency',
        target: '< 100ms',
        category: 'performance',
        priority: 'high',
        status: 'ready'
      }
    ]
  };

  const backlog = {
    epics: [
      {
        id: 'EPIC-AUTH',
        title: 'Core Authentication Suite',
        goal: 'Provide secure JWT-based identity tokens',
        status: 'in-progress',
        successMetrics: ['Zero unauthenticated breaches'],
        childStories: ['STORY-LOGIN']
      }
    ],
    stories: [
      {
        id: 'STORY-LOGIN',
        epicId: 'EPIC-AUTH',
        title: 'Login Controller and Service',
        status: 'done',
        storyPoints: 5,
        relatedRequirements: ['REQ-001'],
        acceptanceCriteria: ['JWT generated successfully']
      }
    ]
  };

  const decisions = {
    decisions: [
      {
        id: 'ADR-001',
        title: 'Use Argon2id for Password Hashing',
        status: 'accepted',
        relatedRequirements: ['REQ-001']
      }
    ]
  };

  return {
    skyhookDir,
    readFunctionalReqs: () => funcReqs,
    readNonFunctionalReqs: () => nonFuncReqs,
    readBacklog: () => backlog,
    readDecisions: () => decisions
  };
}

test('ScopedPlanGenerator: generates detailed requirement plan', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-scoped-req-'));
  try {
    const ctx = createMockContext(tmpDir);
    const mockSymbols = [
      { symbolName: 'loginHandler', traced: true, requirementId: 'REQ-001', filePath: 'src/auth.js', line: 15 }
    ];

    const res = ScopedPlanGenerator.generateRequirementPlan('REQ-001', ctx, mockSymbols);
    assert.ok(fs.existsSync(res.path));
    assert.strictEqual(res.req.id, 'REQ-001');

    const content = fs.readFileSync(res.path, 'utf-8');
    assert.ok(content.includes('# Requirement Plan: REQ-001'));
    assert.ok(content.includes('Core Authentication Suite') || content.includes('STORY-LOGIN'));
    assert.ok(content.includes('ADR-001'));
    assert.ok(content.includes('loginHandler'));
    assert.ok(content.includes('Definition of Done'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ScopedPlanGenerator: generates detailed epic plan with Gantt chart', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-scoped-epic-'));
  try {
    const ctx = createMockContext(tmpDir);
    const res = ScopedPlanGenerator.generateEpicPlan('EPIC-AUTH', ctx);
    assert.ok(fs.existsSync(res.path));
    assert.strictEqual(res.epic.id, 'EPIC-AUTH');

    const content = fs.readFileSync(res.path, 'utf-8');
    assert.ok(content.includes('# Epic Plan: EPIC-AUTH — Core Authentication Suite'));
    assert.ok(content.includes('Provide secure JWT-based identity tokens'));
    assert.ok(content.includes('STORY-LOGIN'));
    assert.ok(content.includes('```mermaid'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ScopedPlanGenerator: generates all plans in batch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-scoped-all-'));
  try {
    const ctx = createMockContext(tmpDir);
    const res = ScopedPlanGenerator.generateAllScopedPlans(ctx, []);
    assert.strictEqual(res.requirementsCount, 2);
    assert.strictEqual(res.epicsCount, 1);
    assert.strictEqual(res.requirementPlans.length, 2);
    assert.strictEqual(res.epicPlans.length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ScopedPlanGenerator: throws meaningful error for missing IDs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-scoped-err-'));
  try {
    const ctx = createMockContext(tmpDir);
    assert.throws(() => ScopedPlanGenerator.generateRequirementPlan('REQ-NONEXISTENT', ctx), /Requirement not found/);
    assert.throws(() => ScopedPlanGenerator.generateEpicPlan('EPIC-NONEXISTENT', ctx), /Epic not found/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
