import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRPolicyCompiler } from '../lib/adr/ADRPolicyCompiler.js';
import { readYaml, writeYaml } from '../lib/utils.js';

function setupMockADRWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-compiler-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const decisionsDir = path.join(skyhookDir, 'decisions');
  const recordsDir = path.join(decisionsDir, 'records');

  fs.mkdirSync(recordsDir, { recursive: true });

  const initialIndex = {
    schemaVersion: '1.0.0',
    decisions: [
      {
        id: 'ADR-001',
        title: 'Legacy REST Policy',
        status: 'superseded',
        supersededBy: 'ADR-002'
      },
      {
        id: 'ADR-002',
        title: 'Adopt GraphQL & Fastify',
        status: 'accepted'
      },
      {
        id: 'ADR-003',
        title: 'Text-Only Architecture Rules',
        status: 'accepted'
      }
    ]
  };

  writeYaml(path.join(decisionsDir, 'index.yaml'), initialIndex);

  const adr1Md = `# Decision: Legacy REST Policy

**ID**: ADR-001
**Status**: superseded
**Category**: api

## Context
Legacy REST guidelines.

## Decision
Disallow GraphQL.

\`\`\`json:enforcement
{
  "rules": [
    {
      "ruleType": "prohibited-import",
      "prohibitedImports": ["graphql"],
      "violationMessage": "Do not use GraphQL."
    }
  ]
}
\`\`\`
`;

  const adr2Md = `# Decision: Adopt GraphQL & Fastify

**ID**: ADR-002
**Status**: accepted
**Category**: api

## Context
High client roundtrips.

## Decision
Adopt GraphQL and Fastify.

\`\`\`json:enforcement
{
  "rules": [
    {
      "ruleType": "prohibited-import",
      "prohibitedImports": ["express", "axios"],
      "violationMessage": "Use Fastify and native fetch instead."
    },
    {
      "ruleType": "boundary-violation",
      "forbiddenInDir": "src/routes",
      "forbiddenImports": ["src/db"],
      "violationMessage": "Routes cannot directly import db layer."
    }
  ]
}
\`\`\`
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-001.md'), adr1Md, 'utf-8');
  fs.writeFileSync(path.join(recordsDir, 'ADR-002.md'), adr2Md, 'utf-8');

  // Markdown for ADR-003 with natural language heuristic
  const adr3Md = `# Decision: Text-Only Architecture Rules

**ID**: ADR-003
**Status**: accepted
**Category**: architecture

## Context
Standardizing utilities.

## Decision
Adopt date-fns. Never import moment into application services.
Controllers must not import database directly.
`;

  fs.writeFileSync(path.join(recordsDir, 'ADR-003.md'), adr3Md, 'utf-8');

  return { tmpDir, skyhookDir, decisionsDir, recordsDir };
}

test('ADRPolicyCompiler extracts heuristic rules from plain text', () => {
  const { tmpDir, skyhookDir } = setupMockADRWorkspace();

  try {
    const compiler = new ADRPolicyCompiler(skyhookDir, tmpDir);
    const text = 'Never import moment into project.\nControllers must not import database directly.';
    const heuristics = compiler.extractHeuristicRules(text, 'ADR-999');

    assert.strictEqual(heuristics.length, 2);
    assert.strictEqual(heuristics[0].ruleType, 'prohibited-import');
    assert.strictEqual(heuristics[0].prohibitedImports[0], 'moment');
    assert.strictEqual(heuristics[1].ruleType, 'boundary-violation');
    assert.strictEqual(heuristics[1].forbiddenInDir, 'Controllers');
    assert.strictEqual(heuristics[1].forbiddenImports[0], 'database');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRPolicyCompiler compiles active policies and excludes superseded rules', () => {
  const { tmpDir, skyhookDir } = setupMockADRWorkspace();

  try {
    const compiler = new ADRPolicyCompiler(skyhookDir, tmpDir);
    const result = compiler.compile();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.deactivatedCount, 1); // ADR-001 is superseded
    assert.strictEqual(result.acceptedCount, 2); // ADR-002 and ADR-003

    // Verify boundaries.yaml
    const boundaries = readYaml(result.boundariesPath);
    assert.strictEqual(boundaries.activePolicies.some(p => p.adrId === 'ADR-001'), false); // superseded excluded!
    assert.strictEqual(boundaries.activePolicies.some(p => p.adrId === 'ADR-002'), true);
    assert.strictEqual(boundaries.activePolicies.some(p => p.adrId === 'ADR-003'), true);
    assert.strictEqual(boundaries.deactivatedPolicies.some(p => p.id === 'ADR-001'), true);

    // Verify eslint config
    const eslintRules = JSON.parse(fs.readFileSync(result.eslintPath, 'utf-8'));
    const paths = eslintRules.rules['no-restricted-imports'][1].paths;
    const pathNames = paths.map(p => p.name);
    assert.ok(pathNames.includes('express'));
    assert.ok(pathNames.includes('axios'));
    assert.ok(pathNames.includes('moment'));
    assert.ok(!pathNames.includes('graphql')); // GraphQL restriction was in superseded ADR-001!

    // Verify CI gate config
    const ciGate = JSON.parse(fs.readFileSync(result.ciGatePath, 'utf-8'));
    assert.strictEqual(ciGate.failOnViolations, true);
    assert.ok(ciGate.rulesCount >= 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
