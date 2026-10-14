import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

describe('TASK-C03: Open-Source Legal & Documentation Hygiene Tests', () => {
  it('root LICENSE file must exist with valid MIT terms and copyright', () => {
    const licensePath = path.join(repoRoot, 'LICENSE');
    assert.ok(fs.existsSync(licensePath), 'Root LICENSE file must exist');
    const content = fs.readFileSync(licensePath, 'utf-8');
    assert.ok(content.includes('MIT License'), 'LICENSE must specify MIT License');
    assert.ok(content.includes('Asad Ayoub'), 'LICENSE must credit Asad Ayoub');
    assert.ok(content.includes('2026'), 'LICENSE must include copyright year');
  });

  it('root TESTING.md file must exist and document test execution commands', () => {
    const testingPath = path.join(repoRoot, 'TESTING.md');
    assert.ok(fs.existsSync(testingPath), 'Root TESTING.md must exist');
    const content = fs.readFileSync(testingPath, 'utf-8');
    assert.ok(content.includes('npm test'), 'TESTING.md must document npm test');
    assert.ok(content.includes('test:unit'), 'TESTING.md must document unit test script');
    assert.ok(content.includes('test:integration'), 'TESTING.md must document integration test script');
  });

  it('README.md badges must link to root files and reflect accurate telemetry', () => {
    const readmePath = path.join(repoRoot, 'README.md');
    assert.ok(fs.existsSync(readmePath), 'README.md must exist');
    const readme = fs.readFileSync(readmePath, 'utf-8');

    // Badge links
    assert.ok(readme.includes('](LICENSE)'), 'README.md must link to LICENSE');
    assert.ok(readme.includes('](TESTING.md)'), 'README.md must link to TESTING.md');

    // Passing tests badge
    assert.ok(readme.match(/tests-3\d{2}%20passing/), 'README.md badge must report 350+ tests passing');

    // Mission Control documentation
    assert.ok(readme.includes('Mission Control') || readme.includes('mission-control'), 'README.md should document Mission Control');
  });
});

