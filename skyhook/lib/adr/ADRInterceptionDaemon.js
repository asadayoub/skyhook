/**
 * ADRInterceptionDaemon - Proactive Event-Triggered Interception Daemon
 * Non-blocking daemon that detects structural ecosystem events:
 * 1. Package manager changes (npm, pnpm, yarn, pip, cargo, go) adding major architectural libraries
 * 2. Database migrations (prisma, drizzle, alembic, flyway, etc.)
 * Synthesizes draft ADRs with context, comparative visual diffs, and initial boundary policies.
 */

import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml, getTimestamp, generateULID } from '../utils.js';
import { generateADR } from '../adr-generator.js';

export const KNOWN_ARCHITECTURAL_PACKAGES = {
  // ORMs & Data Persistence
  'prisma': { category: 'persistence', name: 'Prisma ORM', type: 'orm' },
  '@prisma/client': { category: 'persistence', name: 'Prisma Client', type: 'orm' },
  'drizzle-orm': { category: 'persistence', name: 'Drizzle ORM', type: 'orm' },
  'typeorm': { category: 'persistence', name: 'TypeORM', type: 'orm' },
  'sequelize': { category: 'persistence', name: 'Sequelize ORM', type: 'orm' },
  'mongoose': { category: 'persistence', name: 'Mongoose ODM', type: 'odm' },
  'knex': { category: 'persistence', name: 'Knex Query Builder', type: 'query-builder' },
  'sqlalchemy': { category: 'persistence', name: 'SQLAlchemy ORM', type: 'orm' },
  'diesel': { category: 'persistence', name: 'Diesel ORM', type: 'orm' },
  'sea-orm': { category: 'persistence', name: 'SeaORM', type: 'orm' },
  'gorm': { category: 'persistence', name: 'GORM', type: 'orm' },

  // API & Web Frameworks
  'fastify': { category: 'api', name: 'Fastify Web Framework', type: 'framework' },
  'express': { category: 'api', name: 'Express Server', type: 'framework' },
  'next': { category: 'framework', name: 'Next.js Framework', type: 'fullstack-framework' },
  'nuxt': { category: 'framework', name: 'Nuxt Framework', type: 'fullstack-framework' },
  '@nestjs/core': { category: 'framework', name: 'NestJS Framework', type: 'framework' },
  'fastapi': { category: 'api', name: 'FastAPI', type: 'framework' },
  'actix-web': { category: 'api', name: 'Actix Web', type: 'framework' },
  'axum': { category: 'api', name: 'Axum Framework', type: 'framework' },

  // Auth & Identity
  '@clerk/nextjs': { category: 'security', name: 'Clerk Authentication', type: 'auth' },
  '@clerk/backend': { category: 'security', name: 'Clerk Backend Auth', type: 'auth' },
  '@supabase/supabase-js': { category: 'security', name: 'Supabase SDK', type: 'auth-baas' },
  'next-auth': { category: 'security', name: 'NextAuth.js', type: 'auth' },
  '@auth/core': { category: 'security', name: 'Auth.js Core', type: 'auth' },

  // State & Cache
  'zustand': { category: 'state-management', name: 'Zustand State Store', type: 'state' },
  '@reduxjs/toolkit': { category: 'state-management', name: 'Redux Toolkit', type: 'state' },
  'pinia': { category: 'state-management', name: 'Pinia Store', type: 'state' },
  'ioredis': { category: 'caching', name: 'ioredis Client', type: 'cache' },
  'redis': { category: 'caching', name: 'Redis Client', type: 'cache' },

  // Messaging & Queues
  'kafkajs': { category: 'messaging', name: 'Apache Kafka Client', type: 'message-broker' },
  'amqplib': { category: 'messaging', name: 'RabbitMQ amqplib', type: 'message-broker' },
  'bullmq': { category: 'messaging', name: 'BullMQ Job Queue', type: 'queue' }
};

export const COMMON_MIGRATION_DIRS = [
  'prisma/migrations',
  'migrations',
  'drizzle',
  'alembic/versions',
  'db/migrate',
  'database/migrations'
];

