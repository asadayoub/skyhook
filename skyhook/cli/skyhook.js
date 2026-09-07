#!/usr/bin/env node

/**
 * Skyhook CLI - Universal Project Intelligence for AI Agents
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createSkyhookContext } from '../lib/context.js';
import * as backlogHandlers from '../lib/handlers/backlog.js';
import * as adrHandlers from '../lib/handlers/adr.js';
import { cmdSync, cmdTrace, cmdImpact, cmdUntraced, cmdCoverage, cmdMapLegacy, cmdGraph } from '../lib/handlers/sync.js';
import * as generalHandlers from '../lib/handlers/general.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple logger
function log(level, message) {
  const colors = {
    info: '\x1b[36m', // cyan
    success: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    reset: '\x1b[0m'
  };
  const color = colors[level] || colors.info;
  const prefix = level === 'info' ? 'ℹ' : level === 'success' ? '✓' : level === 'warn' ? '⚠' : '✖';
  console.log(`${color}${prefix} ${message}${colors.reset}`);
}

// Format output elegantly
function formatResult(result) {
  if (result.error) {
    log('error', result.error);
    return;
  }
  
  if (result.message) {
    log('success', result.message);
  }
  
  if (result.table) {
    console.table(result.table);
  }
  
  // Pretty print raw output if needed
  if (!result.message && !result.table && Object.keys(result).length > 0) {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const parsedArgs = { _: [] };
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        parsedArgs[key] = nextArg;
        i++;
      } else {
        parsedArgs[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      parsedArgs[key] = true;
    } else {
      parsedArgs._.push(arg);
    }
  }
  
  const handlers = {
    ...backlogHandlers,
    ...adrHandlers,
    cmdSync,
    cmdTrace,
    cmdImpact,
    cmdUntraced,
    cmdCoverage,
    cmdMapLegacy,
    cmdGraph,
    ...generalHandlers
  };

  // Map terminal command names to handler function names
  const commandMap = {
    init: 'cmdInit',
    setup: 'cmdSetup',
    discover: 'cmdDiscover',
    question: 'cmdQuestion',
    plan: 'cmdPlan',
    standards: 'cmdStandards',
    decide: 'cmdDecide',
    sync: 'cmdSync',
    trace: 'cmdTrace',
    impact: 'cmdImpact',
    untraced: 'cmdUntraced',
    coverage: 'cmdCoverage',
    mapLegacy: 'cmdMapLegacy',
    graph: 'cmdGraph',
    version: 'cmdVersion',
    install: 'cmdInstall',
    profile: 'cmdProfile',
    help: 'cmdHelp',
    dashboard: 'cmdDashboard'
  };

  const handlerName = commandMap[command];
  if (!handlerName || !handlers[handlerName]) {
    log('error', `Unknown command: ${command}`);
    process.exit(1);
  }

  // Handle 'init' gracefully without requiring existing .skyhook dir
  let ctx = null;
  if (command !== 'init' && command !== 'version' && command !== 'help' && command !== 'setup' && command !== 'install') {
    ctx = createSkyhookContext(process.cwd());
    if (!ctx) {
      log('error', 'Not a Skyhook project. Run `skyhook init` first.');
      process.exit(1);
    }
  } else if (command === 'init' || command === 'setup') {
    // For init and setup, we pass a temporary context or allow creation inside the handler
    ctx = { skyhookDir: path.join(process.cwd(), '.skyhook') };
  }

  // Remap some positional args
  if (command === 'decide' && parsedArgs._.length > 0) {
    parsedArgs.title = parsedArgs._.join(' ');
  }
  
  try {
    const result = await handlers[handlerName](ctx, parsedArgs);
    if (result) {
      formatResult(result);
    }
  } catch (error) {
    log('error', error.message);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
