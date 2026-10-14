import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { SkyhookServer } from '../lib/server/SkyhookServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

describe('TASK-C07: Offline Air-Gapped Dashboard Assets Tests', () => {
  const vendorScriptPath = path.join(repoRoot, 'skyhook', 'dashboard', 'public', 'vendor', 'mermaid.min.js');
  const indexHtmlPath = path.join(repoRoot, 'skyhook', 'dashboard', 'public', 'index.html');
  const manifestPath = path.join(repoRoot, 'skyhook', 'dashboard', 'public', 'ide', 'ExtensionManifest.json');

  it('vendored mermaid.min.js exists locally and is non-empty', () => {
    assert.ok(fs.existsSync(vendorScriptPath), 'mermaid.min.js must exist in public/vendor/');
    const stat = fs.statSync(vendorScriptPath);
    assert.ok(stat.size > 500 * 1024, `mermaid.min.js size should be substantial (>500KB), got ${stat.size} bytes`);
  });

  it('index.html references local /vendor/mermaid.min.js and contains zero remote CDNs', () => {
    assert.ok(fs.existsSync(indexHtmlPath), 'index.html must exist');
    const content = fs.readFileSync(indexHtmlPath, 'utf-8');

    assert.ok(
      content.includes('<script src="/vendor/mermaid.min.js"></script>'),
      'index.html must load /vendor/mermaid.min.js'
    );
    assert.ok(!content.includes('cdn.jsdelivr.net'), 'index.html must not reference cdn.jsdelivr.net');
    assert.ok(!content.includes('unpkg.com'), 'index.html must not reference unpkg.com');
    assert.ok(!content.includes('cdnjs.cloudflare.com'), 'index.html must not reference cdnjs');
  });

  it('ExtensionManifest.json contains zero remote CDNs in contentSecurityPolicy', () => {
    assert.ok(fs.existsSync(manifestPath), 'ExtensionManifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const scriptSrc = manifest.contentSecurityPolicy?.scriptSrc || [];

    for (const src of scriptSrc) {
      assert.ok(!src.includes('cdn.jsdelivr.net'), `scriptSrc must not include cdn.jsdelivr.net: ${src}`);
      assert.ok(!src.includes('unpkg.com'), `scriptSrc must not include unpkg.com: ${src}`);
    }
  });

  it('SkyhookServer serves /vendor/mermaid.min.js with 200 OK and javascript MIME type', async () => {
    const server = new SkyhookServer({
      workspaceDir: repoRoot
    });

    const mockReq = {
      method: 'GET',
      url: '/vendor/mermaid.min.js',
      headers: { host: 'localhost:31415' }
    };

    let statusCode = null;
    const headers = {};
    let responseBody = '';

    const mockRes = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      writeHead(code, h = {}) {
        statusCode = code;
        Object.entries(h).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
      },
      end(data) {
        if (data) responseBody = data.toString();
      }
    };

    await server.handleHttpRequest(mockReq, mockRes);

    assert.strictEqual(statusCode, 200);
    assert.ok(
      headers['content-type'].includes('application/javascript'),
      `Content-Type must be application/javascript, got: ${headers['content-type']}`
    );
    assert.ok(responseBody.length > 500 * 1024, 'Served body must be complete vendored library');
    assert.ok(responseBody.includes('mermaid'), 'Served script must define mermaid');
  });
});
