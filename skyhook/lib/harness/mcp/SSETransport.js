/**
 * SSETransport - Server-Sent Events (SSE) Transport for Skyhook MCP Server
 * Runs a 100% offline, local HTTP loopback server (127.0.0.1).
 * Complies with MCP SSE transport specification.
 */

import http from 'http';
import { randomUUID } from 'crypto';

export class SSETransport {
  /**
   * @param {import('./MCPServer.js').MCPServer} server
   * @param {Object} [options]
   * @param {number} [options.port=3000]
   * @param {string} [options.host='127.0.0.1']
   */
  constructor(server, options = {}) {
    this.server = server;
    this.port = options.port || 3000;
    this.host = options.host || '127.0.0.1';
    this.httpServer = null;
    this.sessions = new Map(); // sessionId -> { res, createdAt }
  }

  /**
   * Start listening for HTTP SSE connections
   * @param {number} [port]
   * @param {string} [host]
   * @returns {Promise<{ port: number, host: string, url: string }>}
   */
  start(port = this.port, host = this.host) {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.httpServer.on('error', (err) => {
        reject(err);
      });

      this.httpServer.listen(port, host, () => {
        const addr = this.httpServer.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        const actualHost = typeof addr === 'object' && addr ? addr.address : host;
        resolve({
          port: actualPort,
          host: actualHost,
          url: `http://${actualHost}:${actualPort}/sse`
        });
      });
    });
  }

  /**
   * HTTP request router
   */
  async handleHttpRequest(req, res) {
    // Add local CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    // 1. GET /sse - Initiate SSE connection
    if (req.method === 'GET' && pathname === '/sse') {
      const sessionId = randomUUID();

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      this.sessions.set(sessionId, { res, createdAt: Date.now() });

      req.on('close', () => {
        this.sessions.delete(sessionId);
      });

      // Send the endpoint event with post message path as per MCP specification
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
      return;
    }

    // 2. POST /messages - Send JSON-RPC message
    if (req.method === 'POST' && (pathname === '/messages' || pathname === '/message')) {
      const sessionId = parsedUrl.searchParams.get('sessionId');
      const session = sessionId ? this.sessions.get(sessionId) : null;

      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });

      req.on('end', async () => {
        let jsonReq;
        try {
          jsonReq = JSON.parse(body);
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: `Parse error: ${err.message}` }
          }));
          return;
        }

        try {
          const response = await this.server.handleRequest(jsonReq);

          // If session exists, broadcast/send response through SSE
          if (session && response) {
            session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'accepted' }));
          } else if (response) {
            // Direct POST fallback
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } else {
            res.writeHead(204);
            res.end();
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: jsonReq.id || null,
            error: { code: -32603, message: err.message }
          }));
        }
      });
      return;
    }

    // 404 for other endpoints
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  /**
   * Stop HTTP server and close all SSE sessions
   */
  close() {
    return new Promise((resolve) => {
      for (const [id, session] of this.sessions) {
        try {
          session.res.end();
        } catch (_) {}
      }
      this.sessions.clear();

      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
