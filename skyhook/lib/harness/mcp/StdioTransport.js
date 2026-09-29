/**
 * StdioTransport - Standard I/O Transport for Skyhook MCP Server
 * Reads newline-delimited JSON-RPC from process.stdin and writes to process.stdout.
 * Redirects console.log to stderr while active so that stdout remains unpolluted.
 */

import readline from 'readline';

export class StdioTransport {
  /**
   * @param {import('./MCPServer.js').MCPServer} server
   * @param {Object} [options]
   * @param {NodeJS.ReadableStream} [options.stdin]
   * @param {NodeJS.WritableStream} [options.stdout]
   * @param {NodeJS.WritableStream} [options.stderr]
   */
  constructor(server, options = {}) {
    this.server = server;
    this.stdin = options.stdin || process.stdin;
    this.stdout = options.stdout || process.stdout;
    this.stderr = options.stderr || process.stderr;

    this.rl = null;
    this.originalConsoleLog = null;
    this.originalConsoleInfo = null;
    this.originalConsoleDebug = null;
    this.isRunning = false;
  }

  /**
   * Start listening on stdin
   */
  listen() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Redirect console.log, info, debug to stderr to avoid corrupting JSON-RPC on stdout
    this.originalConsoleLog = console.log;
    this.originalConsoleInfo = console.info;
    this.originalConsoleDebug = console.debug;

    console.log = (...args) => this.stderr.write(args.map(String).join(' ') + '\n');
    console.info = (...args) => this.stderr.write(args.map(String).join(' ') + '\n');
    console.debug = (...args) => this.stderr.write(args.map(String).join(' ') + '\n');

    this.rl = readline.createInterface({
      input: this.stdin,
      output: null,
      terminal: false
    });

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let req;
      try {
        req = JSON.parse(trimmed);
      } catch (err) {
        const parseError = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${err.message}`
          }
        };
        this.send(parseError);
        return;
      }

      try {
        const response = await this.server.handleRequest(req);
        if (response) {
          this.send(response);
        }
      } catch (err) {
        const internalError = {
          jsonrpc: '2.0',
          id: req && req.id !== undefined ? req.id : null,
          error: {
            code: -32603,
            message: `Internal error: ${err.message}`
          }
        };
        this.send(internalError);
      }
    });

    this.rl.on('close', () => {
      this.close();
    });
  }

  /**
   * Send JSON-RPC response object over stdout
   * @param {Object} message
   */
  send(message) {
    if (!this.stdout.writable) return;
    const json = JSON.stringify(message);
    this.stdout.write(json + '\n');
  }

  /**
   * Stop listening and restore console methods
   */
  close() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
      console.info = this.originalConsoleInfo;
      console.debug = this.originalConsoleDebug;
      this.originalConsoleLog = null;
      this.originalConsoleInfo = null;
      this.originalConsoleDebug = null;
    }
  }
}
