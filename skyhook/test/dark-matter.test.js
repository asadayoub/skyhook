import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DarkMatterAnalyzer } from '../lib/tracer/DarkMatterAnalyzer.js';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';
import { cmdInit } from '../lib/handlers/general.js';

test('DarkMatterAnalyzer: computes exact coverage, risk tiers, and language distributions', () => {
  const symbols = [
    { file: 'src/auth/jwt.js', symbolName: 'signToken', symbolType: 'function', line: 10, traced: true, requirementId: 'REQ-AUTH-1', metadata: { language: 'javascript' } },
    { file: 'src/auth/jwt.js', symbolName: 'verifyToken', symbolType: 'function', line: 20, traced: false, metadata: { language: 'javascript' } },
    { file: 'backend/api.py', symbolName: 'login_route', symbolType: 'function', line: 15, traced: true, requirementId: 'REQ-AUTH-2', metadata: { language: 'python' } },
    { file: 'backend/api.py', symbolName: 'logout_route', symbolType: 'function', line: 30, traced: false, metadata: { language: 'python' } },
    { file: 'backend/api.py', symbolName: 'refresh_route', symbolType: 'function', line: 45, traced: false, metadata: { language: 'python' } },
    { file: 'engine/core.go', symbolName: 'RunCore', symbolType: 'function', line: 12, traced: true, requirementId: 'REQ-CORE-1', metadata: { language: 'go' } }
  ];

  const analysis = DarkMatterAnalyzer.analyze(symbols);

  // Summary
  assert.strictEqual(analysis.summary.totalSymbols, 6);
  assert.strictEqual(analysis.summary.tracedSymbols, 3);
  assert.strictEqual(analysis.summary.untracedSymbols, 3);
  assert.strictEqual(analysis.summary.overallCoverage, 50);

  // Language breakdown
  const jsLang = analysis.languages.find(l => l.language === 'javascript');
  assert.ok(jsLang);
  assert.strictEqual(jsLang.total, 2);
  assert.strictEqual(jsLang.traced, 1);
  assert.strictEqual(jsLang.coverage, 50);

  const pyLang = analysis.languages.find(l => l.language === 'python');
  assert.ok(pyLang);
  assert.strictEqual(pyLang.total, 3);
  assert.strictEqual(pyLang.traced, 1);
  assert.strictEqual(pyLang.coverage, 33);

  const goLang = analysis.languages.find(l => l.language === 'go');
  assert.ok(goLang);
  assert.strictEqual(goLang.total, 1);
  assert.strictEqual(goLang.traced, 1);
  assert.strictEqual(goLang.coverage, 100);

  // Files & Risk
  assert.strictEqual(analysis.files.length, 3);
  const pyFile = analysis.files.find(f => f.file === 'backend/api.py');
  assert.ok(pyFile);
  assert.strictEqual(pyFile.untraced, 2);
  assert.strictEqual(pyFile.risk, 'moderate');

  // Directory hierarchy
  assert.ok(analysis.directories.length > 0);
  const backendDir = analysis.directories.find(d => d.directory === 'backend');
  assert.ok(backendDir);
  assert.strictEqual(backendDir.total, 3);
});

test('SkyhookServer: serves GET /api/dark-matter', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-server-dm-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Dark Matter Test' });

    // Create sample python and js files in workspace
    fs.writeFileSync(path.join(tmpDir, 'main.py'), '# @skyhook-implements REQ-PY\ndef main(): pass\ndef untraced(): pass\n');
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'function tracedJs() {} // @skyhook-implements REQ-JS\nfunction darkJs() {}\n');

    const server = new SkyhookServer({ port: 31580, workspaceDir: tmpDir });
    const { port, url } = await server.start();

    const res = await fetch(`${url}/api/dark-matter`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.ok(data.summary);
    assert.ok(data.summary.totalSymbols >= 2);
    assert.ok(Array.isArray(data.languages));
    assert.ok(Array.isArray(data.files));

    await server.stop();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
