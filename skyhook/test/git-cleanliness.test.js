import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

describe('TASK-C04: Git Repository Boundary & Cleanliness Tests', () => {
  it('obsolete scratch file refactor.js must NOT exist in repository root', () => {
    const refactorScriptPath = path.join(repoRoot, 'refactor.js');
    assert.strictEqual(
      fs.existsSync(refactorScriptPath),
      false,
      'Obsolete scratch migration script refactor.js should be deleted'
    );
  });

  it('.gitignore must contain comprehensive suppression patterns', () => {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');
    const content = fs.readFileSync(gitignorePath, 'utf-8');

    const expectedPatterns = [
      'node_modules',
      '.DS_Store',
      'Thumbs.db',
      'coverage',
      '.env'
    ];

    for (const pattern of expectedPatterns) {
      assert.ok(
        content.includes(pattern),
        `.gitignore must include pattern: ${pattern}`
      );
    }
  });

  it('no .DS_Store files should linger in skyhook directory', () => {
    function findDsStore(dir) {
      const results = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name === '.DS_Store') {
          results.push(fullPath);
        } else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          results.push(...findDsStore(fullPath));
        }
      }
      return results;
    }

    const dsStores = findDsStore(path.join(repoRoot, 'skyhook'));
    assert.strictEqual(
      dsStores.length,
      0,
      `Found untracked .DS_Store files: ${dsStores.join(', ')}`
    );
  });
});

