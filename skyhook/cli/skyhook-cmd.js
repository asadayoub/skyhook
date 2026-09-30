#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import Context and Handlers
import { SkyhookContext } from '../lib/context.js';
import * as backlogHandlers from '../lib/handlers/backlog.js';
import * as adrHandlers from '../lib/handlers/adr.js';
import * as hookHandlers from '../lib/handlers/hook.js';
import * as harnessHandlers from '../lib/handlers/harness.js';
import { cmdSync, cmdDrift, cmdTrace, cmdImpact, cmdUntraced, cmdCoverage, cmdMapLegacy, cmdGraph } from '../lib/handlers/sync.js';
import * as generalHandlers from '../lib/handlers/general.js';

// Combine all handlers into a single routing map
const handlers = {
  ...backlogHandlers,
  ...adrHandlers,
  ...hookHandlers,
  ...harnessHandlers,
  cmdSync,
  cmdDrift,
  cmdTrace,
  cmdImpact,
  cmdUntraced,
  cmdCoverage,
  cmdMapLegacy,
  cmdGraph,
  ...generalHandlers
};

// Also map protocol command names to function names
const commandMap = {
  init: 'cmdInit',
  setup: 'cmdSetup',
  discover: 'cmdDiscover',
  question: 'cmdQuestion',
  plan: 'cmdPlan',
  standards: 'cmdStandards',
  standardsList: 'cmdStandards',
  'standards-list': 'cmdStandards',
  standardsView: 'cmdStandards',
  'standards-view': 'cmdStandards',
  standardsNew: 'cmdStandards',
  'standards-new': 'cmdStandards',
  standardsPull: 'cmdStandards',
  'standards-pull': 'cmdStandards',
  standardsVerify: 'cmdStandards',
  'standards-verify': 'cmdStandards',
  decide: 'cmdRecordDecision',
  recordDecision: 'cmdRecordDecision',
  sync: 'cmdSync',
  drift: 'cmdDrift',
  boundaries: 'cmdDrift',
  version: 'cmdVersion',
  install: 'cmdInstall',
  profile: 'cmdProfile',
  batchCreate: 'cmdBatchCreate',
  listCurrentFeatures: 'cmdListCurrentFeatures',
  getFeature: 'cmdGetFeature',
  getNextTask: 'cmdGetNextTask',
  getBlockers: 'cmdGetBlockers',
  updateStatus: 'cmdUpdateStatus',
  getContext: 'cmdGetContext',
  addFeature: 'cmdAddFeature',
  trace: 'cmdTrace',
  impact: 'cmdImpact',
  untraced: 'cmdUntraced',
  coverage: 'cmdCoverage',
  mapLegacy: 'cmdMapLegacy',
  graph: 'cmdGraph',
  dashboard: 'cmdDashboard',
  syncAdr: 'cmdSyncADR',
  'sync-adr': 'cmdSyncADR',
  verifyAdr: 'cmdVerifyADR',
  'verify-adr': 'cmdVerifyADR',
  draftAdr: 'cmdDraftADR',
  'draft-adr': 'cmdDraftADR',
  watchAdr: 'cmdWatchADR',
  'watch-adr': 'cmdWatchADR',
  bootstrapAdr: 'cmdBootstrapADR',
  'bootstrap-adr': 'cmdBootstrapADR',
  reviewAdr: 'cmdReviewADR',
  'review-adr': 'cmdReviewADR',
  supersedeAdr: 'cmdSupersedeADR',
  'supersede-adr': 'cmdSupersedeADR',
  dagAdr: 'cmdADRDAG',
  'dag-adr': 'cmdADRDAG',
  compileAdr: 'cmdCompilePolicies',
  'compile-adr': 'cmdCompilePolicies',
  interceptAdr: 'cmdInterceptADR',
  'intercept-adr': 'cmdInterceptADR',
  backlogEvents: 'cmdBacklogEvents',
  'backlog-events': 'cmdBacklogEvents',
  releaseLease: 'cmdReleaseLease',
  'release-lease': 'cmdReleaseLease',
  backlogReplay: 'cmdBacklogReplay',
  'backlog-replay': 'cmdBacklogReplay',
  hookInstall: 'cmdHookInstall',
  'hook-install': 'cmdHookInstall',
  hookUninstall: 'cmdHookUninstall',
  'hook-uninstall': 'cmdHookUninstall',
  hookStatus: 'cmdHookStatus',
  'hook-status': 'cmdHookStatus',
  harnessInject: 'cmdHarnessInject',
  'harness-inject': 'cmdHarnessInject',
  harnessDetect: 'cmdHarnessDetect',
  'harness-detect': 'cmdHarnessDetect',
  harnessStatus: 'cmdHarnessStatus',
  'harness-status': 'cmdHarnessStatus',
  harnessRemove: 'cmdHarnessRemove',
  'harness-remove': 'cmdHarnessRemove',
  mcp: 'cmdStartMCP',
  help: 'cmdHelp',
  '--help': 'cmdHelp',
  '-h': 'cmdHelp',
  version: 'cmdVersion',
  '--version': 'cmdVersion',
  '-v': 'cmdVersion'
};

async function main() {
  const args = process.argv.slice(2);
  let payload = null;
  
  if (args.length > 0 && !args[0].startsWith('{') && !args[0].startsWith('[')) {
    // CLI execution mode
    const command = args[0];
    const funcName = commandMap[command];
    
    if (!funcName || !handlers[funcName]) {
      console.error(`Error: Unknown command '${command}'`);
      process.exit(1);
    }
    
    try {
      const ctx = new SkyhookContext(process.cwd());
      const result = await handlers[funcName](ctx, args.slice(1));
      
      if (typeof result === 'string') {
        console.log(result);
      } else if (result !== undefined && result !== null) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    return;
  }
  
  // JSON Protocol Mode
  let input = '';
  process.stdin.setEncoding('utf8');
  
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  
  input = input.trim();
  if (!input) {
    console.error(JSON.stringify({ error: "No input provided. Expected JSON payload." }));
    process.exit(1);
  }
  
  try {
    payload = JSON.parse(input);
  } catch (e) {
    console.error(JSON.stringify({ error: "Invalid JSON provided: " + e.message }));
    process.exit(1);
  }
  
  const command = payload.command;
  if (!command) {
    console.error(JSON.stringify({ error: "Missing 'command' field in JSON payload." }));
    process.exit(1);
  }
  
  const funcName = commandMap[command];
  if (!funcName || !handlers[funcName]) {
    console.error(JSON.stringify({ error: `Unknown command '${command}'` }));
    process.exit(1);
  }
  
  try {
    const ctx = new SkyhookContext(payload.projectDir || payload.cwd || process.cwd());
    const result = await handlers[funcName](ctx, payload.args || {});
    
    if (result !== undefined) {
      if (typeof result === 'string') {
        console.log(JSON.stringify({ output: result }));
      } else {
        console.log(JSON.stringify(result));
      }
    } else {
      console.log(JSON.stringify({ success: true }));
    }
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
