import test from 'node:test';
import assert from 'node:assert';
import { GitLifecycleSync } from '../lib/backlog/GitLifecycleSync.js';

test('GitLifecycleSync extracts story IDs from branch names', () => {
  const ulid = '01HX89ZABCDEF1234567890123';
  assert.strictEqual(
    GitLifecycleSync.extractStoryIdFromBranch(`feat/${ulid}-login-api`),
    ulid
  );
  assert.strictEqual(
    GitLifecycleSync.extractStoryIdFromBranch('fix/STORY-42-auth-bug'),
    'STORY-42'
  );
  assert.strictEqual(
    GitLifecycleSync.extractStoryIdFromBranch('main'),
    null
  );
});

test('GitLifecycleSync extracts closing story actions from commit messages', () => {
  const msg1 = 'feat: implement oauth (closes #01HX89ZABCDEF1234567890123)';
  const actions1 = GitLifecycleSync.extractStoryActionsFromCommit(msg1);
  assert.strictEqual(actions1.length, 1);
  assert.strictEqual(actions1[0].storyId, '01HX89ZABCDEF1234567890123');

  const msg2 = 'fix: resolve race condition in database (fixes STORY-88)';
  const actions2 = GitLifecycleSync.extractStoryActionsFromCommit(msg2);
  assert.strictEqual(actions2.length, 1);
  assert.strictEqual(actions2[0].storyId, 'STORY-88');
});

test('GitLifecycleSync synchronizes git branch and commit events with backlog', () => {
  const stories = [
    { id: 'STORY-1', title: 'Login API', status: 'ready' },
    { id: 'STORY-2', title: 'Payment Webhook', status: 'in-progress' }
  ];

  const updated = [];
  const mockCtx = {
    readBacklog: () => ({ stories }),
    updateStoryStatus: (id, status, meta) => {
      updated.push({ id, status, meta });
      return true;
    }
  };

  // 1. Branch checkout sync
  const res1 = GitLifecycleSync.sync(mockCtx, { branch: 'feat/STORY-1-login' });
  assert.strictEqual(res1.synced, true);
  assert.strictEqual(updated[0].id, 'STORY-1');
  assert.strictEqual(updated[0].status, 'in-progress');

  // 2. Commit message sync
  const res2 = GitLifecycleSync.sync(mockCtx, { commitMessage: 'feat: finish webhook closes #STORY-2' });
  assert.strictEqual(res2.synced, true);
  assert.strictEqual(updated[1].id, 'STORY-2');
  assert.strictEqual(updated[1].status, 'in-review');
});
