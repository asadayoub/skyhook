import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRSynthesizer } from '../lib/adr/ADRSynthesizer.js';
import { cmdDraftADR } from '../lib/handlers/adr.js';
import { writeYaml } from '../lib/utils.js';

test('ADRSynthesizer drafts an ADR with Mermaid diagram and draft status', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-synth-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const recordsDir = path.join(skyhookDir, 'decisions', 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  const decisionsData = { decisions: [] };
  const indexPath = path.join(skyhookDir, 'decisions', 'index.yaml');
  writeYaml(indexPath, decisionsData);

  const mockCtx = {
    skyhookDir,
    readDecisions: () => decisionsData,
    readProjectYaml: () => ({ name: 'Test App', profile: 'web-app' }),
    readProfile: () => ({ id: 'web-app', name: 'Web App' }),
    readTechStack: () => ({ technologies: [] }),
    writeYaml: (p, data) => writeYaml(p, data)
  };

  try {
    const synthesizer = new ADRSynthesizer(mockCtx);
    const result = synthesizer.draftForShift({
      name: 'Fastify',
      category: 'technology',
      reason: 'Detected Fastify in package.json dependencies.'
    });

    assert.ok(result.decisionId);
    assert.strictEqual(result.status, 'draft');
    assert.ok(fs.existsSync(result.file));

    const content = fs.readFileSync(result.file, 'utf-8');
    assert.ok(content.includes('Adopt Fastify'));
    assert.ok(content.includes('```mermaid'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cmdDraftADR synthesizes a draft when given title and decision', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-synth-cmd-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const recordsDir = path.join(skyhookDir, 'decisions', 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  const mockCtx = {
    skyhookDir,
    readDecisions: () => ({ decisions: [] }),
    readProjectYaml: () => ({ name: 'Test App', profile: 'web-app' }),
    readProfile: () => ({ id: 'web-app', name: 'Web App' }),
    readTechStack: () => ({ technologies: [] }),
    writeYaml: (p, d) => writeYaml(p, d)
  };

  try {
    const res = await cmdDraftADR(mockCtx, {
      title: 'Adopt Tailwind CSS',
      decision: 'Use Tailwind utility-first styling.',
      context: 'Streamline UI development.'
    });

    assert.ok(!res.error);
    assert.strictEqual(res.status, 'draft');
    assert.ok(res.file);
    assert.ok(fs.existsSync(res.file));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
