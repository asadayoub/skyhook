import test from 'node:test';
import assert from 'node:assert';
import { parseADRMarkdown, computeContentHash } from '../lib/adr/ADRMarkdownParser.js';

test('parseADRMarkdown parses basic headers and metadata', () => {
  const md = `# Decision: Adopt Fastify for HTTP Services

**ID**: 01HX89ZABCDEF
**Status**: accepted
**Category**: technology
**Date**: 2026-09-08T12:00:00Z
**Author**: Antigravity AI

## Context

Express is getting sluggish under high concurrent load.

## Decision

We will migrate all core services from Express to Fastify.

## Consequences

### Positive
- 3x throughput improvement
- Low overhead JSON schema validation

### Negative
- Team needs to learn Fastify plugin architecture
- Migration effort for existing Express middleware

### Neutral / Risks
- Fastify ecosystem is smaller than Express

## Alternatives Considered

| Alternative | Description | Pros | Cons |
|-------------|-------------|------|------|
| Express | Current framework | Familiar; huge ecosystem | Slower; dated middleware model |
| Koa | Lightweight Express successor | Async/await native | Less active community |

## Related Requirements

- **REQ-002**: High Performance API (active)

## Validation Criteria

- [ ] Fastify benchmarks pass
- [ ] Authentication middleware ported
`;

  const parsed = parseADRMarkdown(md);

  assert.strictEqual(parsed.id, '01HX89ZABCDEF');
  assert.strictEqual(parsed.title, 'Adopt Fastify for HTTP Services');
  assert.strictEqual(parsed.status, 'accepted');
  assert.strictEqual(parsed.category, 'technology');
  assert.strictEqual(parsed.author, 'Antigravity AI');
  assert.ok(parsed.context.includes('Express is getting sluggish'));
  assert.ok(parsed.decision.includes('migrate all core services'));

  // Consequences
  assert.strictEqual(parsed.consequences.positive.length, 2);
  assert.ok(parsed.consequences.positive[0].includes('3x throughput'));
  assert.strictEqual(parsed.consequences.negative.length, 2);
  assert.strictEqual(parsed.consequences.neutral.length, 1);

  // Alternatives
  assert.strictEqual(parsed.alternatives.length, 2);
  assert.strictEqual(parsed.alternatives[0].name, 'Express');
  assert.strictEqual(parsed.alternatives[1].name, 'Koa');

  // Related Requirements
  assert.deepStrictEqual(parsed.relatedRequirements, ['REQ-002']);

  // Validation Criteria
  assert.strictEqual(parsed.validationCriteria.length, 2);

  // Hash
  assert.ok(parsed.contentHash);
  assert.strictEqual(parsed.contentHash, computeContentHash(md));
});

test('parseADRMarkdown extracts Mermaid diagrams and enforcement rules', () => {
  const md = `# Decision: Mandate Repository Pattern

**ID**: ADR-005
**Status**: accepted

## Decision
All database queries must go through repository layer.

\`\`\`mermaid
flowchart LR
  Controller --> Repository --> Database
\`\`\`

\`\`\`yaml:enforcement
{
  "rules": [
    {
      "prohibitedImports": ["@prisma/client"],
      "exceptIn": ["src/repositories/**"]
    }
  ]
}
\`\`\`
`;

  const parsed = parseADRMarkdown(md);

  assert.strictEqual(parsed.id, 'ADR-005');
  assert.strictEqual(parsed.status, 'accepted');
  assert.strictEqual(parsed.diagrams.length, 1);
  assert.ok(parsed.diagrams[0].includes('Controller --> Repository'));

  assert.ok(parsed.enforcement);
  assert.ok(parsed.enforcement.rules);
  assert.strictEqual(parsed.enforcement.rules[0].prohibitedImports[0], '@prisma/client');
});
