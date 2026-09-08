import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRWatcher } from '../lib/adr/ADRWatcher.js';
import { writeYaml } from '../lib/utils.js';

test('ADRWatcher starts, watches records directory, and stops cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-watcher-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const recordsDir = path.join(skyhookDir, 'decisions', 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  writeYaml(path.join(skyhookDir, 'decisions', 'index.yaml'), {
    schemaVersion: '1.0.0',
    decisions: []
  });

  const watcher = new ADRWatcher(skyhookDir, { debounceMs: 50 });

  try {
    const startRes = watcher.start({ skyhookDir });
    assert.strictEqual(startRes.watching, true);
    assert.strictEqual(startRes.directory, recordsDir);

    const stopRes = watcher.stop();
    assert.strictEqual(stopRes.watching, false);
  } finally {
    watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADRWatcher triggers onChange callback when markdown file is modified', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-watcher-event-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  const recordsDir = path.join(skyhookDir, 'decisions', 'records');
  fs.mkdirSync(recordsDir, { recursive: true });

  writeYaml(path.join(skyhookDir, 'decisions', 'index.yaml'), {
    schemaVersion: '1.0.0',
    decisions: [
      { id: 'ADR-001', title: 'Test Decision', status: 'proposed' }
    ]
  });

  const mdFile = path.join(recordsDir, 'ADR-001.md');
  fs.writeFileSync(mdFile, '# Decision: Test Decision\n\n**ID**: ADR-001\n**Status**: proposed\n', 'utf-8');

  let eventFired = false;
  let receivedFilename = null;

  const watcher = new ADRWatcher(skyhookDir, {
    debounceMs: 50,
    onChange: ({ filename }) => {
      eventFired = true;
      receivedFilename = filename;
    }
  });

  try {
    watcher.start({ skyhookDir });

    // Modify file
    fs.writeFileSync(mdFile, '# Decision: Test Decision\n\n**ID**: ADR-001\n**Status**: accepted\n', 'utf-8');

    // Wait 150ms for debounce
    await new Promise(resolve => setTimeout(resolve, 150));

    assert.strictEqual(eventFired, true);
    assert.strictEqual(receivedFilename, 'ADR-001.md');
  } finally {
    watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
