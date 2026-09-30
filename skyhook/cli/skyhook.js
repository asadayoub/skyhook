#!/usr/bin/env node

/**
 * Skyhook CLI - Universal Project Intelligence for AI Agents
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createSkyhookContext } from '../lib/context.js';
import * as backlogHandlers from '../lib/handlers/backlog.js';
import * as adrHandlers from '../lib/handlers/adr.js';
import * as hookHandlers from '../lib/handlers/hook.js';
import * as harnessHandlers from '../lib/handlers/harness.js';
import { cmdSync, cmdTrace, cmdImpact, cmdUntraced, cmdCoverage, cmdMapLegacy, cmdGraph, cmdDrift } from '../lib/handlers/sync.js';
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
function formatResult(result, args = {}) {
  if (result.error) {
    log('error', result.error);
    return;
  }

  if (args.json || args.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  if (result.chart) {
    console.log(result.chart);
    return;
  }

  if (result.message) {
    log('success', result.message);
  }
  
  if (result.path) {
    log('info', `Plan location: ${result.path}`);
  }

  if (result.forecast) {
    log('info', `Delivery Forecast: P50 -> ${result.forecast.projectedCompletionDateP50} | P90 -> ${result.forecast.projectedCompletionDateP90}`);
  }

  if (result.scopedPlans) {
    log('info', `Scoped plans compiled: ${result.scopedPlans.requirementsCount} requirements, ${result.scopedPlans.epicsCount} epics.`);
  }

  if (result.summary && result.darkMatter) {
    log('info', `AST Code Coverage: ${result.summary.overallCoverage}% (${result.summary.tracedSymbols}/${result.summary.totalSymbols} symbols traced)`);
    log('info', `Dark Matter (Untraced): ${result.summary.untracedSymbols} symbols across ${result.darkMatter.length} files`);
    if (result.darkMatter.length > 0) {
      console.table(result.darkMatter.slice(0, 15));
    }
    return;
  }

  if (result.requirementId && result.codeReferences) {
    log('info', `Requirement: ${result.requirementId} (${result.codeReferences.length} code references)`);
    if (result.codeReferences.length > 0) {
      console.table(result.codeReferences.map(c => ({
        file: c.file,
        symbol: c.symbolName,
        type: c.symbolType,
        line: c.line
      })));
    }
    if (result.lineage && result.lineage.length > 0) {
      log('warn', `Suggested Lineage / Refactored Recoveries:`);
      console.table(result.lineage);
    }
    return;
  }

  if (result.table) {
    console.table(result.table);
    return;
  }

  if (result.healthScore !== undefined || result.c4) {
    return;
  }
  
  // Pretty print raw output if needed
  if (!result.message && !result.table && !result.path && Object.keys(result).length > 0) {
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
    ...hookHandlers,
    ...harnessHandlers,
    cmdSync,
    cmdTrace,
    cmdImpact,
    cmdUntraced,
    cmdCoverage,
    cmdMapLegacy,
    cmdGraph,
    cmdDrift,
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
    drift: 'cmdDrift',
    boundaries: 'cmdDrift',
    trace: 'cmdTrace',
    impact: 'cmdImpact',
    untraced: 'cmdUntraced',
    coverage: 'cmdCoverage',
    'dark-matter': 'cmdCoverage',
    darkmatter: 'cmdCoverage',
    mapLegacy: 'cmdMapLegacy',
    graph: 'cmdGraph',
    version: 'cmdVersion',
    install: 'cmdInstall',
    profile: 'cmdProfile',
    help: 'cmdHelp',
    dashboard: 'cmdDashboard',
    'sync-adr': 'cmdSyncADR',
    'verify-adr': 'cmdVerifyADR',
    'draft-adr': 'cmdDraftADR',
    'watch-adr': 'cmdWatchADR',
    'bootstrap-adr': 'cmdBootstrapADR',
    'review-adr': 'cmdReviewADR',
    'supersede-adr': 'cmdSupersedeADR',
    'dag-adr': 'cmdADRDAG',
    'compile-adr': 'cmdCompilePolicies',
    'intercept-adr': 'cmdInterceptADR',
    'hook-install': 'cmdHookInstall',
    'hook-uninstall': 'cmdHookUninstall',
    'hook-status': 'cmdHookStatus',
    'backlog-events': 'cmdBacklogEvents',
    'backlog-release': 'cmdReleaseLease',
    'backlog-replay': 'cmdBacklogReplay',
    'get-next-task': 'cmdGetNextTask',
    'update-status': 'cmdUpdateStatus',
    'get-blockers': 'cmdGetBlockers',
    'list-features': 'cmdListCurrentFeatures',
    'add-feature': 'cmdAddFeature',
    harness: 'cmdHarnessStatus',
    'harness-inject': 'cmdHarnessInject',
    'harness-detect': 'cmdHarnessDetect',
    'harness-status': 'cmdHarnessStatus',
    'harness-remove': 'cmdHarnessRemove',
    mcp: 'cmdStartMCP'
  };

  // Support subcommands
  let effectiveCommand = command;
  if (command === 'adr') {
    const sub = parsedArgs._.shift() || 'help';
    if (sub === 'sync') effectiveCommand = 'sync-adr';
    else if (sub === 'verify' || sub === 'check') effectiveCommand = 'verify-adr';
    else if (sub === 'draft') effectiveCommand = 'draft-adr';
    else if (sub === 'watch') effectiveCommand = 'watch-adr';
    else if (sub === 'bootstrap') effectiveCommand = 'bootstrap-adr';
    else if (sub === 'review') effectiveCommand = 'review-adr';
    else if (sub === 'supersede') effectiveCommand = 'supersede-adr';
    else if (sub === 'dag') effectiveCommand = 'dag-adr';
    else if (sub === 'compile') effectiveCommand = 'compile-adr';
    else if (sub === 'intercept' || sub === 'scan') effectiveCommand = 'intercept-adr';
    else effectiveCommand = 'help';
  } else if (command === 'drift') {
    const sub = parsedArgs._.shift();
    if (sub === 'boundaries' || sub === 'boundary') parsedArgs.boundaries = true;
    else if (sub === 'c4') parsedArgs.c4 = true;
    else if (sub === 'semantic') parsedArgs.semantic = true;
    else if (sub === 'fix' || sub === 'adopt') parsedArgs.fix = true;
    else if (sub) parsedArgs._.unshift(sub);
    effectiveCommand = 'drift';
  } else if (command === 'boundaries') {
    parsedArgs.boundaries = true;
    effectiveCommand = 'drift';
  } else if (command === 'backlog') {
    const sub = parsedArgs._.shift() || 'list';
    if (sub === 'events') effectiveCommand = 'backlog-events';
    else if (sub === 'release') effectiveCommand = 'backlog-release';
    else if (sub === 'replay') effectiveCommand = 'backlog-replay';
    else if (sub === 'next') effectiveCommand = 'get-next-task';
    else if (sub === 'blockers') effectiveCommand = 'get-blockers';
    else if (sub === 'update') effectiveCommand = 'update-status';
    else effectiveCommand = 'list-features';
  } else if (command === 'watch') {
    effectiveCommand = 'watch-adr';
  } else if (command === 'bootstrap-adr') {
    effectiveCommand = 'bootstrap-adr';
  } else if (command === 'hook') {
    const sub = parsedArgs._.shift() || 'install';
    if (sub === 'install') effectiveCommand = 'hook-install';
    else if (sub === 'uninstall') effectiveCommand = 'hook-uninstall';
    else if (sub === 'status') effectiveCommand = 'hook-status';
    else effectiveCommand = 'hook-install';
  } else if (command === 'harness') {
    const sub = parsedArgs._.shift() || 'status';
    if (sub === 'inject' || sub === 'install') {
      effectiveCommand = 'harness-inject';
      if (parsedArgs._.length > 0 && !parsedArgs.target && !parsedArgs.agent) {
        parsedArgs.target = parsedArgs._.shift();
      }
    } else if (sub === 'detect' || sub === 'scan') {
      effectiveCommand = 'harness-detect';
    } else if (sub === 'remove' || sub === 'uninstall') {
      effectiveCommand = 'harness-remove';
      if (parsedArgs._.length > 0 && !parsedArgs.target && !parsedArgs.agent) {
        parsedArgs.target = parsedArgs._.shift();
      }
    } else if (sub === 'status' || sub === 'list') {
      effectiveCommand = 'harness-status';
    } else {
      parsedArgs.target = sub;
      effectiveCommand = 'harness-inject';
    }
  } else if (command === 'mcp') {
    effectiveCommand = 'mcp';
  } else if (command === 'dashboard') {
    const sub = parsedArgs._.shift() || 'start';
    parsedArgs.action = sub;
    effectiveCommand = 'dashboard';
  }

  const handlerName = commandMap[effectiveCommand];
  if (!handlerName || !handlers[handlerName]) {
    log('error', `Unknown command: ${command}`);
    process.exit(1);
  }

  // Handle commands that don't require pre-existing .skyhook directory
  let ctx = null;
  const noCtxCommands = ['init', 'version', 'help', 'setup', 'install', 'dashboard'];
  if (!noCtxCommands.includes(effectiveCommand)) {
    ctx = createSkyhookContext(process.cwd());
    if (!ctx) {
      log('error', 'Not a Skyhook project. Run `skyhook init` first.');
      process.exit(1);
    }
  } else if (effectiveCommand === 'dashboard') {
    ctx = createSkyhookContext(process.cwd()) || {
      projectDir: process.cwd(),
      skyhookDir: path.join(process.cwd(), '.skyhook')
    };
  } else if (effectiveCommand === 'init' || effectiveCommand === 'setup') {
    ctx = { skyhookDir: path.join(process.cwd(), '.skyhook') };
  }

  // Remap some positional args
  if (effectiveCommand === 'decide' && parsedArgs._.length > 0) {
    parsedArgs.title = parsedArgs._.join(' ');
  } else if ((effectiveCommand === 'trace' || effectiveCommand === 'impact') && parsedArgs._.length > 0) {
    parsedArgs.id = parsedArgs._[0];
  } else if (effectiveCommand === 'plan' && parsedArgs._.length > 0) {
    const first = parsedArgs._[0];
    if (first.startsWith('REQ-') || first.startsWith('req-')) {
      parsedArgs.req = first;
    } else if (first === 'all') {
      parsedArgs.all = true;
    } else if (first.startsWith('EPIC-') || first.startsWith('epic-') || first.length >= 20) {
      parsedArgs.epic = first;
    }
  } else if (effectiveCommand === 'review-adr' && parsedArgs._.length > 0) {
    parsedArgs.id = parsedArgs._[0];
  } else if (effectiveCommand === 'supersede-adr' && parsedArgs._.length >= 2) {
    parsedArgs.oldId = parsedArgs._[0];
    parsedArgs.newId = parsedArgs._[1];
  }
  
  try {
    const result = await handlers[handlerName](ctx, parsedArgs);
    if (result) {
      formatResult(result, parsedArgs);
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
