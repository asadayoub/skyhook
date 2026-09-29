import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BaseParser } from '../lib/parsers/BaseParser.js';
import { ParserRegistry } from '../lib/parsers/ParserRegistry.js';
import { JavaScriptParser } from '../lib/parsers/JavaScriptParser.js';
import { PythonParser } from '../lib/parsers/PythonParser.js';
import { RegexFallbackParser } from '../lib/parsers/RegexFallbackParser.js';
import { parseFile, getParserStatus } from '../lib/parsers/index.js';

test('ParserRegistry: registers, prioritizes, and routes parsers', async () => {
  // 1. Built-in registration check
  const js = ParserRegistry.getParser('javascript');
  assert.ok(js instanceof JavaScriptParser);
  assert.ok(js.getSupportedExtensions().includes('.js'));
  assert.ok(js.getSupportedExtensions().includes('.ts'));

  const py = ParserRegistry.getParser('python');
  assert.ok(py instanceof PythonParser);
  assert.ok(py.getSupportedExtensions().includes('.py'));

  // 2. Routing by extension
  const matchedJs = ParserRegistry.getParserForFile('src/auth.ts');
  assert.strictEqual(matchedJs.id, 'javascript');

  const matchedPy = ParserRegistry.getParserForFile('backend/main.py');
  assert.strictEqual(matchedPy.id, 'python');

  // 3. Fallback for unknown extension
  const matchedUnknown = ParserRegistry.getParserForFile('data.txt');
  assert.strictEqual(matchedUnknown.id, 'fallback');

  // 4. Diagnostic status
  const status = getParserStatus();
  assert.strictEqual(status.javascript.loaded, true);
  assert.strictEqual(status.python.loaded, true);
  assert.strictEqual(status.go.loaded, true);
  assert.strictEqual(status.rust.loaded, true);
  assert.strictEqual(status.java.loaded, true);
});

test('ParserRegistry: dynamically loads custom workspace extensions', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-custom-parser-'));
  const extDir = path.join(tmpDir, '.skyhook', 'extensions', 'parsers');
  fs.mkdirSync(extDir, { recursive: true });

  try {
    // Author a custom Solidity parser plugin in the workspace
    const customParserCode = `
      import { BaseParser } from '${path.resolve('skyhook/lib/parsers/BaseParser.js')}';
      export default class SolidityParser extends BaseParser {
        get id() { return 'solidity'; }
        get name() { return 'Solidity Smart Contract Parser'; }
        getSupportedExtensions() { return ['.sol']; }
        async parse(fullPath, projectDir) {
          return [
            this.createSymbol({
              file: 'contracts/Token.sol',
              symbolName: 'TokenContract',
              symbolType: 'class',
              line: 1,
              requirementId: 'REQ-ETH-1'
            })
          ];
        }
      }
    `;

    fs.writeFileSync(path.join(extDir, 'SolidityParser.js'), customParserCode);

    // Create a mock solidity file
    const solFile = path.join(tmpDir, 'Token.sol');
    fs.writeFileSync(solFile, 'contract TokenContract {}');

    // Parse file via parseFile which triggers loadWorkspaceExtensions
    const symbols = await parseFile(solFile, tmpDir);
    assert.strictEqual(symbols.length, 1);
    assert.strictEqual(symbols[0].symbolName, 'TokenContract');
    assert.strictEqual(symbols[0].requirementId, 'REQ-ETH-1');
    assert.strictEqual(symbols[0].traced, true);

    const loadedParser = ParserRegistry.getParser('solidity');
    assert.ok(loadedParser);
    assert.strictEqual(loadedParser.name, 'Solidity Smart Contract Parser');

    // Clean up registry
    ParserRegistry.unregister('solidity');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
