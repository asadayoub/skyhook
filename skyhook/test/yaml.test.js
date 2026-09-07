import test from 'node:test';
import assert from 'node:assert';
import { parseYaml, stringifyYaml } from '../lib/yaml.js';

test('parseYaml basic key-value', (t) => {
  const result = parseYaml('key: value');
  assert.deepStrictEqual(result, { key: 'value' });
});

test('parseYaml nested objects', (t) => {
  const result = parseYaml(`parent:
  child: value`);
  assert.deepStrictEqual(result, { parent: { child: 'value' } });
});

test('parseYaml arrays', (t) => {
  const result = parseYaml(`items:
  - one
  - two`);
  assert.deepStrictEqual(result, { items: ['one', 'two'] });
});

test('parseYaml empty arrays (Bug #1 Fix)', (t) => {
  const result = parseYaml('items: []');
  assert.deepStrictEqual(result, { items: [] });
});

test('stringifyYaml arrays', (t) => {
  const obj = { items: ['one', 'two'] };
  const yaml = stringifyYaml(obj);
  assert.strictEqual(yaml, `items:
  - one
  - two
`);
});
