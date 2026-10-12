import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class GoModProvider extends Provider {
  async infer(projectDir, facts) {
    const goModPath = path.join(projectDir, 'go.mod');
    const hasGoMod = fs.existsSync(goModPath);

    if (!hasGoMod) {
      // Check for .go files in root or src/ or cmd/
      let hasGoFile = false;
      try {
        const rootEntries = fs.readdirSync(projectDir);
        hasGoFile = rootEntries.some(f => f.endsWith('.go'));
        if (!hasGoFile) {
          for (const sub of ['cmd', 'pkg', 'src', 'internal']) {
            const subPath = path.join(projectDir, sub);
            if (fs.existsSync(subPath)) {
              const subEntries = fs.readdirSync(subPath);
              if (subEntries.some(f => f.endsWith('.go'))) {
                hasGoFile = true;
                break;
              }
            }
          }
        }
      } catch {}
      if (!hasGoFile) return;
    }

    // Set language
    const currentLangConf = facts.confidence.language || 0;
    if (!facts.language || currentLangConf < 0.95) {
      facts.language = 'Go';
      facts.confidence.language = 0.95;
    }

    facts.packageManager = facts.packageManager || 'go modules';
    facts.confidence.packageManager = facts.confidence.packageManager || 0.9;
    facts.buildTool = facts.buildTool || 'go build';
    facts.confidence.buildTool = facts.confidence.buildTool || 0.85;

    if (!hasGoMod) {
      if (!facts.testing) {
        facts.testing = 'go test';
        facts.confidence.testing = 0.8;
      }
      return;
    }

    const deps = new Set();
    let moduleName = null;
    let goVersion = null;

    try {
      const content = fs.readFileSync(goModPath, 'utf-8');
      const lines = content.split('\n');
      let inRequireBlock = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('module ')) {
          moduleName = trimmed.replace(/^module\s+/, '').trim();
          continue;
        }

        if (trimmed.startsWith('go ')) {
          goVersion = trimmed.replace(/^go\s+/, '').trim();
          continue;
        }

        if (trimmed.startsWith('require (')) {
          inRequireBlock = true;
          continue;
        }

        if (inRequireBlock && trimmed === ')') {
          inRequireBlock = false;
          continue;
        }

        if (inRequireBlock) {
          const match = trimmed.match(/^([a-zA-Z0-9_./-]+)/);
          if (match && !match[1].startsWith('//')) {
            deps.add(match[1].toLowerCase());
          }
        } else if (trimmed.startsWith('require ')) {
          const match = trimmed.replace(/^require\s+/, '').match(/^([a-zA-Z0-9_./-]+)/);
          if (match) {
            deps.add(match[1].toLowerCase());
          }
        }
      }
    } catch {}

    if (moduleName && !facts.features.includes(`module:${moduleName}`)) {
      facts.features.push(`module:${moduleName}`);
    }
    if (goVersion && !facts.features.includes(`go:${goVersion}`)) {
      facts.features.push(`go:${goVersion}`);
    }

    // Framework detection
    const frameworkMap = [
      { key: 'github.com/gin-gonic/gin', framework: 'Gin', confidence: 0.95 },
      { key: 'github.com/labstack/echo', framework: 'Echo', confidence: 0.95 },
      { key: 'github.com/gofiber/fiber', framework: 'Fiber', confidence: 0.95 },
      { key: 'github.com/go-chi/chi', framework: 'Chi', confidence: 0.9 },
      { key: 'github.com/gobuffalo/buffalo', framework: 'Buffalo', confidence: 0.9 },
      { key: 'github.com/beego/beego', framework: 'Beego', confidence: 0.9 },
      { key: 'github.com/gorilla/mux', framework: 'Gorilla Mux', confidence: 0.85 }
    ];

    for (const item of frameworkMap) {
      if ([...deps].some(d => d.includes(item.key))) {
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

    // Database & ORM
    if ([...deps].some(d => d.includes('gorm.io/gorm'))) {
      facts.orm = 'GORM';
      facts.confidence.orm = 0.95;
    } else if ([...deps].some(d => d.includes('github.com/jmoiron/sqlx'))) {
      facts.orm = 'sqlx';
      facts.confidence.orm = 0.9;
    } else if ([...deps].some(d => d.includes('entgo.io/ent'))) {
      facts.orm = 'ent';
      facts.confidence.orm = 0.9;
    }

    // Database
    if ([...deps].some(d => d.includes('github.com/jackc/pgx') || d.includes('github.com/lib/pq'))) {
      facts.database = 'PostgreSQL';
      facts.confidence.database = 0.9;
    } else if ([...deps].some(d => d.includes('github.com/go-sql-driver/mysql'))) {
      facts.database = 'MySQL';
      facts.confidence.database = 0.85;
    } else if ([...deps].some(d => d.includes('github.com/mattn/go-sqlite3') || d.includes('modernc.org/sqlite'))) {
      facts.database = 'SQLite';
      facts.confidence.database = 0.8;
    } else if ([...deps].some(d => d.includes('go.mongodb.org/mongo-driver'))) {
      facts.database = 'MongoDB';
      facts.confidence.database = 0.85;
    }

    if ([...deps].some(d => d.includes('github.com/redis/go-redis') || d.includes('github.com/go-redis/redis'))) {
      if (facts.database && !facts.database.includes('Redis')) {
        facts.database += ' + Redis';
      } else if (!facts.database) {
        facts.database = 'Redis';
        facts.confidence.database = 0.8;
      }
    }

    // Testing
    if ([...deps].some(d => d.includes('github.com/stretchr/testify'))) {
      facts.testing = 'testify';
      facts.confidence.testing = 0.95;
    } else if ([...deps].some(d => d.includes('github.com/onsi/ginkgo'))) {
      facts.testing = 'Ginkgo';
      facts.confidence.testing = 0.9;
    } else if (!facts.testing) {
      facts.testing = 'go test';
      facts.confidence.testing = 0.8;
    }

    // API Style (gRPC, GraphQL, OpenAPI)
    if ([...deps].some(d => d.includes('google.golang.org/grpc'))) {
      facts.apiStyle = 'gRPC';
      facts.confidence.apiStyle = 0.95;
    } else if ([...deps].some(d => d.includes('github.com/99designs/gqlgen'))) {
      facts.apiStyle = 'GraphQL';
      facts.confidence.apiStyle = 0.9;
    } else if ([...deps].some(d => d.includes('github.com/swaggo/swag'))) {
      facts.apiStyle = 'REST (Swagger/OpenAPI)';
      facts.confidence.apiStyle = 0.9;
    }
  }
}
