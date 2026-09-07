import test from 'node:test';
import assert from 'node:assert';
import { validateBacklog, validateFeatures, validateDecisions } from '../lib/schema.js';

test('validateBacklog fills missing properties (Bug #2 Fix)', (t) => {
  const result = validateBacklog({});
  assert.deepStrictEqual(result, { epics: [], stories: [], tasks: [] });
});

test('validateBacklog throws on invalid type', (t) => {
  assert.throws(() => {
    validateBacklog({ epics: "not an array" });
  }, /Schema Validation Error: backlog.epics must be an array/);
});

test('validateFeatures requires array', (t) => {
  assert.throws(() => validateFeatures({}), /Schema Validation Error: features must be a root array/);
  assert.deepStrictEqual(validateFeatures([]), []);
});
