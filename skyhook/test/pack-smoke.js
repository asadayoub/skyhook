#!/usr/bin/env node

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf-8', ...options });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}\n${detail}`);
  }
  return result;
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-pack-smoke-'));
const packDir = path.join(workspace, 'pack');
const installDir = path.join(workspace, 'install');
const projectDir = path.join(workspace, 'project');

try {
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: rootDir, encoding: 'utf-8' });
  const [{ filename }] = JSON.parse(packOutput);
  const tarballPath = path.join(packDir, filename);

  run('npm', ['init', '-y'], { cwd: installDir });
  run('npm', ['install', '--no-audit', '--no-fund', tarballPath], { cwd: installDir });

  const binDir = path.join(installDir, 'node_modules', '.bin');
  const skyhookBin = path.join(binDir, 'skyhook');
  const skyhookCmdBin = path.join(binDir, 'skyhook-cmd');
  const skyhookMcpBin = path.join(binDir, 'skyhook-mcp');
  const mergeDriverBin = path.join(binDir, 'skyhook-merge-driver');

  assert.ok(fs.existsSync(skyhookBin), 'skyhook binary must be installed');
  assert.ok(fs.existsSync(skyhookCmdBin), 'skyhook-cmd binary must be installed');
  assert.ok(fs.existsSync(skyhookMcpBin), 'skyhook-mcp binary must be installed');
  assert.ok(fs.existsSync(mergeDriverBin), 'skyhook-merge-driver binary must be installed');

  run(skyhookBin, ['version'], { cwd: installDir });
  run(skyhookBin, ['--help'], { cwd: installDir });
  run(skyhookMcpBin, ['--help'], { cwd: installDir });

  run(skyhookBin, ['init', '--name=Pack Smoke', '--profile=web-app'], { cwd: projectDir });
  assert.ok(fs.existsSync(path.join(projectDir, '.skyhook')), 'skyhook init should create .skyhook directory');

  const cmdResult = run(skyhookCmdBin, [], {
    cwd: projectDir,
    input: JSON.stringify({ command: 'listCurrentFeatures', args: {} }) + '\n'
  });
  assert.strictEqual(cmdResult.status, 0, 'skyhook-cmd should process stdio JSON commands');

  const mergeResult = spawnSync(mergeDriverBin, [], { encoding: 'utf-8' });
  assert.strictEqual(mergeResult.status, 1, 'skyhook-merge-driver should fail without required args');
  assert.ok((mergeResult.stderr || '').includes('Usage: skyhook-merge-driver'), 'merge driver should print usage without args');

  console.log('Pack smoke test passed.');
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
