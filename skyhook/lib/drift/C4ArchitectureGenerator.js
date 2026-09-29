/**
 * C4ArchitectureGenerator - Automated C4 Architecture Model & Living System Diffing
 * Reverse-engineers C4 Container and Component models from AST imports, dependencies,
 * and project structure; generates standard Mermaid C4 diagrams; diffs against target architecture.
 */

import fs from 'fs';
import path from 'path';
import { readYaml } from '../utils.js';
import { ASTImportGraph } from './ASTImportGraph.js';

export class C4ArchitectureGenerator {
  /**
   * @param {string} projectDir 
   * @param {ASTImportGraph} [importGraph]
   */
  constructor(projectDir = process.cwd(), importGraph = null) {
    this.projectDir = path.resolve(projectDir);
    this.importGraph = importGraph || new ASTImportGraph(this.projectDir);
  }

  /**
   * Discover installed package dependencies from package.json, requirements.txt, go.mod, Cargo.toml
   * @returns {Set<string>}
   */
  discoverDependencies() {
    const deps = new Set();

    // 1. package.json
    const pkgJsonPath = path.join(this.projectDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const name of Object.keys(allDeps)) {
          deps.add(name.toLowerCase());
        }
      } catch {}
    }

    // 2. requirements.txt / pyproject.toml
    const reqPath = path.join(this.projectDir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const content = fs.readFileSync(reqPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^([A-Za-z0-9_-]+)/);
          if (match) deps.add(match[1].toLowerCase());
        }
      } catch {}
    }

    // 3. go.mod
    const goModPath = path.join(this.projectDir, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*([A-Za-z0-9_./-]+)/);
          if (match && !line.includes('module ') && !line.includes('go ')) {
            deps.add(match[1].toLowerCase());
          }
        }
      } catch {}
    }

    // 4. Cargo.toml
    const cargoPath = path.join(this.projectDir, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^([A-Za-z0-9_-]+)\s*=/);
          if (match) deps.add(match[1].toLowerCase());
        }
      } catch {}
    }

    // Also include external packages discovered by AST import graph
    for (const pkg of this.importGraph.externalPackages.keys()) {
      deps.add(pkg.toLowerCase());
    }

    return deps;
  }

  /**
   * Infer C4 Containers and Components from dependencies and code structure
   * @returns {Promise<Object>}
   */
  async inferArchitecture() {
    if (this.importGraph.nodes.size === 0) {
      await this.importGraph.build();
    }

    const deps = this.discoverDependencies();
    const containers = [];
    const relationships = [];
    const components = [];

    // System User
    const userPerson = {
      id: 'user',
      type: 'Person',
      name: 'User',
      description: 'End user or client interacting with the system'
    };

    // 1. Detect Web Application / Frontend Container
    let frontendContainer = null;
    const frontendTechs = [];
    if (deps.has('react') || deps.has('react-dom')) frontendTechs.push('React');
    if (deps.has('next')) frontendTechs.push('Next.js');
    if (deps.has('vue')) frontendTechs.push('Vue.js');
    if (deps.has('nuxt')) frontendTechs.push('Nuxt');
    if (deps.has('svelte')) frontendTechs.push('Svelte');
    if (deps.has('vite')) frontendTechs.push('Vite');
    if (deps.has('@angular/core')) frontendTechs.push('Angular');

    // Also check directory clues like web/, frontend/, public/
    const hasFrontendDir = fs.existsSync(path.join(this.projectDir, 'frontend')) ||
                           fs.existsSync(path.join(this.projectDir, 'web')) ||
                           fs.existsSync(path.join(this.projectDir, 'pages')) ||
                           fs.existsSync(path.join(this.projectDir, 'app'));

    if (frontendTechs.length > 0 || hasFrontendDir) {
      frontendContainer = {
        id: 'web_app',
        type: 'Container',
        name: 'Web Application',
        technology: frontendTechs.join(', ') || 'HTML/SPA',
        description: 'Delivers dynamic user interface in web browser'
      };
      containers.push(frontendContainer);
      relationships.push({
        from: 'user',
        to: 'web_app',
        label: 'Visits and interacts with',
        technology: 'HTTPS'
      });
    }

    // 2. Detect API Backend Container
    let backendContainer = null;
    const backendTechs = [];
    if (deps.has('express')) backendTechs.push('Express');
    if (deps.has('fastify')) backendTechs.push('Fastify');
    if (deps.has('@nestjs/core')) backendTechs.push('NestJS');
    if (deps.has('koa')) backendTechs.push('Koa');
    if (deps.has('fastapi')) backendTechs.push('FastAPI');
    if (deps.has('flask')) backendTechs.push('Flask');
    if (deps.has('django')) backendTechs.push('Django');
    if (deps.has('github.com/gin-gonic/gin')) backendTechs.push('Gin');
    if (deps.has('axum')) backendTechs.push('Axum');
    if (deps.has('actix-web')) backendTechs.push('Actix');

    const hasBackendDir = fs.existsSync(path.join(this.projectDir, 'src')) ||
                          fs.existsSync(path.join(this.projectDir, 'lib')) ||
                          fs.existsSync(path.join(this.projectDir, 'server')) ||
                          fs.existsSync(path.join(this.projectDir, 'api'));

    if (backendTechs.length > 0 || hasBackendDir || containers.length === 0) {
      backendContainer = {
        id: 'api_service',
        type: 'Container',
        name: 'API Backend Service',
        technology: backendTechs.join(', ') || 'Node.js / REST API',
        description: 'Processes business operations and exposes REST/GraphQL APIs'
      };
      containers.push(backendContainer);

      if (frontendContainer) {
        relationships.push({
          from: 'web_app',
          to: 'api_service',
          label: 'Makes API calls to',
          technology: 'JSON/HTTPS'
        });
      } else {
        relationships.push({
          from: 'user',
          to: 'api_service',
          label: 'Sends requests to',
          technology: 'REST/HTTPS'
        });
      }
    }

    // 3. Detect Database Container
    const dbTechs = [];
    let isDbRelational = false;
    let isDbNoSQL = false;

    if (deps.has('pg') || deps.has('postgres') || deps.has('psycopg2') || deps.has('pq')) {
      dbTechs.push('PostgreSQL');
      isDbRelational = true;
    }
    if (deps.has('mysql') || deps.has('mysql2')) {
      dbTechs.push('MySQL');
      isDbRelational = true;
    }
    if (deps.has('sqlite3') || deps.has('better-sqlite3') || deps.has('sqlite')) {
      dbTechs.push('SQLite');
      isDbRelational = true;
    }
    if (deps.has('mongodb') || deps.has('mongoose')) {
      dbTechs.push('MongoDB');
      isDbNoSQL = true;
    }
    if (deps.has('@aws-sdk/client-dynamodb') || deps.has('boto3')) {
      dbTechs.push('DynamoDB');
      isDbNoSQL = true;
    }

    if (dbTechs.length > 0) {
      const dbContainer = {
        id: 'database',
        type: 'ContainerDb',
        name: 'Database',
        technology: dbTechs.join(', '),
        description: isDbRelational ? 'Stores structured relational business entities' : 'Stores document entities'
      };
      containers.push(dbContainer);

      if (backendContainer) {
        relationships.push({
          from: 'api_service',
          to: 'database',
          label: 'Reads and writes data',
          technology: 'TCP/SQL'
        });
      }
    }

    // 4. Detect Cache / Queue Container
    const cacheTechs = [];
    if (deps.has('redis') || deps.has('ioredis') || deps.has('redis-py') || deps.has('go-redis')) {
      cacheTechs.push('Redis');
    }
    if (deps.has('bullmq') || deps.has('bull')) {
      cacheTechs.push('BullMQ');
    }
    if (deps.has('kafkajs') || deps.has('confluent-kafka')) {
      cacheTechs.push('Kafka');
    }
    if (deps.has('amqplib') || deps.has('pika')) {
      cacheTechs.push('RabbitMQ');
    }

    if (cacheTechs.length > 0) {
      const cacheContainer = {
        id: 'cache_queue',
        type: 'ContainerDb',
        name: 'Cache & Message Broker',
        technology: cacheTechs.join(', '),
        description: 'Caches query results and processes asynchronous events'
      };
      containers.push(cacheContainer);

      if (backendContainer) {
        relationships.push({
          from: 'api_service',
          to: 'cache_queue',
          label: 'Caches and publishes events to',
          technology: 'RESP/TCP'
        });
      }
    }

    // 5. Detect External SaaS Systems
    const extSystems = [];
    if (deps.has('stripe')) extSystems.push({ id: 'stripe', name: 'Stripe Gateway', desc: 'Processes payment card transactions' });
    if (deps.has('twilio')) extSystems.push({ id: 'twilio', name: 'Twilio API', desc: 'Sends SMS and voice notifications' });
    if (deps.has('@sendgrid/mail')) extSystems.push({ id: 'sendgrid', name: 'SendGrid', desc: 'Transactional email delivery' });
    if (deps.has('@aws-sdk/client-s3')) extSystems.push({ id: 's3', name: 'AWS S3', desc: 'Blob and object storage' });
    if (deps.has('openai') || deps.has('@anthropic-ai/sdk')) extSystems.push({ id: 'llm_api', name: 'LLM AI Provider', desc: 'Inference and AI completions' });

    for (const ext of extSystems) {
      containers.push({
        id: ext.id,
        type: 'System_Ext',
        name: ext.name,
        technology: 'External SaaS',
        description: ext.desc
      });
      if (backendContainer) {
        relationships.push({
          from: 'api_service',
          to: ext.id,
          label: 'Delegates operations to',
          technology: 'HTTPS/REST'
        });
      }
    }

    // 6. Discover Components inside Backend API Container
    const componentRels = [];
    const controllerComps = [];
    const serviceComps = [];
    const repositoryComps = [];

    for (const [filePath] of this.importGraph.nodes.entries()) {
      const lower = filePath.toLowerCase();
      const base = path.basename(filePath, path.extname(filePath));

      if (lower.includes('controller') || lower.includes('handler') || lower.includes('route')) {
        controllerComps.push({
          id: `comp_${base.replace(/[^A-Za-z0-9_]/g, '_')}`,
          name: base,
          type: 'Controller',
          technology: 'HTTP Route Handler',
          file: filePath,
          description: 'Handles incoming API requests and input validation'
        });
      } else if (lower.includes('service') || lower.includes('usecase')) {
        serviceComps.push({
          id: `comp_${base.replace(/[^A-Za-z0-9_]/g, '_')}`,
          name: base,
          type: 'Service',
          technology: 'Application Service',
          file: filePath,
          description: 'Coordinates business workflows and domain logic'
        });
      } else if (lower.includes('repo') || lower.includes('dao') || lower.includes('model')) {
        repositoryComps.push({
          id: `comp_${base.replace(/[^A-Za-z0-9_]/g, '_')}`,
          name: base,
          type: 'Repository',
          technology: 'Data Access',
          file: filePath,
          description: 'Manages entity persistence and database queries'
        });
      }
    }

    components.push(...controllerComps, ...serviceComps, ...repositoryComps);

    // Component relationships based on import graph edges
    for (const edge of this.importGraph.edges) {
      const fromComp = components.find(c => c.file === edge.from);
      const toComp = components.find(c => c.file === edge.to);
      if (fromComp && toComp && fromComp.id !== toComp.id) {
        componentRels.push({
          from: fromComp.id,
          to: toComp.id,
          label: 'Calls'
        });
      }
    }

    return {
      person: userPerson,
      containers,
      relationships,
      components,
      componentRelationships: componentRels
    };
  }

  /**
   * Render Mermaid C4 Container Diagram
   * @param {Object} inferred 
   * @returns {string}
   */
  toMermaidContainerDiagram(inferred) {
    const lines = ['C4Container', 'title System Architecture - Container Diagram', ''];

    // Person
    if (inferred.person) {
      lines.push(`Person(${inferred.person.id}, "${inferred.person.name}", "${inferred.person.description}")`);
    }

    // Containers
    for (const c of inferred.containers) {
      const type = c.type || 'Container';
      lines.push(`${type}(${c.id}, "${c.name}", "${c.technology || ''}", "${c.description || ''}")`);
    }

    lines.push('');

    // Relationships
    for (const r of inferred.relationships) {
      const tech = r.technology ? `, "${r.technology}"` : '';
      lines.push(`Rel(${r.from}, ${r.to}, "${r.label}"${tech})`);
    }

    return lines.join('\n');
  }

  /**
   * Render Mermaid C4 Component Diagram
   * @param {Object} inferred 
   * @param {string} [containerName='API Backend Service']
   * @returns {string}
   */
  toMermaidComponentDiagram(inferred, containerName = 'API Backend Service') {
    const lines = ['C4Component', `title Component Diagram for ${containerName}`, ''];
    lines.push(`Container_Boundary(b1, "${containerName}") {`);

    // Top representative components (limit to 12 for readable diagram)
    const displayComps = inferred.components.slice(0, 12);
    for (const comp of displayComps) {
      lines.push(`  Component(${comp.id}, "${comp.name}", "${comp.technology}", "${comp.description}")`);
    }

    lines.push('}');
    lines.push('');

    // Component relationships
    const compIds = new Set(displayComps.map(c => c.id));
    const addedPairs = new Set();

    for (const r of inferred.componentRelationships) {
      if (compIds.has(r.from) && compIds.has(r.to)) {
        const key = `${r.from}->${r.to}`;
        if (!addedPairs.has(key)) {
          addedPairs.add(key);
          lines.push(`Rel(${r.from}, ${r.to}, "${r.label}")`);
        }
      }
    }

    // Default layered connections if no explicit imports recorded
    if (addedPairs.size === 0 && displayComps.length > 1) {
      const firstCtrl = displayComps.find(c => c.type === 'Controller');
      const firstSvc = displayComps.find(c => c.type === 'Service');
      const firstRepo = displayComps.find(c => c.type === 'Repository');

      if (firstCtrl && firstSvc) lines.push(`Rel(${firstCtrl.id}, ${firstSvc.id}, "Invokes")`);
      if (firstSvc && firstRepo) lines.push(`Rel(${firstSvc.id}, ${firstRepo.id}, "Queries")`);
    }

    return lines.join('\n');
  }

  /**
   * Diff inferred architecture against declared target C4 architecture
   * @param {Object} inferred 
   * @param {Object} [targetConfig] - Target C4 specification (defaults to target-c4.yaml or tech-stack.yaml)
   * @returns {Object} Diff report with added, missing, and unauthorized connections
   */
  diffWithTarget(inferred, targetConfig = null) {
    if (!targetConfig) {
      targetConfig = this.loadTargetConfig();
    }

    const targetContainers = new Map();
    if (targetConfig && Array.isArray(targetConfig.containers)) {
      for (const tc of targetConfig.containers) {
        targetContainers.set(tc.id.toLowerCase(), tc);
      }
    }

    const inferredContainers = new Map();
    for (const ic of inferred.containers) {
      inferredContainers.set(ic.id.toLowerCase(), ic);
    }

    const addedContainers = [];
    const missingContainers = [];

    // If target has declared containers, calculate additions & omissions
    if (targetContainers.size > 0) {
      for (const [id, ic] of inferredContainers.entries()) {
        if (!targetContainers.has(id)) {
          addedContainers.push({
            id: ic.id,
            name: ic.name,
            technology: ic.technology,
            reason: `Container '${ic.name}' detected in code but not declared in target architecture`
          });
        }
      }

      for (const [id, tc] of targetContainers.entries()) {
        if (!inferredContainers.has(id)) {
          missingContainers.push({
            id: tc.id,
            name: tc.name,
            technology: tc.technology,
            reason: `Target architecture specifies container '${tc.name}' (${tc.technology || ''}) which was not found in codebase`
          });
        }
      }
    }

    // Check unauthorized connections
    const targetEdges = new Set();
    if (targetConfig && Array.isArray(targetConfig.relationships)) {
      for (const rel of targetConfig.relationships) {
        targetEdges.add(`${rel.from.toLowerCase()}->${rel.to.toLowerCase()}`);
      }
    }

    const unauthorizedConnections = [];
    if (targetEdges.size > 0) {
      for (const rel of inferred.relationships) {
        const edgeKey = `${rel.from.toLowerCase()}->${rel.to.toLowerCase()}`;
        if (!targetEdges.has(edgeKey)) {
          unauthorizedConnections.push({
            from: rel.from,
            to: rel.to,
            label: rel.label,
            reason: `Connection between '${rel.from}' and '${rel.to}' is not declared in target C4 model`
          });
        }
      }
    }

    const totalIssues = addedContainers.length + missingContainers.length + unauthorizedConnections.length;
    const scoreDeduction = (addedContainers.length * 10) + (missingContainers.length * 15) + (unauthorizedConnections.length * 20);
    const healthScore = Math.max(0, 100 - scoreDeduction);

    return {
      match: totalIssues === 0,
      totalIssues,
      healthScore,
      addedContainers,
      missingContainers,
      unauthorizedConnections,
      hasTargetSpecification: targetContainers.size > 0
    };
  }

  /**
   * Load target architecture configuration from .skyhook/architecture/target-c4.yaml
   * Falls back to synthesizing minimal target from tech-stack.yaml
   * @returns {Object|null}
   */
  loadTargetConfig() {
    const targetFile = path.join(this.projectDir, '.skyhook', 'architecture', 'target-c4.yaml');
    if (fs.existsSync(targetFile)) {
      return readYaml(targetFile);
    }

    // Fallback synthesis from tech-stack.yaml
    const techStackFile = path.join(this.projectDir, '.skyhook', 'tech-stack.yaml');
    if (fs.existsSync(techStackFile)) {
      const techStack = readYaml(techStackFile);
      if (techStack && Array.isArray(techStack.technologies)) {
        const containers = [];
        for (const tech of techStack.technologies) {
          const tName = (tech.name || '').toLowerCase();
          if (tName.includes('react') || tName.includes('next') || tName.includes('vue')) {
            containers.push({ id: 'web_app', name: tech.name, technology: tech.name });
          } else if (tName.includes('express') || tName.includes('fastify') || tName.includes('nest')) {
            containers.push({ id: 'api_service', name: tech.name, technology: tech.name });
          } else if (tName.includes('postgres') || tName.includes('mysql') || tName.includes('sqlite') || tName.includes('mongo')) {
            containers.push({ id: 'database', name: tech.name, technology: tech.name });
          } else if (tName.includes('redis')) {
            containers.push({ id: 'cache_queue', name: tech.name, technology: tech.name });
          }
        }
        if (containers.length > 0) {
          return { containers, relationships: [] };
        }
      }
    }

    return null;
  }
}
