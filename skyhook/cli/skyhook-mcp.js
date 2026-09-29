#!/usr/bin/env node

/**
 * skyhook-mcp - 100% Offline Model Context Protocol (MCP) Server CLI
 */

import path from 'path';
import { MCPServer } from '../lib/harness/mcp/MCPServer.js';
import { StdioTransport } from '../lib/harness/mcp/StdioTransport.js';
import { SSETransport } from '../lib/harness/mcp/SSETransport.js';

const args = process.argv.slice(2);

function printHelp() {
  process.stderr.write(`Skyhook MCP Server - 100% Offline MCP Provider for AI Agents

Usage:
  skyhook-mcp [options]

Options:
  --stdio            Run via standard I/O (default, for Cursor, Claude Desktop, Windsurf)
  --sse              Run local SSE HTTP server (127.0.0.1)
  --port <port>      Port for SSE server (default: 3000)
  --host <host>      Host for SSE server (default: 127.0.0.1)
  --dir <path>       Target project directory (default: current working directory)
  -h, --help         Show this help message
`);
}

if (args.includes('-h') || args.includes('--help')) {
  printHelp();
  process.exit(0);
}

let mode = 'stdio';
let port = 3000;
let host = '127.0.0.1';
let projectDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--sse') {
    mode = 'sse';
  } else if (arg === '--stdio') {
    mode = 'stdio';
  } else if (arg === '--port' && i + 1 < args.length) {
    port = parseInt(args[++i], 10) || 3000;
  } else if (arg === '--host' && i + 1 < args.length) {
    host = args[++i];
  } else if (arg === '--dir' && i + 1 < args.length) {
    projectDir = path.resolve(args[++i]);
  }
}

const server = new MCPServer({ projectDir });

if (mode === 'sse') {
  const transport = new SSETransport(server, { port, host });
  transport.start().then(({ url }) => {
    process.stderr.write(`[skyhook-mcp] Offline SSE Server listening on ${url}\n`);
  }).catch((err) => {
    process.stderr.write(`[skyhook-mcp] Failed to start SSE server: ${err.message}\n`);
    process.exit(1);
  });

  const cleanup = async () => {
    await transport.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
} else {
  const transport = new StdioTransport(server);
  transport.listen();

  process.on('SIGINT', () => {
    transport.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    transport.close();
    process.exit(0);
  });
}
