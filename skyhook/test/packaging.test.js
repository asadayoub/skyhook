import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');
const packageJsonPath = path.join(rootDir, 'package.json');

describe('TASK-C01: Distribution & Executable Packaging Tests', () => {
  it('should declare valid package metadata in package.json', () => {
    assert.ok(fs.existsSync(packageJsonPath), 'package.json must exist');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    assert.strictEqual(pkg.name, 'skyhook', 'Package name must be "skyhook" for zero-friction npx/npm execution');
    assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'Package version must follow SemVer');
    assert.strictEqual(pkg.type, 'module', 'Package must be ESM ("type": "module")');
    assert.ok(pkg.engines && pkg.engines.node, 'Package must specify engines.node');
    assert.ok(pkg.preferGlobal, 'Package should declare preferGlobal: true for CLI tools');
  });

  it('should define executable binaries that physically exist on disk', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    assert.ok(pkg.bin, 'package.json must have a "bin" map');

    const expectedBins = ['skyhook', 'skyhook-cmd', 'skyhook-mcp', 'skyhook-merge-driver'];
    for (const binName of expectedBins) {
      assert.ok(pkg.bin[binName], `Missing bin declaration for: ${binName}`);
      const binRelPath = pkg.bin[binName];
      const binAbsPath = path.resolve(rootDir, binRelPath);
      assert.ok(fs.existsSync(binAbsPath), `Declared bin target does not exist on disk: ${binAbsPath}`);
    }
  });

  it('should ensure all CLI binaries have a valid Node shebang on line 1', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    for (const [binName, binRelPath] of Object.entries(pkg.bin)) {
      const binAbsPath = path.resolve(rootDir, binRelPath);
      const content = fs.readFileSync(binAbsPath, 'utf-8');
      const firstLine = content.split('\n')[0].trim();
      assert.strictEqual(firstLine, '#!/usr/bin/env node', `${binName} (${binRelPath}) must have #!/usr/bin/env node shebang`);
    }
  });

  it('should successfully execute skyhook --help and print usage', () => {
    const cliPath = path.join(rootDir, 'skyhook/cli/skyhook.js');
    const stdout = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf-8' });
    assert.ok(stdout.includes('Skyhook') || stdout.includes('Usage') || stdout.includes('Universal Project Intelligence'), 'CLI --help output must contain Skyhook usage');
  });

  it('should successfully execute skyhook-cmd --help and print usage', () => {
    const cmdCliPath = path.join(rootDir, 'skyhook/cli/skyhook-cmd.js');
    const stdout = execFileSync(process.execPath, [cmdCliPath, '--help'], { encoding: 'utf-8' });
    assert.ok(stdout.includes('Skyhook') || stdout.includes('Usage') || stdout.includes('JSON'), 'skyhook-cmd --help must print usage information');
  });

  it('should successfully execute skyhook-mcp --help and print usage', () => {
    const mcpCliPath = path.join(rootDir, 'skyhook/cli/skyhook-mcp.js');
    let output = '';
    try {
      output = execFileSync(process.execPath, [mcpCliPath, '--help'], { encoding: 'utf-8' });
    } catch (err) {
      // In case printed to stderr
      output = (err.stdout || '') + (err.stderr || '');
    }
    assert.ok(output.includes('Skyhook MCP') || output.includes('Model Context Protocol'), 'skyhook-mcp --help must describe MCP server');
  });

  it('should safely enforce required arguments on skyhook-merge-driver', () => {
    const driverCliPath = path.join(rootDir, 'skyhook/cli/skyhook-merge-driver.js');
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [driverCliPath], { encoding: 'utf-8', stdio: 'pipe' });
    } catch (err) {
      exitCode = err.status;
      stderr = (err.stderr || '').toString();
    }
    assert.strictEqual(exitCode, 1, 'skyhook-merge-driver should exit with 1 when called without args');
    assert.ok(stderr.includes('Usage: skyhook-merge-driver'), 'skyhook-merge-driver should print usage on error');
  });
});

