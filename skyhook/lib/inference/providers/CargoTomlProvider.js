import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class CargoTomlProvider extends Provider {
  async infer(projectDir, facts) {
    const cargoPath = path.join(projectDir, 'Cargo.toml');
    const hasCargo = fs.existsSync(cargoPath);

    if (!hasCargo) {
      // Check for .rs files
      let hasRsFile = false;
      try {
        const rootEntries = fs.readdirSync(projectDir);
        hasRsFile = rootEntries.some(f => f.endsWith('.rs'));
        if (!hasRsFile && fs.existsSync(path.join(projectDir, 'src'))) {
          const srcEntries = fs.readdirSync(path.join(projectDir, 'src'));
          hasRsFile = srcEntries.some(f => f.endsWith('.rs'));
        }
      } catch {}
      if (!hasRsFile) return;
    }

    // Set language
    const currentLangConf = facts.confidence.language || 0;
    if (!facts.language || currentLangConf < 0.95) {
      facts.language = 'Rust';
      facts.confidence.language = 0.95;
    }

    facts.packageManager = facts.packageManager || 'cargo';
    facts.confidence.packageManager = facts.confidence.packageManager || 0.95;
    facts.buildTool = facts.buildTool || 'cargo';
    facts.confidence.buildTool = facts.confidence.buildTool || 0.9;

    if (!hasCargo) {
      if (!facts.testing) {
        facts.testing = 'cargo test';
        facts.confidence.testing = 0.85;
      }
      return;
    }

    const deps = new Set();
    let edition = null;

    try {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      const lines = content.split('\n');
      let currentSection = '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          currentSection = trimmed.slice(1, -1).trim();
          if (currentSection === 'workspace' || currentSection.startsWith('workspace.')) {
            facts.monorepo = true;
            facts.confidence.monorepo = 0.95;
          }
          continue;
        }

        if (currentSection === 'package') {
          const editionMatch = trimmed.match(/^edition\s*=\s*['"]([0-9]+)['"]/);
          if (editionMatch) {
            edition = editionMatch[1];
          }
        }

        if (
          currentSection === 'dependencies' ||
          currentSection === 'dev-dependencies' ||
          currentSection === 'build-dependencies' ||
          currentSection === 'workspace.dependencies' ||
          currentSection.startsWith('dependencies.') ||
          currentSection.startsWith('target.')
        ) {
          const depMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
          if (depMatch) {
            deps.add(depMatch[1].toLowerCase());
          }
        }
      }
    } catch {}

    if (edition && !facts.features.includes(`edition:${edition}`)) {
      facts.features.push(`edition:${edition}`);
    }

    // Async runtimes
    if (deps.has('tokio') && !facts.features.includes('runtime:tokio')) {
      facts.features.push('runtime:tokio');
    }
    if (deps.has('async-std') && !facts.features.includes('runtime:async-std')) {
      facts.features.push('runtime:async-std');
    }

    // Frameworks
    const frameworkScores = [
      { crate: 'actix-web', framework: 'Actix Web', confidence: 0.95 },
      { crate: 'axum', framework: 'Axum', confidence: 0.95 },
      { crate: 'rocket', framework: 'Rocket', confidence: 0.95 },
      { crate: 'warp', framework: 'Warp', confidence: 0.9 },
      { crate: 'poem', framework: 'Poem', confidence: 0.9 },
      { crate: 'tauri', framework: 'Tauri', confidence: 0.95 }
    ];

    for (const item of frameworkScores) {
      if (deps.has(item.crate)) {
        if (!facts.framework || item.confidence > (facts.confidence.framework || 0)) {
          facts.framework = item.framework;
          facts.confidence.framework = item.confidence;
          if (!facts.apiStyle || (facts.confidence.apiStyle || 0) < 0.8) {
            facts.apiStyle = 'REST';
            facts.confidence.apiStyle = 0.8;
          }
        }
      }
    }

    // ORM & DB
    if (deps.has('diesel')) {
      facts.orm = 'Diesel';
      facts.confidence.orm = 0.95;
    } else if (deps.has('sqlx')) {
      facts.orm = 'SQLx';
      facts.confidence.orm = 0.95;
    } else if (deps.has('sea-orm')) {
      facts.orm = 'SeaORM';
      facts.confidence.orm = 0.95;
    }

    // Database
    if (deps.has('tokio-postgres') || deps.has('postgres')) {
      facts.database = 'PostgreSQL';
      facts.confidence.database = 0.9;
    } else if (deps.has('rusqlite')) {
      facts.database = 'SQLite';
      facts.confidence.database = 0.85;
    } else if (deps.has('mysql') || deps.has('mysql_async')) {
      facts.database = 'MySQL';
      facts.confidence.database = 0.85;
    } else if (deps.has('mongodb')) {
      facts.database = 'MongoDB';
      facts.confidence.database = 0.85;
    }

    if (deps.has('redis')) {
      if (facts.database && !facts.database.includes('Redis')) {
        facts.database += ' + Redis';
      } else if (!facts.database) {
        facts.database = 'Redis';
        facts.confidence.database = 0.8;
      }
    }

    // Testing
    if (deps.has('criterion')) {
      facts.testing = 'cargo test + criterion';
      facts.confidence.testing = 0.9;
    } else if (!facts.testing) {
      facts.testing = 'cargo test';
      facts.confidence.testing = 0.85;
    }

    // API Style
    if (deps.has('tonic')) {
      facts.apiStyle = 'gRPC (Tonic)';
      facts.confidence.apiStyle = 0.95;
    } else if (deps.has('async-graphql') || deps.has('juniper')) {
      facts.apiStyle = 'GraphQL';
      facts.confidence.apiStyle = 0.9;
    }
  }
}

