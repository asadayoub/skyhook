import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { indexCodebase } from '../lib/tracer.js';
import { SymbolCache } from '../lib/tracer/SymbolCache.js';

function setupCacheTestWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cache-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'auth.js'), `
export class AuthService {
  login(token) { return true; }
}
`);

  fs.writeFileSync(path.join(srcDir, 'billing.js'), `
export class BillingEngine {
  processInvoice(id) { return { status: 'paid' }; }
}
`);

  return { tmpDir, skyhookDir, srcDir };
}

test('TASK-F12: indexCodebase creates .skyhook/.cache/symbols.json on initial indexing', async () => {
  const { tmpDir, skyhookDir } = setupCacheTestWorkspace();

  try {
    const symbols = await indexCodebase(tmpDir);
    assert.strictEqual(symbols.length >= 2, true);

    const cachePath = path.join(skyhookDir, '.cache', 'symbols.json');
    assert.ok(fs.existsSync(cachePath), 'Cache file should be created');

    const cacheContent = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    assert.strictEqual(cacheContent.version, '1.0');
    assert.ok(cacheContent.files['src/auth.js']);
    assert.ok(cacheContent.files['src/billing.js']);
    assert.strictEqual(cacheContent.files['src/auth.js'].symbols.length >= 1, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F12: Second indexing run reuses cached symbols with 0 misses on unchanged files', async () => {
  const { tmpDir } = setupCacheTestWorkspace();

  try {
    // 1. Initial run to populate cache
    await indexCodebase(tmpDir);

    // 2. Direct SymbolCache inspection
    const cache = new SymbolCache(tmpDir);
    const loaded = cache.load();
    assert.strictEqual(loaded, true);

    const authStats = fs.statSync(path.join(tmpDir, 'src', 'auth.js'));
    const cachedAuth = cache.get('src/auth.js', authStats.mtimeMs, authStats.size);
    assert.ok(cachedAuth, 'Should hit cache for auth.js');
    assert.strictEqual(cache.hits, 1);
    assert.strictEqual(cache.misses, 0);

    // 3. Second run through indexCodebase
    const symbolsSecond = await indexCodebase(tmpDir);
    assert.strictEqual(symbolsSecond.length >= 2, true);
    assert.ok(symbolsSecond.some(s => s.symbolName === 'AuthService'));
    assert.ok(symbolsSecond.some(s => s.symbolName === 'BillingEngine'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F12: Modifying a source file re-indexes only the modified file and updates cache', async () => {
  const { tmpDir, skyhookDir, srcDir } = setupCacheTestWorkspace();

  try {
    await indexCodebase(tmpDir);

    // Small delay to ensure mtime changes
    const authPath = path.join(srcDir, 'auth.js');
    const now = new Date(Date.now() + 2000);
    fs.appendFileSync(authPath, '\nexport function logoutUser() { return true; }\n');
    fs.utimesSync(authPath, now, now);

    const symbolsAfterEdit = await indexCodebase(tmpDir);
    assert.ok(symbolsAfterEdit.some(s => s.symbolName === 'logoutUser'), 'Should discover newly added function');

    const cachePath = path.join(skyhookDir, '.cache', 'symbols.json');
    const cacheContent = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const authSymbols = cacheContent.files['src/auth.js'].symbols;
    assert.ok(authSymbols.some(s => s.symbolName === 'logoutUser'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F12: Deleting a source file prunes it from the disk cache', async () => {
  const { tmpDir, skyhookDir, srcDir } = setupCacheTestWorkspace();

  try {
    await indexCodebase(tmpDir);
    const cachePath = path.join(skyhookDir, '.cache', 'symbols.json');

    let cacheContent = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    assert.ok(cacheContent.files['src/billing.js']);

    // Delete billing.js
    fs.unlinkSync(path.join(srcDir, 'billing.js'));

    await indexCodebase(tmpDir);

    cacheContent = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    assert.strictEqual(cacheContent.files['src/billing.js'], undefined, 'billing.js should be pruned from cache');
    assert.ok(cacheContent.files['src/auth.js'], 'auth.js should remain in cache');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F12: noCache and reindex options bypass and refresh disk cache', async () => {
  const { tmpDir, skyhookDir } = setupCacheTestWorkspace();

  try {
    await indexCodebase(tmpDir);
    const cachePath = path.join(skyhookDir, '.cache', 'symbols.json');
    assert.ok(fs.existsSync(cachePath));

    // Force reindex with noCache: true
    const symbols = await indexCodebase(tmpDir, { noCache: true });
    assert.strictEqual(symbols.length >= 2, true);
    assert.ok(symbols.some(s => s.symbolName === 'AuthService'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

