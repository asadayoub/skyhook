import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DriftAutoFixer } from '../lib/drift/DriftAutoFixer.js';
import { DriftAggregator } from '../lib/drift/DriftAggregator.js';
import { readYaml } from '../lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'drift_autofix_test');

describe('DriftAutoFixer and DriftAggregator', () => {
  before(() => {
    const skyhookDir = path.join(FIXTURES_DIR, '.skyhook');
    fs.mkdirSync(path.join(skyhookDir, 'decisions', 'records'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'infrastructure'), { recursive: true });

    // Initial tech-stack.yaml
    fs.writeFileSync(path.join(skyhookDir, 'tech-stack.yaml'), `
schemaVersion: 1.0.0
technologies:
  - name: Node.js
    category: runtime
`);

    // Initial decisions/index.yaml
    fs.writeFileSync(path.join(skyhookDir, 'decisions', 'index.yaml'), `
schemaVersion: 1.0.0
decisions: []
`);

    // Controller directly importing infrastructure (layer violation)
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'controllers', 'orderController.js'), `
      import { RawDbConnection } from '../infrastructure/db.js';
      export class OrderController {
        async handle() {
          const db = new RawDbConnection();
          return db.execute();
        }
      }
    `);

    // Infrastructure file
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'infrastructure', 'db.js'), `
      export class RawDbConnection {
        execute() { return []; }
      }
    `);
  });

  after(() => {
    if (fs.existsSync(FIXTURES_DIR)) {
      fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  test('adoptDrift updates tech-stack.yaml without creating duplicates', () => {
    const ctx = {
      projectDir: FIXTURES_DIR,
      skyhookDir: path.join(FIXTURES_DIR, '.skyhook')
    };

    const res = DriftAutoFixer.adoptDrift(ctx, [
      { name: 'Redis', category: 'cache' },
      { name: 'Node.js', category: 'runtime' } // duplicate, should be skipped
    ]);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.adoptedCount, 1);
    assert.deepStrictEqual(res.adopted, ['Redis']);

    const updated = readYaml(path.join(ctx.skyhookDir, 'tech-stack.yaml'));
    const names = updated.technologies.map(t => t.name.toLowerCase());
    assert.ok(names.includes('redis'));
    assert.ok(names.includes('node.js'));
  });

  test('draftADRFromDrift synthesizes formal ADR draft and registers in index', () => {
    const ctx = {
      projectDir: FIXTURES_DIR,
      skyhookDir: path.join(FIXTURES_DIR, '.skyhook'),
      readTechStack: () => readYaml(path.join(FIXTURES_DIR, '.skyhook', 'tech-stack.yaml')),
      readProjectYaml: () => ({ name: 'Test App', profile: 'web-app' }),
      readDecisions: () => readYaml(path.join(FIXTURES_DIR, '.skyhook', 'decisions', 'index.yaml'))
    };

    const adrResult = DriftAutoFixer.draftADRFromDrift(ctx, {
      name: 'Redis',
      category: 'cache',
      reason: 'Detected redis caching client in backend services.'
    });

    assert.ok(adrResult.decisionId, 'Should return generated ADR ID');
    assert.strictEqual(adrResult.status, 'draft');
    assert.ok(fs.existsSync(adrResult.file), 'ADR markdown file should exist');

    const content = fs.readFileSync(adrResult.file, 'utf-8');
    assert.match(content, /Redis/);
    assert.match(content, /\*\*Status\*\*:\s*draft/i);

    const index = readYaml(path.join(ctx.skyhookDir, 'decisions', 'index.yaml'));
    assert.ok(index.decisions.some(d => d.id === adrResult.decisionId));
  });

  test('generateRemediationGuide formats structured advice for layer and circular violations', () => {
    const violations = [
      {
        type: 'LAYER_VIOLATION',
        file: 'src/controllers/orderController.js',
        to: 'src/infrastructure/db.js',
        message: 'Presentation layer must not import infrastructure layer directly.'
      },
      {
        type: 'CIRCULAR_DEPENDENCY',
        cycle: ['src/services/a.js', 'src/services/b.js', 'src/services/a.js'],
        message: 'Circular dependency cycle detected'
      }
    ];

    const guide = DriftAutoFixer.generateRemediationGuide(violations);
    assert.strictEqual(guide.tasksCount, 2);
    assert.match(guide.markdown, /Layer Decoupling/);
    assert.match(guide.markdown, /Break Dependency Loop/);
  });

  test('DriftAggregator executes full analysis, computes health score and aggregates findings', async () => {
    const ctx = {
      projectDir: FIXTURES_DIR,
      skyhookDir: path.join(FIXTURES_DIR, '.skyhook')
    };

    const aggregator = new DriftAggregator(ctx);
    const scorecard = await aggregator.analyze();

    assert.ok(typeof scorecard.healthScore === 'number');
    assert.ok(scorecard.healthScore < 100, 'Score should reflect the layer violation in orderController.js');
    assert.strictEqual(scorecard.pass, false, 'Critical layer violation should fail pass status');
    assert.ok(scorecard.criticalViolations.length > 0);
    assert.ok(scorecard.c4.mermaidContainer.startsWith('C4Container'));
    assert.ok(scorecard.remediation.tasksCount > 0);
  });
});
