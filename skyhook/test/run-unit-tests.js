#!/usr/bin/env node

/**
 * Skyhook Offline Unit Test Runner
 *
 * Runs all offline FSM, AST, ADR, Tracer, Plan, and Dashboard unit test suites
 * in full sandbox isolation without requiring network binds or filesystem watcher background loops.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = __dirname;

const INTEGRATION_TESTS = new Set([
  'server-websocket.test.js',
  'server-rpc.test.js',
  'server-crud-extended.test.js',
  'adr-server-api.test.js',
  'adr-watcher.test.js',
  'dashboard-api.test.js',
  'dashboard-harness.test.js',
  'dark-matter.test.js',
  'mcp-server.test.js'
]);

const unitTestFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js') && !INTEGRATION_TESTS.has(f))
  .map(f => path.join('skyhook/test', f));

const args = ['--test', '--test-timeout=30000', ...unitTestFiles];
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code || 0);
  }
});