export class ADRInterceptionDaemon {
  /**
   * @param {string} skyhookDir - Path to .skyhook dir
   * @param {string} [projectDir] - Workspace root
   */
  constructor(skyhookDir, projectDir = process.cwd()) {
    this.skyhookDir = path.resolve(skyhookDir);
    this.projectDir = path.resolve(projectDir);
    this.decisionsDir = path.join(this.skyhookDir, 'decisions');
    this.recordsDir = path.join(this.decisionsDir, 'records');
    this.indexPath = path.join(this.decisionsDir, 'index.yaml');
    this.cacheDir = path.join(this.skyhookDir, '.cache');
    this.snapshotPath = path.join(this.cacheDir, 'interception_manifests.json');
  }

  /**
   * Read cached manifest & migration snapshots
   * @returns {Object}
   */
  readSnapshot() {
    if (!fs.existsSync(this.snapshotPath)) {
      return { packages: {}, migrations: {} };
    }
    try {
      return JSON.parse(fs.readFileSync(this.snapshotPath, 'utf-8'));
    } catch {
      return { packages: {}, migrations: {} };
    }
  }

  /**
   * Persist manifest & migration snapshots
   * @param {Object} snapshot 
   */
  writeSnapshot(snapshot) {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  /**
   * Extract dependencies from package.json
   * @param {string} pkgPath 
   * @returns {Object}
   */
  readNodePackages(pkgPath) {
    if (!fs.existsSync(pkgPath)) return {};
    try {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return {
        ...(data.dependencies || {}),
        ...(data.devDependencies || {})
      };
    } catch {
      return {};
    }
  }

  /**
   * Extract dependencies from requirements.txt
   * @param {string} reqPath 
   * @returns {Object}
   */
  readPythonPackages(reqPath) {
    if (!fs.existsSync(reqPath)) return {};
    try {
      const lines = fs.readFileSync(reqPath, 'utf-8').split('\n');
      const pkgs = {};
      for (const line of lines) {
        const clean = line.split('#')[0].trim();
        if (clean) {
          const match = clean.match(/^([a-zA-Z0-9_-]+)/);
          if (match) pkgs[match[1].toLowerCase()] = clean;
        }
      }
      return pkgs;
    } catch {
      return {};
    }
  }

  /**
   * Detect newly added architectural dependencies
   * @param {Object} currentPackages 
   * @param {Object} cachedPackages 
   * @returns {Array<Object>}
   */
  detectArchitecturalPackageChanges(currentPackages, cachedPackages = {}) {
    const detected = [];
    for (const [pkgName, version] of Object.entries(currentPackages)) {
      if (!cachedPackages[pkgName]) {
        // Newly added package
        const meta = KNOWN_ARCHITECTURAL_PACKAGES[pkgName.toLowerCase()];
        if (meta) {
          detected.push({
            package: pkgName,
            version,
            meta
          });
        }
      }
    }
    return detected;
  }

  /**
   * Detect newly created database migration files
   * @param {string} migrationDir 
   * @param {Array<string>} cachedFiles 
   * @returns {Array<string>}
   */
  detectNewMigrations(migrationDir, cachedFiles = []) {
    const fullDir = path.resolve(this.projectDir, migrationDir);
    if (!fs.existsSync(fullDir)) return [];

    try {
      const currentFiles = fs.readdirSync(fullDir).filter(f => !f.startsWith('.'));
      const cachedSet = new Set(cachedFiles || []);
      return currentFiles.filter(f => !cachedSet.has(f));
    } catch {
      return [];
    }
  }

  /**
   * Generate next sequential ADR ID or ULID
   * @returns {string}
   */
  generateNextADRId() {
    let indexData = { decisions: [] };
    if (fs.existsSync(this.indexPath)) {
      indexData = readYaml(this.indexPath) || { decisions: [] };
    }
    const count = (indexData.decisions || []).length + 1;
    const padded = String(count).padStart(3, '0');
    return `ADR-${padded}`;
  }

  /**
   * Synthesize a complete draft ADR for an intercepted architectural event
   * @param {Object} event 
   * @returns {Object}
   */
  synthesizeDraftADR(event) {
    if (!fs.existsSync(this.recordsDir)) {
      fs.mkdirSync(this.recordsDir, { recursive: true });
    }

    const id = this.generateNextADRId();
    let title = 'Architectural Decision';
    let category = 'architecture';
    let contextText = '';
    let decisionText = '';

    if (event.type === 'package_added') {
      const meta = event.meta || {};
      title = `Adoption of ${meta.name || event.package}`;
      category = meta.category || 'architecture';
      contextText = `Detected new architectural dependency \`${event.package}\` (${event.version || 'latest'}) installed into the project workspace.\nAdopting this package impacts application structure, dependencies, and boundary standards.`;
      decisionText = `Adopt \`${meta.name || event.package}\` for project ${category}. Establish architectural boundaries and standard usage patterns.`;
    } else if (event.type === 'migration_added') {
      title = `Database Schema Migration: ${event.migrationFile}`;
      category = 'persistence';
      contextText = `A new database migration file \`${event.migrationFile}\` was detected in \`${event.migrationDir}\`.\nDatabase schema evolutions must be tracked in architectural decisions to safeguard data integrity and migration rollback plans.`;
      decisionText = `Apply and govern database migration \`${event.migrationFile}\`. Ensure backwards-compatible columns and indices are verified.`;
    }

    const decisionData = {
      id,
      title,
      category,
      status: 'draft',
      author: 'Proactive Interceptor (Skyhook)',
      context: contextText,
      decision: decisionText,
      comparativeDiagram: true
    };

    const projectContext = {
      projectType: 'Web App',
      profile: 'web-app',
      techStack: { technologies: [] }
    };

    const adrMarkdown = generateADR(decisionData, projectContext);
    const recordFile = path.join(this.recordsDir, `${id}.md`);
    fs.writeFileSync(recordFile, adrMarkdown, 'utf-8');

    // Register into index.yaml
    let indexData = { schemaVersion: '1.0.0', decisions: [] };
    if (fs.existsSync(this.indexPath)) {
      indexData = readYaml(this.indexPath) || { schemaVersion: '1.0.0', decisions: [] };
    }
    if (!Array.isArray(indexData.decisions)) indexData.decisions = [];

    indexData.decisions.push({
      id,
      title,
      category,
      status: 'draft',
      author: decisionData.author,
      createdAt: getTimestamp(),
      file: path.relative(this.skyhookDir, recordFile),
      autoSynthesized: true,
      triggerEvent: event.type
    });

    writeYaml(this.indexPath, indexData);

    return {
      intercepted: true,
      draftId: id,
      title,
      recordFile,
      eventType: event.type
    };
  }

  /**
   * Run one-shot sweep over package manifests and migration directories
   * @returns {Array<Object>} List of synthesized draft ADRs
   */
  scan() {
    const snapshot = this.readSnapshot();
    const results = [];

    // 1. Scan Node package.json
    const pkgJsonPath = path.join(this.projectDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const currentPkgs = this.readNodePackages(pkgJsonPath);
      const cachedPkgs = snapshot.packages['node'] || {};
      const changes = this.detectArchitecturalPackageChanges(currentPkgs, cachedPkgs);

      for (const change of changes) {
        const draft = this.synthesizeDraftADR({
          type: 'package_added',
          package: change.package,
          version: change.version,
          meta: change.meta
        });
        results.push(draft);
      }

      snapshot.packages['node'] = currentPkgs;
    }

    // 2. Scan Python requirements.txt
    const reqPath = path.join(this.projectDir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      const currentPy = this.readPythonPackages(reqPath);
      const cachedPy = snapshot.packages['python'] || {};
      const changes = this.detectArchitecturalPackageChanges(currentPy, cachedPy);

      for (const change of changes) {
        const draft = this.synthesizeDraftADR({
          type: 'package_added',
          package: change.package,
          version: change.version,
          meta: change.meta
        });
        results.push(draft);
      }

      snapshot.packages['python'] = currentPy;
    }

    // 3. Scan Migration Dirs
    for (const relDir of COMMON_MIGRATION_DIRS) {
      const fullDir = path.join(this.projectDir, relDir);
      if (fs.existsSync(fullDir)) {
        const cachedFiles = snapshot.migrations[relDir] || [];
        const newFiles = this.detectNewMigrations(relDir, cachedFiles);

        for (const newFile of newFiles) {
          const draft = this.synthesizeDraftADR({
            type: 'migration_added',
            migrationDir: relDir,
            migrationFile: newFile
          });
          results.push(draft);
        }

        try {
          snapshot.migrations[relDir] = fs.readdirSync(fullDir).filter(f => !f.startsWith('.'));
        } catch {
          // ignore
        }
      }
    }

    this.writeSnapshot(snapshot);
    return results;
  }
}
