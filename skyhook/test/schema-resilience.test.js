import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readYamlSafe, writeYaml } from '../lib/utils.js';
import { validateBacklog } from '../lib/schema.js';
import { createSkyhookContext } from '../lib/context.js';

describe('TASK-C06: Schema Validation & Corruption-Proof Safe Storage Tests', () => {
  it('readYamlSafe returns default or null when file does not exist', () => {
    const missing = path.join(os.tmpdir(), `nonexistent-${Date.now()}.yaml`);
    assert.strictEqual(readYamlSafe(missing), null);
    assert.deepStrictEqual(readYamlSafe(missing, { defaultIfMissing: { ok: true } }), { ok: true });
  });

  it('readYamlSafe creates a rescue backup file and throws when YAML is corrupt', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-corrupt-'));
    try {
      const corruptFile = path.join(tmpDir, 'epics.yaml');
      const badContent = 'epics:\n  - id: EPIC-1\n    title: Broken YAML\n  invalid: [unclosed array\n';
      fs.writeFileSync(corruptFile, badContent, 'utf-8');

      assert.throws(
        () => readYamlSafe(corruptFile),
        (err) => {
          return err.name === 'DataCorruptionError' && err.message.includes('Malformed YAML');
        }
      );

      // Verify backup file was created
      const files = fs.readdirSync(tmpDir);
      const backupFile = files.find(f => f.includes('corrupt') && f.endsWith('.bak'));
      assert.ok(backupFile, 'Rescue backup file must be created');

      const backupContent = fs.readFileSync(path.join(tmpDir, backupFile), 'utf-8');
      assert.strictEqual(backupContent, badContent, 'Backup must preserve exact original content');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writeYaml writes atomically to disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-write-'));
    try {
      const target = path.join(tmpDir, 'test.yaml');
      const data = { title: 'Test', count: 42, items: ['a', 'b'] };

      writeYaml(target, data);
      assert.ok(fs.existsSync(target), 'Target file must exist');

      const readBack = readYamlSafe(target);
      assert.deepStrictEqual(readBack, data);

      // Verify no temporary files linger in directory
      const files = fs.readdirSync(tmpDir);
      assert.deepStrictEqual(files, ['test.yaml']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('validateBacklog enforces item IDs and titles on epics, stories, and tasks', () => {
    // Valid backlog passes
    const valid = {
      epics: [{ id: 'EPIC-1', title: 'Epic One' }],
      stories: [{ id: 'STORY-1', epicId: 'EPIC-1', title: 'Story One', status: 'ready' }],
      tasks: [{ id: 'TASK-1', storyId: 'STORY-1', title: 'Task One', status: 'ready' }]
    };
    const validated = validateBacklog(valid);
    assert.strictEqual(validated.epics.length, 1);
    assert.strictEqual(validated.stories.length, 1);
    assert.strictEqual(validated.tasks.length, 1);

    // Missing task ID throws
    assert.throws(() => {
      validateBacklog({
        epics: [],
        stories: [],
        tasks: [{ title: 'No ID task' }]
      });
    }, /Schema Validation Error:.*id/);

    // Missing story title throws
    assert.throws(() => {
      validateBacklog({
        epics: [],
        stories: [{ id: 'STORY-2' }],
        tasks: []
      });
    }, /Schema Validation Error:.*title/);
  });

  it('validateBacklog rejects invalid status enums', () => {
    assert.throws(() => {
      validateBacklog({
        epics: [],
        stories: [{ id: 'STORY-1', title: 'Valid Story', status: 'flying_to_mars' }],
        tasks: []
      });
    }, /Schema Validation Error:.*status/);

    assert.throws(() => {
      validateBacklog({
        epics: [],
        stories: [],
        tasks: [{ id: 'TASK-1', title: 'Valid Task', status: 'almost_done' }]
      });
    }, /Schema Validation Error:.*status/);
  });

  it('SkyhookContext.readBacklog throws and preserves backup on corrupt epics.yaml', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-ctx-corrupt-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      const backlogDir = path.join(skyhookDir, 'backlog');
      fs.mkdirSync(backlogDir, { recursive: true });
      fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), 'name: Test\n');

      const epicsFile = path.join(backlogDir, 'epics.yaml');
      fs.writeFileSync(epicsFile, 'epics:\n  - id: [broken yaml indentation\n');

      const ctx = createSkyhookContext(tmpDir);
      assert.throws(() => {
        ctx.readBacklog();
      }, /DataCorruptionError/);

      const backups = fs.readdirSync(backlogDir).filter(f => f.includes('corrupt') && f.endsWith('.bak'));
      assert.ok(backups.length > 0, 'Must create backup file in backlog directory');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

