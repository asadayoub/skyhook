import test from 'node:test';
import assert from 'node:assert';
import { parseYaml, stringifyYaml } from '../lib/yaml.js';

test('YAML Engine - Block Scalars (| and >) with Indentation and Blank Lines', () => {
  const yamlContent = `
title: Multi-line Test
literalBlock: |
  Line 1 of literal content.
  Line 2 has indentation and detail.

  Line 4 after an empty line.
foldedBlock: >
  This is a long paragraph that
  should be folded together
  into a single coherent line.
nested:
  doc: |
    Nested documentation line 1
    Nested documentation line 2
`;

  const parsed = parseYaml(yamlContent);
  assert.strictEqual(parsed.title, 'Multi-line Test');
  assert.strictEqual(
    parsed.literalBlock,
    'Line 1 of literal content.\nLine 2 has indentation and detail.\n\nLine 4 after an empty line.'
  );
  assert.strictEqual(
    parsed.foldedBlock,
    'This is a long paragraph that should be folded together into a single coherent line.'
  );
  assert.strictEqual(
    parsed.nested.doc,
    'Nested documentation line 1\nNested documentation line 2'
  );
});

test('YAML Engine - Inline Comments and Comment Lines Stripping', () => {
  const yamlContent = `
# Global File Header Comment
appName: skyhook-core # Core engine name
version: "1.0.0 # not a comment" # Real inline comment
port: 8080 # Default listening port
debug: true # Verbose logging
# Intermediate Section Comment
features:
  - fast-routing # Zero-overhead routing
  - "quoted # item" # Quoted comment preserved inside quotes
`;

  const parsed = parseYaml(yamlContent);
  assert.strictEqual(parsed.appName, 'skyhook-core');
  assert.strictEqual(parsed.version, '1.0.0 # not a comment');
  assert.strictEqual(parsed.port, 8080);
  assert.strictEqual(parsed.debug, true);
  assert.deepStrictEqual(parsed.features, ['fast-routing', 'quoted # item']);
});

test('YAML Engine - Scalar Type Fidelity & Quoted Strings Round-tripping', () => {
  const original = {
    boolTrue: true,
    boolFalse: false,
    boolStrTrue: 'true',
    boolStrFalse: 'false',
    nullVal: null,
    nullStr: 'null',
    intNum: 42,
    intStr: '42',
    floatNum: 3.14159,
    escapedQuotes: 'He said "Hello world" to everyone',
    specialChars: 'colon: here, bracket [ok], brace {yes}'
  };

  const stringified = stringifyYaml(original);
  assert.ok(!stringified.includes('[object Object]'));

  const parsed = parseYaml(stringified);

  assert.strictEqual(parsed.boolTrue, true);
  assert.strictEqual(parsed.boolFalse, false);
  assert.strictEqual(parsed.boolStrTrue, 'true');
  assert.strictEqual(parsed.boolStrFalse, 'false');
  assert.strictEqual(parsed.nullVal, null);
  assert.strictEqual(parsed.nullStr, 'null');
  assert.strictEqual(parsed.intNum, 42);
  assert.strictEqual(parsed.intStr, '42');
  assert.strictEqual(parsed.floatNum, 3.14159);
  assert.strictEqual(parsed.escapedQuotes, 'He said "Hello world" to everyone');
  assert.strictEqual(parsed.specialChars, 'colon: here, bracket [ok], brace {yes}');
});

test('YAML Engine - Deeply Nested Objects and Array of Objects Round-tripping', () => {
  const complexBacklog = {
    epics: [
      {
        id: 'EPIC-001',
        title: 'Authentication Infrastructure',
        stories: [
          {
            id: 'STORY-001',
            title: 'JWT Token Validation',
            status: 'in-progress',
            points: 5,
            lease: {
              agentId: 'agent-copilot-01',
              expiresAt: '2026-10-01T12:00:00.000Z'
            },
            tags: ['security', 'auth', 'tokens']
          },
          {
            id: 'STORY-002',
            title: 'OAuth2 GitHub Provider',
            status: 'todo',
            points: 8,
            lease: null,
            tags: ['oauth', 'github']
          }
        ]
      }
    ],
    metadata: {
      generatedBy: 'Skyhook Agile Engine',
      version: 2,
      active: true,
      config: {
        retries: 3,
        timeout: 5000,
        endpoints: ['https://auth.internal', 'https://backup.internal']
      }
    }
  };

  const yamlStr = stringifyYaml(complexBacklog);
  assert.ok(!yamlStr.includes('[object Object]'));

  const parsed = parseYaml(yamlStr);
  assert.strictEqual(parsed.epics.length, 1);
  assert.strictEqual(parsed.epics[0].id, 'EPIC-001');
  assert.strictEqual(parsed.epics[0].stories.length, 2);
  assert.strictEqual(parsed.epics[0].stories[0].lease.agentId, 'agent-copilot-01');
  assert.strictEqual(parsed.epics[0].stories[1].lease, null);
  assert.deepStrictEqual(parsed.epics[0].stories[0].tags, ['security', 'auth', 'tokens']);
  assert.strictEqual(parsed.metadata.config.retries, 3);
  assert.deepStrictEqual(parsed.metadata.config.endpoints, ['https://auth.internal', 'https://backup.internal']);
});
