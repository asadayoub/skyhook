/**
 * Harness Handlers - CLI commands for Agent Harness detection, injection, status, removal, and MCP
 * 100% offline, zero external telemetry.
 */

import path from 'path';
import { AgentDetector } from '../harness/AgentDetector.js';
import { HarnessInjector } from '../harness/HarnessInjector.js';
import { MCPServer } from '../harness/mcp/MCPServer.js';
import { StdioTransport } from '../harness/mcp/StdioTransport.js';
import { SSETransport } from '../harness/mcp/SSETransport.js';

export async function cmdHarnessDetect(ctx, args = {}) {
  const projectDir = ctx.projectDir || process.cwd();
  const detector = new AgentDetector();
  const scan = await detector.scan(projectDir, args);

  if (args.json) {
    return scan;
  }

  const table = [
    ...scan.detectedAgents.map(a => ({
      Agent: a.name,
      Vendor: a.vendor,
      Detected: '✓ Yes',
      Reason: a.reasons.join('; ')
    })),
    ...scan.undetectedAgents.map(u => ({
      Agent: u.name,
      Vendor: u.vendor,
      Detected: 'No',
      Reason: 'No config or rule signature found'
    }))
  ];

  return {
    message: `Scanned workspace: ${scan.detectedCount} of ${scan.totalRegistered} agents detected.`,
    table,
    detectedCount: scan.detectedCount,
    totalRegistered: scan.totalRegistered
  };
}

export async function cmdHarnessInject(ctx, args = {}) {
  const projectDir = ctx.projectDir || process.cwd();
  const injector = new HarnessInjector();

  let targets = 'auto';
  if (args.all) {
    targets = 'all';
  } else if (args.target) {
    targets = args.target.split(',').map(s => s.trim());
  }

  const dryRun = !!(args['dry-run'] || args.dryRun);
  const force = !!args.force;

  const result = await injector.inject(projectDir, {
    targets,
    dryRun,
    force
  });

  if (args.json) {
    return result;
  }

  if (result.injected.length === 0) {
    return {
      message: result.message || 'No agents were injected.',
      skipped: result.skipped
    };
  }

  const table = [];
  for (const item of result.injected) {
    const files = item.modifiedFiles || item.plannedFiles || [];
    table.push({
      Agent: item.name,
      Vendor: item.vendor,
      Status: dryRun ? 'Planned' : 'Injected',
      Files: files.map(f => path.relative(projectDir, f) || f).join(', ')
    });
  }

  const prefix = dryRun ? '[Dry Run] Planned harness injection' : 'Successfully injected agent harness configuration';
  return {
    message: `${prefix} for ${result.injected.length} agent(s).`,
    table,
    injected: result.injected,
    skipped: result.skipped
  };
}

export async function cmdHarnessStatus(ctx, args = {}) {
  const projectDir = ctx.projectDir || process.cwd();
  const injector = new HarnessInjector();
  const statusReport = await injector.status(projectDir);

  if (args.json) {
    return statusReport;
  }

  const table = statusReport.harnesses.map(h => ({
    Agent: h.name,
    Vendor: h.vendor,
    Status: h.status === 'injected' ? '✓ Injected' : h.status === 'partial' ? '⚠ Partial' : 'Not Injected',
    Details: JSON.stringify(h.details)
  }));

  return {
    message: `Agent Harness Status: ${statusReport.injectedCount} of ${statusReport.totalCount} active.`,
    table,
    injectedCount: statusReport.injectedCount,
    totalCount: statusReport.totalCount
  };
}

export async function cmdHarnessRemove(ctx, args = {}) {
  const projectDir = ctx.projectDir || process.cwd();
  const injector = new HarnessInjector();

  let targets = 'all';
  if (args.target) {
    targets = args.target.split(',').map(s => s.trim());
  }

  const result = await injector.remove(projectDir, { targets });

  if (args.json) {
    return result;
  }

  const table = result.removed.map(r => ({
    Agent: r.name,
    RemovedFiles: r.removedFiles.map(f => path.relative(projectDir, f) || f).join(', ') || 'None',
    RestoredFiles: r.restoredFiles.map(f => path.relative(projectDir, f) || f).join(', ') || 'None'
  }));

  return {
    message: `Successfully removed Skyhook configurations for ${result.removed.length} agent(s).`,
    table,
    removed: result.removed
  };
}

export async function cmdStartMCP(ctx, args = {}) {
  const projectDir = ctx.projectDir || process.cwd();
  const server = new MCPServer({ projectDir, context: ctx });

  if (args.sse) {
    const port = parseInt(args.port, 10) || 3000;
    const host = args.host || '127.0.0.1';
    const transport = new SSETransport(server, { port, host });
    const { url } = await transport.start();
    console.error(`[skyhook] Offline MCP SSE Server listening on ${url}`);
    return new Promise(() => {}); // keep alive
  }

  const transport = new StdioTransport(server);
  transport.listen();
  return new Promise(() => {}); // keep alive
}
