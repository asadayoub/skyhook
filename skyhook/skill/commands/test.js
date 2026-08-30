import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseYaml, stringifyYaml } from './simple-yaml.js';

describe('simple-yaml parser', () => {
  it('parses basic key-value', () => {
    const result = parseYaml('key: value');
    assert.deepStrictEqual(result, { key: 'value' });
  });

  it('parses nested objects', () => {
    const result = parseYaml('parent:\n  child: value');
    assert.deepStrictEqual(result, { parent: { child: 'value' } });
  });

  it('parses arrays', () => {
    const result = parseYaml('items:\n  - one\n  - two');
    assert.deepStrictEqual(result, { items: ['one', 'two'] });
  });

  it('parses array of objects', () => {
    const yaml = `items:
  - id: 1
    name: first
  - id: 2
    name: second`;
    const result = parseYaml(yaml);
    assert.deepStrictEqual(result.items.length, 2);
    assert.deepStrictEqual(result.items[0].id, 1);
  });

  it('handles inline arrays', () => {
    const result = parseYaml('tags: ["a", "b", "c"]');
    assert.deepStrictEqual(result, { tags: ['a', 'b', 'c'] });
  });

  it('stringifies back to YAML', () => {
    const obj = { key: 'value', arr: ['a', 'b'], nested: { child: 1 } };
    const yaml = stringifyYaml(obj);
    const parsed = parseYaml(yaml);
    assert.deepStrictEqual(parsed, obj);
  });
});
