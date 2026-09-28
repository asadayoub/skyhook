import test from 'node:test';
import assert from 'node:assert';
import { GanttGenerator } from '../lib/plan/GanttGenerator.js';

test('GanttGenerator: handles empty backlog gracefully', () => {
  const chart = GanttGenerator.generateGantt({ epics: [], stories: [] });
  assert.ok(chart.startsWith('```mermaid\ngantt'));
  assert.ok(chart.includes('No active epics or stories'));
  assert.ok(chart.endsWith('```\n'));
});

test('GanttGenerator: compiles epics and child stories into Mermaid Gantt', () => {
  const backlog = {
    epics: [
      { id: 'EPIC-1', title: 'User Authentication', createdAt: '2026-09-01T00:00:00.000Z', childStories: ['STORY-1', 'STORY-2'] }
    ],
    stories: [
      { id: 'STORY-1', title: 'Login API', status: 'done', createdAt: '2026-09-01T00:00:00.000Z', startedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-04T00:00:00.000Z', storyPoints: 3 },
      { id: 'STORY-2', title: 'OAuth Provider', status: 'in-progress', dependsOn: ['STORY-1'], createdAt: '2026-09-02T00:00:00.000Z', storyPoints: 5 }
    ]
  };

  const criticalPathIds = new Set(['STORY-2']);
  const chart = GanttGenerator.generateGantt(backlog, { criticalPathIds });

  assert.ok(chart.includes('section User Authentication'));
  assert.ok(chart.includes('Login API :done, s_STORY_1, 2026-09-01, 2026-09-04'));
  assert.ok(chart.includes('OAuth Provider :crit, active, s_STORY_2, after s_STORY_1, 8d'));
});

test('GanttGenerator: sanitizes titles with colons, backticks, and brackets', () => {
  const sanitized = GanttGenerator.sanitize('Feature: [Auth] `Token` <Verification>');
  assert.strictEqual(sanitized, 'Feature Auth Token Verification');
});

test('GanttGenerator: renders orphan epics without child stories', () => {
  const backlog = {
    epics: [
      { id: 'EPIC-EMPTY', title: 'Infrastructure Setup', status: 'backlog', createdAt: '2026-09-10T00:00:00.000Z', childStories: [] }
    ],
    stories: []
  };

  const chart = GanttGenerator.generateGantt(backlog);
  assert.ok(chart.includes('section Infrastructure Setup'));
  assert.ok(chart.includes('Infrastructure Setup : epic_EPIC-EMPTY, 2026-09-10, 7d'));
});
