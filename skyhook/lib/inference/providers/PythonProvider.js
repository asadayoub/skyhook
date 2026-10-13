import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class PythonProvider extends Provider {
  async infer(projectDir, facts) {
    const pyprojectPath = path.join(projectDir, 'pyproject.toml');
    const reqPath = path.join(projectDir, 'requirements.txt');
    const reqDevPath = path.join(projectDir, 'requirements-dev.txt');
    const pipfilePath = path.join(projectDir, 'Pipfile');
    const setupPyPath = path.join(projectDir, 'setup.py');
    const setupCfgPath = path.join(projectDir, 'setup.cfg');

    const hasPyProject = fs.existsSync(pyprojectPath);
    const hasReq = fs.existsSync(reqPath);
    const hasReqDev = fs.existsSync(reqDevPath);
    const hasPipfile = fs.existsSync(pipfilePath);
    const hasSetupPy = fs.existsSync(setupPyPath);
    const hasSetupCfg = fs.existsSync(setupCfgPath);

    if (!hasPyProject && !hasReq && !hasReqDev && !hasPipfile && !hasSetupPy && !hasSetupCfg) {
      // Check for .py files in project directory or src/
      let hasPyFile = false;
      try {
        const rootEntries = fs.readdirSync(projectDir);
        hasPyFile = rootEntries.some(f => f.endsWith('.py'));
        if (!hasPyFile && fs.existsSync(path.join(projectDir, 'src'))) {
          const srcEntries = fs.readdirSync(path.join(projectDir, 'src'));
          hasPyFile = srcEntries.some(f => f.endsWith('.py'));
        }
      } catch {}
      if (!hasPyFile) return;
    }

    // Set language
    const currentLangConf = facts.confidence.language || 0;
    if (!facts.language || currentLangConf < 0.95) {
      facts.language = 'Python';
      facts.confidence.language = 0.95;
    }

    const deps = new Set();
    let pyprojectRaw = '';

    // 1. Parse pyproject.toml
    if (hasPyProject) {
      try {
        pyprojectRaw = fs.readFileSync(pyprojectPath, 'utf-8');
        this.extractPyprojectDeps(pyprojectRaw, deps);
      } catch {}
    }

    // 2. Parse requirements.txt
    if (hasReq) {
      this.extractRequirementsDeps(reqPath, deps);
    }
    if (hasReqDev) {
      this.extractRequirementsDeps(reqDevPath, deps);
    }

    // 3. Parse Pipfile
    if (hasPipfile) {
      try {
        const pipfileContent = fs.readFileSync(pipfilePath, 'utf-8');
        this.extractPipfileDeps(pipfileContent, deps);
      } catch {}
    }

    // 4. Parse setup.py
    if (hasSetupPy) {
      try {
        const setupContent = fs.readFileSync(setupPyPath, 'utf-8');
        const matches = setupContent.matchAll(/['"]([a-zA-Z0-9_-]+)(?:[><=~^].*?)?['"]/g);
        for (const match of matches) {
          deps.add(match[1].toLowerCase());
        }
      } catch {}
    }

    // Package manager & Build tool detection
    if (fs.existsSync(path.join(projectDir, 'poetry.lock')) || pyprojectRaw.includes('[tool.poetry]')) {
      facts.packageManager = 'poetry';
      facts.confidence.packageManager = 0.95;
      facts.buildTool = facts.buildTool || 'poetry';
      facts.confidence.buildTool = facts.confidence.buildTool || 0.9;
    } else if (fs.existsSync(path.join(projectDir, 'uv.lock')) || pyprojectRaw.includes('[tool.uv]')) {
      facts.packageManager = 'uv';
      facts.confidence.packageManager = 0.95;
    } else if (hasPipfile) {
      facts.packageManager = 'pipenv';
      facts.confidence.packageManager = 0.9;
    } else if (hasReq) {
      if (!facts.packageManager || (facts.confidence.packageManager || 0) < 0.85) {
        facts.packageManager = 'pip';
        facts.confidence.packageManager = 0.85;
      }
    }

    if (pyprojectRaw.includes('hatchling') || pyprojectRaw.includes('[tool.hatch]')) {
      facts.buildTool = 'hatch';
      facts.confidence.buildTool = 0.9;
    } else if (pyprojectRaw.includes('flit_core') || pyprojectRaw.includes('[tool.flit]')) {
      facts.buildTool = 'flit';
      facts.confidence.buildTool = 0.9;
    } else if (pyprojectRaw.includes('maturin')) {
      facts.buildTool = 'maturin';
      facts.confidence.buildTool = 0.9;
    } else if (hasSetupPy || hasSetupCfg) {
      if (!facts.buildTool || (facts.confidence.buildTool || 0) < 0.85) {
        facts.buildTool = 'setuptools';
        facts.confidence.buildTool = 0.85;
      }
    }

    // Framework detection
    const frameworkScores = {
      'fastapi': { framework: 'FastAPI', apiStyle: 'REST (OpenAPI)', confidence: 0.95 },
      'django': { framework: 'Django', orm: 'Django ORM', confidence: 0.95 },
      'flask': { framework: 'Flask', confidence: 0.9 },
      'litestar': { framework: 'Litestar', apiStyle: 'REST (OpenAPI)', confidence: 0.9 },
      'starlite': { framework: 'Litestar', apiStyle: 'REST (OpenAPI)', confidence: 0.9 },
      'tornado': { framework: 'Tornado', confidence: 0.85 },
      'pyramid': { framework: 'Pyramid', confidence: 0.85 },
      'sanic': { framework: 'Sanic', confidence: 0.85 }
    };

    for (const [pkg, info] of Object.entries(frameworkScores)) {
      if (deps.has(pkg)) {
        if (!facts.framework || info.confidence > (facts.confidence.framework || 0)) {
          facts.framework = info.framework;
          facts.confidence.framework = info.confidence;
          if (info.apiStyle && (!facts.apiStyle || (facts.confidence.apiStyle || 0) < 0.9)) {
            facts.apiStyle = info.apiStyle;
            facts.confidence.apiStyle = 0.9;
          }
          if (info.orm && (!facts.orm || (facts.confidence.orm || 0) < 0.9)) {
            facts.orm = info.orm;
            facts.confidence.orm = 0.9;
          }
        }
      }
    }

    // Database & ORM
    if (deps.has('sqlalchemy')) {
      facts.orm = 'SQLAlchemy';
      facts.confidence.orm = 0.95;
    } else if (deps.has('tortoise-orm') || deps.has('tortoise')) {
      facts.orm = 'Tortoise ORM';
      facts.confidence.orm = 0.9;
    } else if (deps.has('peewee')) {
      facts.orm = 'Peewee';
      facts.confidence.orm = 0.85;
    } else if (deps.has('prisma')) {
      facts.orm = 'Prisma Client Python';
      facts.confidence.orm = 0.9;
    }

    // Database
    if (deps.has('psycopg2') || deps.has('psycopg2-binary') || deps.has('psycopg') || deps.has('asyncpg')) {
      facts.database = 'PostgreSQL';
      facts.confidence.database = 0.9;
    } else if (deps.has('mysqlclient') || deps.has('pymysql') || deps.has('aiomysql')) {
      facts.database = 'MySQL';
      facts.confidence.database = 0.85;
    } else if (deps.has('aiosqlite') || deps.has('sqlite3')) {
      facts.database = 'SQLite';
      facts.confidence.database = 0.8;
    } else if (deps.has('pymongo') || deps.has('motor')) {
      facts.database = 'MongoDB';
      facts.confidence.database = 0.85;
    }

    if (deps.has('redis') || deps.has('aioredis')) {
      if (facts.database && !facts.database.includes('Redis')) {
        facts.database += ' + Redis';
      } else if (!facts.database) {
        facts.database = 'Redis';
        facts.confidence.database = 0.8;
      }
    }

    // Testing
    if (deps.has('pytest')) {
      facts.testing = 'pytest';
      facts.confidence.testing = 0.95;
    } else if (deps.has('unittest')) {
      facts.testing = 'unittest';
      facts.confidence.testing = 0.85;
    }
    if (deps.has('behave')) {
      facts.testing = facts.testing ? `${facts.testing} + Behave` : 'Behave';
      facts.confidence.testing = 0.9;
    }

    // Auth
    if (deps.has('fastapi-users')) {
      facts.auth = 'FastAPI Users';
      facts.confidence.auth = 0.9;
    } else if (deps.has('django-allauth')) {
      facts.auth = 'django-allauth';
      facts.confidence.auth = 0.9;
    } else if (deps.has('pyjwt') || deps.has('python-jose')) {
      facts.auth = 'JWT';
      facts.confidence.auth = 0.85;
    } else if (deps.has('authlib')) {
      facts.auth = 'Authlib';
      facts.confidence.auth = 0.85;
    }

    // API Style (GraphQL / gRPC)
    if (deps.has('strawberry-graphql') || deps.has('graphene')) {
      facts.apiStyle = 'GraphQL';
      facts.confidence.apiStyle = 0.9;
    } else if (deps.has('grpcio') || deps.has('grpcio-tools')) {
      facts.apiStyle = 'gRPC';
      facts.confidence.apiStyle = 0.95;
    }

    // Key features
    if (deps.has('celery') && !facts.features.includes('celery')) facts.features.push('celery');
    if (deps.has('alembic') && !facts.features.includes('alembic')) facts.features.push('alembic');
    if (deps.has('pydantic') && !facts.features.includes('pydantic')) facts.features.push('pydantic');
    if (deps.has('gunicorn') && !facts.features.includes('gunicorn')) facts.features.push('gunicorn');
    if (deps.has('uvicorn') && !facts.features.includes('uvicorn')) facts.features.push('uvicorn');
  }

  extractRequirementsDeps(filePath, deps) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const clean = line.split('#')[0].trim();
        if (clean && !clean.startsWith('-r') && !clean.startsWith('-i')) {
          const match = clean.match(/^([a-zA-Z0-9_.-]+)/);
          if (match) deps.add(match[1].toLowerCase());
        }
      }
    } catch {}
  }

  extractPyprojectDeps(content, deps) {
    const lines = content.split('\n');
    let inDepsSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inDepsSection = trimmed.includes('dependencies') || trimmed.includes('tool.poetry.dependencies') || trimmed.includes('project.dependencies');
        continue;
      }

      if (inDepsSection) {
        // Match key = "..." or "pkg>=1.0"
        const keyMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=/);
        if (keyMatch) {
          deps.add(keyMatch[1].toLowerCase());
          continue;
        }
        const strMatch = trimmed.match(/^['"]([a-zA-Z0-9_.-]+)/);
        if (strMatch) {
          deps.add(strMatch[1].toLowerCase());
        }
      } else if (trimmed.startsWith('dependencies = [')) {
        inDepsSection = true;
      }
    }
  }

  extractPipfileDeps(content, deps) {
    const lines = content.split('\n');
    let inPackages = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[packages]' || trimmed === '[dev-packages]') {
        inPackages = true;
        continue;
      } else if (trimmed.startsWith('[')) {
        inPackages = false;
        continue;
      }

      if (inPackages) {
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=/);
        if (match) deps.add(match[1].toLowerCase());
      }
    }
  }
}

