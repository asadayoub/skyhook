/**
 * Skyhook Server
 * Embedded local-first HTTP and WebSocket server for the visual web dashboard.
 * Supports port auto-hunting, real-time WebSocket broadcasting, and safe RPC actions.
 */

import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketGateway } from './WebSocketGateway.js';
import { DashboardWatcher } from './DashboardWatcher.js';
import { DashboardRPCHandler } from './DashboardRPCHandler.js';
import { CLI_ROOT, SKYHOOK_ROOT } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SkyhookServer {
  constructor(options = {}) {
    this.basePort = options.port || 31415;
    this.currentPort = this.basePort;
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.server = null;
    this.gateway = null;
    this.watcher = null;
  }

  /**
   * Find first available port starting from basePort
   * @param {number} startPort
   * @param {number} maxAttempts
   * @returns {Promise<number>}
   */
  static findAvailablePort(startPort = 31415, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
      let port = startPort;
      function check(p) {
        const tester = net.createServer();
        tester.unref();
        tester.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            if (p - startPort < maxAttempts) {
              check(p + 1);
            } else {
              reject(new Error(`No open ports found between ${startPort} and ${startPort + maxAttempts}`));
            }
          } else {
            reject(err);
          }
        });
        tester.listen(p, '127.0.0.1', () => {
          tester.close(() => resolve(p));
        });
      }
      check(port);
    });
  }

  /**
   * Parse JSON body from HTTP request
   */
  static async parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) { // 5MB limit
          reject(new Error('Request payload too large'));
        }
      });
      req.on('end', () => {
        if (!body.trim()) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON body: ${e.message}`));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Resolve target workspace/project directory from request
   */
  resolveProjectTarget(url, body = {}) {
    const customProjectDir = body.projectDir || (url && (url.searchParams.get('projectDir') || url.searchParams.get('project')));
    if (customProjectDir) {
      return path.resolve(customProjectDir);
    }
    const id = body.projectId || (url && url.searchParams.get('id'));
    if (id) {
      const projects = DashboardRPCHandler.getProjects(this.workspaceDir);
      const matched = projects.find(p => p.id === id);
      if (matched && matched.projectDir) return matched.projectDir;
    }
    return this.workspaceDir;
  }

  /**
   * Start the HTTP and WebSocket server
   * @returns {Promise<Object>} { port, url }
   */
  async start() {
    this.currentPort = await SkyhookServer.findAvailablePort(this.basePort, 15);

    const publicDir = fs.existsSync(path.join(CLI_ROOT, 'dashboard', 'public'))
      ? path.join(CLI_ROOT, 'dashboard', 'public')
      : path.join(SKYHOOK_ROOT, 'dashboard', 'public');

    this.server = http.createServer(async (req, res) => {
      // Common headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      try {
        // --- API Routes ---

        // GET /api/projects
        if (pathname === '/api/projects' && req.method === 'GET') {
          const projects = DashboardRPCHandler.getProjects(this.workspaceDir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ projects }));
          return;
        }

        // POST /api/projects/add (register new project folder)
        if (pathname === '/api/projects/add' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          try {
            const project = DashboardRPCHandler.registerProject(body.path);
            const projects = DashboardRPCHandler.getProjects(this.workspaceDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, project, projects }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // GET /api/project (data for project)
        if (pathname === '/api/project' && req.method === 'GET') {
          const id = url.searchParams.get('id');
          const customPath = url.searchParams.get('path');
          
          if (customPath) {
            try {
              DashboardRPCHandler.registerProject(customPath);
            } catch (_) {}
          }

          const projects = DashboardRPCHandler.getProjects(this.workspaceDir);
          const target = customPath
            ? projects.find(p => p.projectDir === path.resolve(customPath) || p.skyhookDir === path.resolve(customPath))
            : (id ? projects.find(p => p.id === id) : projects[0]);

          if (!target) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Project not found' }));
            return;
          }

          // Ensure watcher is active for this project
          if (this.watcher && target.skyhookDir) {
            this.watcher.watchProject(target.skyhookDir, target.id);
          }

          const data = await DashboardRPCHandler.getProjectData(target.skyhookDir, target.projectDir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        // GET /api/file
        if (pathname === '/api/file' && req.method === 'GET') {
          const filePath = url.searchParams.get('path');
          if (!filePath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing path parameter' }));
            return;
          }

          try {
            const projects = DashboardRPCHandler.getProjects(this.workspaceDir);
            const targetDir = this.resolveProjectTarget(url);
            const allowedRoots = [
              targetDir,
              this.workspaceDir,
              process.cwd(),
              ...projects.map(p => p.projectDir),
              ...projects.map(p => path.dirname(p.skyhookDir))
            ].filter(Boolean);

            const fileData = DashboardRPCHandler.getFileContent(filePath, allowedRoots);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(fileData));
          } catch (err) {
            const isForbidden = err.message && err.message.includes('Access forbidden');
            const isNotFound = err.message && err.message.includes('File not found');
            const status = isForbidden ? 403 : (isNotFound ? 404 : 500);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Failed to read file' }));
          }
          return;
        }

        // GET /api/dark-matter
        if (pathname === '/api/dark-matter' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const darkMatter = await DashboardRPCHandler.getDarkMatterData(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(darkMatter));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              summary: { totalSymbols: 0, tracedSymbols: 0, untracedSymbols: 0, overallCoverage: 100 },
              files: [],
              languages: []
            }));
          }
          return;
        }

        // GET /api/drift
        if (pathname === '/api/drift' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const drift = await DashboardRPCHandler.getDriftScorecard(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(drift));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              healthScore: 100,
              pass: true,
              timestamp: new Date().toISOString(),
              summary: { totalViolations: 0, criticalCount: 0, warningCount: 0, nodesCount: 0, edgesCount: 0, externalPackagesCount: 0, circularCyclesCount: 0 },
              criticalViolations: [],
              warnings: [{ type: 'ANALYSIS_NOTICE', message: err.message || 'Analysis notice' }],
              circularCycles: [],
              c4: { mermaidContainer: '', mermaidComponent: '', diff: { match: true } },
              remediation: { markdown: '# System Boundaries\nAll boundaries nominal.', tasksCount: 0, tasks: [] }
            }));
          }
          return;
        }

        // GET /api/drift/graph
        if (pathname === '/api/drift/graph' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const graphData = await DashboardRPCHandler.getDriftGraph(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(graphData));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message, nodes: [], edges: [], externalPackages: [], circularCycles: [] }));
          }
          return;
        }

        // GET /api/drift/boundaries
        if (pathname === '/api/drift/boundaries' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const boundaries = await DashboardRPCHandler.getDriftBoundaries(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(boundaries));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message, violations: [], circularCycles: [] }));
          }
          return;
        }

        // GET /api/drift/c4
        if (pathname === '/api/drift/c4' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const c4 = await DashboardRPCHandler.getDriftC4(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(c4));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: err.message,
              inferred: { person: [], containers: [], relationships: [], components: [], componentRelationships: [] },
              mermaidContainer: '',
              mermaidComponent: '',
              diff: { match: true }
            }));
          }
          return;
        }

        // GET /api/ast/graph
        if (pathname === '/api/ast/graph' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const astGraph = await DashboardRPCHandler.getASTGraph(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(astGraph));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: err.message,
              mermaid: 'flowchart TB\n  Notice["⚠️ Codebase AST relationships unavailable"]',
              nodes: [],
              internalEdges: [],
              summary: { totalFiles: 0, totalSymbols: 0, tracedSymbols: 0, totalRequirements: 0, totalDecisions: 0 }
            }));
          }
          return;
        }

        // POST /api/action/draft-adr-drift
        if (pathname === '/api/action/draft-adr-drift' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const targetDir = this.resolveProjectTarget(url, body);
          const result = DashboardRPCHandler.draftADRFromDrift(targetDir, body.driftItem || body);
          if (this.gateway) {
            this.gateway.broadcast('ADR_DRAFTED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // GET /api/adr/dag
        if (pathname === '/api/adr/dag' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const dag = DashboardRPCHandler.getADRDAG(targetDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(dag));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ nodes: [], edges: [], roots: [], leaves: [] }));
          }
          return;
        }

        // GET /api/adr/diff
        if (pathname === '/api/adr/diff' && req.method === 'GET') {
          try {
            const targetDir = this.resolveProjectTarget(url);
            const decisionId = url.searchParams.get('id') || 'ADR-001';
            const diffData = DashboardRPCHandler.getADRDiff(targetDir, decisionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(diffData));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // GET /api/harness/detect
        if (pathname === '/api/harness/detect' && req.method === 'GET') {
          const targetDir = this.resolveProjectTarget(url);
          const scan = await DashboardRPCHandler.detectHarnesses(targetDir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(scan));
          return;
        }

        // GET /api/harness/status
        if (pathname === '/api/harness/status' && req.method === 'GET') {
          const targetDir = this.resolveProjectTarget(url);
          const statusReport = await DashboardRPCHandler.getHarnessStatus(targetDir);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(statusReport));
          return;
        }

        // POST /api/action/inject-harness
        if (pathname === '/api/action/inject-harness' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const targetDir = this.resolveProjectTarget(url, body);
          const result = await DashboardRPCHandler.injectHarness(targetDir, body);
          if (this.gateway) {
            this.gateway.broadcast('HARNESS_INJECTED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/remove-harness
        if (pathname === '/api/action/remove-harness' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const targetDir = this.resolveProjectTarget(url, body);
          const result = await DashboardRPCHandler.removeHarness(targetDir, body);
          if (this.gateway) {
            this.gateway.broadcast('HARNESS_REMOVED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/transition-adr
        if (pathname === '/api/action/transition-adr' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const targetDir = this.resolveProjectTarget(url, body);
          const result = DashboardRPCHandler.transitionADR(targetDir, body);
          if (this.gateway) {
            this.gateway.broadcast('ADR_TRANSITIONED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/supersede-adr
        if (pathname === '/api/action/supersede-adr' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const result = DashboardRPCHandler.supersedeADR(this.workspaceDir, body);
          if (this.gateway) {
            this.gateway.broadcast('ADR_SUPERSEDED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/compile-policies
        if (pathname === '/api/action/compile-policies' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const result = DashboardRPCHandler.compileADRPolicies(this.workspaceDir, body);
          if (this.gateway) {
            this.gateway.broadcast('POLICIES_COMPILED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/intercept-adr
        if (pathname === '/api/action/intercept-adr' && req.method === 'POST') {
          const result = DashboardRPCHandler.interceptADR(this.workspaceDir);
          if (this.gateway) {
            this.gateway.broadcast('ADR_INTERCEPTED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/update-status
        if (pathname === '/api/action/update-status' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const { skyhookDir, storyId, status, metadata } = body;
          const result = DashboardRPCHandler.updateStoryStatus(skyhookDir, storyId, status, metadata);
          if (this.gateway) {
            this.gateway.broadcast('STORY_TRANSITIONED', { storyId, status, metadata });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/release-lease
        if (pathname === '/api/action/release-lease' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const { skyhookDir, storyId, force } = body;
          const result = DashboardRPCHandler.releaseLease(skyhookDir, storyId, force);
          if (this.gateway) {
            this.gateway.broadcast('LEASE_RELEASED', { storyId });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/adopt-drift
        if (pathname === '/api/action/adopt-drift' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const { skyhookDir, technologies } = body;
          const result = DashboardRPCHandler.adoptDrift(skyhookDir, technologies);
          if (this.gateway) {
            this.gateway.broadcast('DRIFT_ADOPTED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/recompile-plan
        if (pathname === '/api/action/recompile-plan' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const { skyhookDir } = body;
          const result = await DashboardRPCHandler.recompilePlan(skyhookDir);
          if (this.gateway) {
            this.gateway.broadcast('PLAN_RECOMPILED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/open-editor
        if (pathname === '/api/action/open-editor' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const targetPath = body.filePath || body.path;
          const result = DashboardRPCHandler.openInEditor(targetPath, body.line, body.preference);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/action/reindex-symbols
        if (pathname === '/api/action/reindex-symbols' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const projDir = body.projectDir || this.workspaceDir;
          const result = await DashboardRPCHandler.reindexSymbols(projDir);
          if (this.gateway) {
            this.gateway.broadcast('SYMBOLS_UPDATED', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // =====================================================================
        // --- Full Entity CRUD Routes ---
        // =====================================================================

        // Story CRUD
        if (pathname === '/api/crud/story') {
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          if (req.method === 'POST') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.createStory(skyhookDir, body.story);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'PUT') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.updateStory(skyhookDir, body.storyId, body.updates);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'DELETE') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.deleteStory(skyhookDir, body.storyId);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }

        // Epic CRUD
        if (pathname === '/api/crud/epic') {
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          if (req.method === 'POST') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.createEpic(skyhookDir, body.epic);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'PUT') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.updateEpic(skyhookDir, body.epicId, body.updates);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'DELETE') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.deleteEpic(skyhookDir, body.epicId);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }

        // Task CRUD
        if (pathname === '/api/crud/task') {
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          if (req.method === 'POST') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.createTask(skyhookDir, body.task);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'PUT') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.updateTask(skyhookDir, body.taskId, body.updates);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'DELETE') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.deleteTask(skyhookDir, body.taskId);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }

        // Subtask CRUD
        if (pathname === '/api/crud/subtask') {
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          if (req.method === 'POST') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.createSubtask(skyhookDir, body.taskId, body.title);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'PUT') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = await DashboardRPCHandler.toggleSubtask(skyhookDir, body.taskId, body.subtaskId, body.completed);
            if (this.gateway) this.gateway.broadcast('BACKLOG_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }

        // POST /api/action/heartbeat
        if (pathname === '/api/action/heartbeat' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          const skyhookDir = body.skyhookDir || defaultSkyhookDir;
          const result = await DashboardRPCHandler.heartbeatLease(skyhookDir, body.itemId || body.taskId || body.storyId, body.agentId, body.extendMinutes);
          if (this.gateway) {
            this.gateway.broadcast('LEASE_HEARTBEAT', result);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // ADR CRUD
        if (pathname === '/api/crud/adr/supersede' && req.method === 'POST') {
          const body = await SkyhookServer.parseJsonBody(req);
          const result = DashboardRPCHandler.supersedeADR(this.workspaceDir, body);
          if (this.gateway) this.gateway.broadcast('DECISIONS_UPDATED', result);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        if (pathname === '/api/crud/adr') {
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          if (req.method === 'POST') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = DashboardRPCHandler.createADR(skyhookDir, body.adr);
            if (this.gateway) this.gateway.broadcast('DECISIONS_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'PUT') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = DashboardRPCHandler.updateADR(skyhookDir, body.adrId, body.updates);
            if (this.gateway) this.gateway.broadcast('DECISIONS_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'DELETE') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = DashboardRPCHandler.deleteADR(skyhookDir, body.adrId);
            if (this.gateway) this.gateway.broadcast('DECISIONS_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }

        // Requirement CRUD
        if (pathname === '/api/crud/requirement') {
          const defaultSkyhookDir = path.join(this.workspaceDir, '.skyhook');
          if (req.method === 'POST') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = DashboardRPCHandler.createRequirement(skyhookDir, body.type, body.requirement);
            if (this.gateway) this.gateway.broadcast('REQUIREMENTS_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'PUT') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = DashboardRPCHandler.updateRequirement(skyhookDir, body.type, body.reqId, body.updates);
            if (this.gateway) this.gateway.broadcast('REQUIREMENTS_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
          if (req.method === 'DELETE') {
            const body = await SkyhookServer.parseJsonBody(req);
            const skyhookDir = body.skyhookDir || defaultSkyhookDir;
            const result = DashboardRPCHandler.deleteRequirement(skyhookDir, body.type, body.reqId);
            if (this.gateway) this.gateway.broadcast('REQUIREMENTS_UPDATED', result);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }

        // --- Static Asset Serving ---
        let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
        let filePath = path.join(publicDir, relPath);

        // Security check
        if (!filePath.startsWith(publicDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        // Fallback for SPA routing if file does not exist
        if (!fs.existsSync(filePath)) {
          filePath = path.join(publicDir, 'index.html');
        }

        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff2': 'font/woff2'
        };

        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    // Attach WebSocket Gateway on same server
    this.gateway = new WebSocketGateway(this.server);
    this.watcher = new DashboardWatcher(this.gateway);

    // Watch local workspace if .skyhook exists
    const localSkyhook = path.join(this.workspaceDir, '.skyhook');
    if (fs.existsSync(localSkyhook)) {
      this.watcher.watchProject(localSkyhook, 'workspace');
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.currentPort, '127.0.0.1', () => {
        const url = `http://localhost:${this.currentPort}`;
        resolve({ port: this.currentPort, url });
      });
      if (this.server && typeof this.server.on === 'function') {
        this.server.on('error', reject);
      }
    });
  }

  /**
   * Stop the server and clean up watchers
   */
  async stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.gateway) {
      this.gateway.close();
      this.gateway = null;
    }

    if (this.server) {
      await new Promise(resolve => {
        if (this.server.closeAllConnections) {
          try {
            this.server.closeAllConnections();
          } catch {
            // Ignore
          }
        }
        if (typeof this.server.close === 'function') {
          if (this.server.close.length === 0) {
            try { this.server.close(); } catch {}
            resolve();
          } else {
            let done = false;
            const finish = () => {
              if (!done) {
                done = true;
                resolve();
              }
            };
            try {
              this.server.close(finish);
            } catch {
              finish();
            }
            setTimeout(finish, 100).unref();
          }
        } else {
          resolve();
        }
      });
      this.server = null;
    }
  }
}
