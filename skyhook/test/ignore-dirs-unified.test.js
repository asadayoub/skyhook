import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ASTImportGraph } from '../lib/drift/ASTImportGraph.js';
import { SemanticRuleEngine } from '../lib/drift/SemanticRuleEngine.js';
import { ADRPolicyGuard } from '../lib/adr/ADRPolicyGuard.js';
import { indexCodebase } from '../lib/tracer.js';
import { DriftAggregator } from '../lib/drift/DriftAggregator.js';
import { loadProjectIgnoreRules } from '../lib/utils.js';

describe('Unified Ignore Rules across Drift, Dark Matter, and AST Scanners', () => {
  test('loadProjectIgnoreRules loads defaults, .gitignore, and .skyhook/project.yaml ignoreDirs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ignore-test-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      fs.mkdirSync(skyhookDir, { recursive: true });

      // Write .skyhook/project.yaml with ignoreDirs
      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), `
name: Python Project
id: py-proj
profile: python
ignoreDirs:
  - .uv-cache
  - custom_cache
  - special_folder/sub
  - ignored_file.py
`, 'utf8');

      // Write .gitignore
      fs.writeFileSync(path.join(tmpDir, '.gitignore'), `
tmp_build/
local_secrets.env
`, 'utf8');

      const filter = loadProjectIgnoreRules(tmpDir);

      // 1. Built-in defaults
      assert.strictEqual(filter.shouldIgnore('.venv'), true);
      assert.strictEqual(filter.shouldIgnore('node_modules'), true);
      assert.strictEqual(filter.shouldIgnore('.uv-cache'), true);

      // 2. Custom ignoreDirs from .skyhook/project.yaml
      assert.strictEqual(filter.shouldIgnore('custom_cache'), true);
      assert.strictEqual(filter.shouldIgnore('ignored_file.py'), true);
      assert.strictEqual(filter.shouldIgnore('sub', 'special_folder/sub'), true);
      assert.strictEqual(filter.shouldIgnore('__init__.py', '.uv-cache/archive-v0/Rgg10ESaoMMoRDtg/rich/_unicode_data/__init__.py'), true);

      // 3. From .gitignore
      assert.strictEqual(filter.shouldIgnore('tmp_build'), true);
      assert.strictEqual(filter.shouldIgnore('local_secrets.env'), true);

      // 4. Regular project files should NOT be ignored
      assert.strictEqual(filter.shouldIgnore('main.py', 'app/main.py'), false);
      assert.strictEqual(filter.shouldIgnore('service.py', 'services/service.py'), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('SemanticRuleEngine ignores .uv-cache and custom ignoreDirs from .skyhook/project.yaml', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sem-test-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      const appDir = path.join(tmpDir, 'src');
      const uvCacheDir = path.join(tmpDir, '.uv-cache', 'archive-v0', 'Rgg10ESaoMMoRDtg', 'rich', '_unicode_data');
      fs.mkdirSync(skyhookDir, { recursive: true });
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(uvCacheDir, { recursive: true });

      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), `
name: Python Project
id: py-proj
profile: python
ignoreDirs:
  - .uv-cache
`, 'utf8');

      // Valid project source file
      fs.writeFileSync(path.join(appDir, 'main.py'), `
def run():
    print("Clean code")
`, 'utf8');

      // File inside .uv-cache that would violate semantic rules if scanned
      fs.writeFileSync(path.join(uvCacheDir, '__init__.py'), `
import os
val = os.environ['SECRET_KEY']
print("Direct print violation")
`, 'utf8');

      const engine = new SemanticRuleEngine(tmpDir);
      const discovered = engine.discoverSourceFiles(tmpDir);

      assert.ok(discovered.includes('src/main.py'));
      assert.strictEqual(discovered.some(f => f.includes('.uv-cache')), false);

      const report = await engine.run();
      assert.strictEqual(report.violations.some(v => v.file && v.file.includes('.uv-cache')), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('ASTImportGraph ignores .uv-cache and does not construct nodes for cached libraries', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ast-test-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      const appDir = path.join(tmpDir, 'app');
      const uvCacheDir = path.join(tmpDir, '.uv-cache', 'archive-v0', 'rich');
      fs.mkdirSync(skyhookDir, { recursive: true });
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(uvCacheDir, { recursive: true });

      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), `
name: Python Project
id: py-proj
profile: python
ignoreDirs:
  - .uv-cache
`, 'utf8');

      fs.writeFileSync(path.join(appDir, 'app.py'), `
import os
print("App running")
`, 'utf8');

      // Circular dependencies inside .uv-cache
      fs.writeFileSync(path.join(uvCacheDir, 'a.py'), 'from . import b\n');
      fs.writeFileSync(path.join(uvCacheDir, 'b.py'), 'from . import a\n');

      const graph = new ASTImportGraph(tmpDir);
      await graph.build();

      const discovered = graph.discoverSourceFiles(tmpDir);
      const discoveredRel = discovered.map(p => path.relative(tmpDir, p).replace(/\\/g, '/'));

      assert.ok(discoveredRel.includes('app/app.py'));
      assert.strictEqual(discoveredRel.some(f => f.includes('.uv-cache')), false);

      // Verify no circular dependencies from .uv-cache are reported
      const cycles = graph.findCircularDependencies();
      assert.strictEqual(cycles.length, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('tracer indexCodebase (Dark Matter & Traceability) ignores .uv-cache and custom ignoreDirs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-tracer-test-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      const appDir = path.join(tmpDir, 'core');
      const uvCacheDir = path.join(tmpDir, '.uv-cache', 'archive-v0', 'rich');
      fs.mkdirSync(skyhookDir, { recursive: true });
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(uvCacheDir, { recursive: true });

      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), `
name: Python Project
id: py-proj
profile: python
ignoreDirs:
  - .uv-cache
`, 'utf8');

      fs.writeFileSync(path.join(appDir, 'logic.py'), `
class CoreLogic:
    def execute(self):
        pass
`, 'utf8');

      fs.writeFileSync(path.join(uvCacheDir, '__init__.py'), `
class CachedThirdParty:
    pass
`, 'utf8');

      const symbols = await indexCodebase(tmpDir);
      const symbolFiles = symbols.map(s => (s.file || '').replace(/\\/g, '/'));

      assert.ok(symbolFiles.some(f => f.includes('core/logic.py')));
      assert.strictEqual(symbolFiles.some(f => f.includes('.uv-cache')), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('ADRPolicyGuard ignores .uv-cache and custom ignoreDirs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-adr-test-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      const appDir = path.join(tmpDir, 'src');
      const uvCacheDir = path.join(tmpDir, '.uv-cache', 'pkg');
      fs.mkdirSync(skyhookDir, { recursive: true });
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(uvCacheDir, { recursive: true });

      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), `
name: Project
id: proj
ignoreDirs:
  - .uv-cache
`, 'utf8');

      fs.writeFileSync(path.join(appDir, 'index.ts'), 'export const x = 1;\n');
      fs.writeFileSync(path.join(uvCacheDir, 'cached.ts'), 'export const y = 2;\n');

      const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
      const files = guard.findSourceFiles(tmpDir);
      const relFiles = files.map(f => path.relative(tmpDir, f).replace(/\\/g, '/'));

      assert.ok(relFiles.includes('src/index.ts'));
      assert.strictEqual(relFiles.some(f => f.includes('.uv-cache')), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('DriftAggregator end-to-end: project with .uv-cache produces 0 drift violations for cached files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-drift-agg-test-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      const srcDir = path.join(tmpDir, 'src');
      const uvCacheDir = path.join(tmpDir, '.uv-cache', 'archive-v0', 'Rgg10ESaoMMoRDtg', 'rich', '_unicode_data');
      fs.mkdirSync(skyhookDir, { recursive: true });
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(uvCacheDir, { recursive: true });

      // User's exact project.yaml structure
      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), `
name: Python Financial Service
id: py-fin
profile: python
ignoreDirs:
  - .venv
  - venv
  - env
  - node_modules
  - .uv-cache
  - .pytest_cache
  - .mypy_cache
  - .ruff_cache
  - dist
  - build
  - coverage
`, 'utf8');

      fs.writeFileSync(path.join(skyhookDir, 'tech-stack.yaml'), `
technologies:
  - name: Python
    category: Language
`, 'utf8');

      // Valid project code
      fs.writeFileSync(path.join(srcDir, 'app.py'), `
def calculate():
    return 42
`, 'utf8');

      // The exact file mentioned in user query that caused drift detection:
      // .uv-cache/archive-v0/Rgg10ESaoMMoRDtg/rich/_unicode_data/__init__.py
      fs.writeFileSync(path.join(uvCacheDir, '__init__.py'), `
import os
print("Third party code with print")
key = os.environ.get("SOME_KEY")
`, 'utf8');

      const ctx = {
        projectDir: tmpDir,
        skyhookDir,
        readTechStack: () => ({ technologies: [{ name: 'Python' }] })
      };

      const aggregator = new DriftAggregator(ctx);
      const scorecard = await aggregator.analyze();

      // Check all violations across critical and warnings
      const allViolations = [...scorecard.criticalViolations, ...scorecard.warnings];
      const uvViolations = allViolations.filter(v => (v.file && v.file.includes('.uv-cache')) || (v.message && v.message.includes('.uv-cache')));

      assert.strictEqual(uvViolations.length, 0, `Expected 0 violations from .uv-cache, found: ${JSON.stringify(uvViolations)}`);
      assert.strictEqual(scorecard.summary.nodesCount, 1); // Only src/app.py
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
