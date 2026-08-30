/**
 * Skyhook Inference Engine - Auto-detects project facts from repository
 * No external dependencies, pure Node.js
 */

const fs = require('fs');
const path = require('path');

// ==================== MAIN EXPORT ====================

/**
 * Analyzes a project directory and returns inferred facts
 * @param {string} projectDir - Project root directory
 * @returns {Object} Inferred facts organized by category
 */
function inferFromRepo(projectDir) {
  const facts = {
    language: null,
    framework: null,
    buildTool: null,
    styling: null,
    database: null,
    orm: null,
    auth: null,
    apiStyle: null,
    deployment: null,
    testing: null,
    ci: null,
    packageManager: null,
    monorepo: false,
    features: [],
    confidence: {}
  };

  // 1. Read package.json if exists
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      inferFromPackageJson(pkg, facts);
    } catch (e) {
      // Ignore parse errors
    }
  }

  // 2. Check for Prisma schema
  inferFromPrisma(projectDir, facts);

  // 3. Check for middleware/auth files
  inferFromMiddleware(projectDir, facts);

  // 4. Check Docker/deployment configs
  inferFromDeploymentConfigs(projectDir, facts);

  // 5. Check CI/CD configs
  inferFromCIConfigs(projectDir, facts);

  // 6. Check for other config files
  inferFromConfigFiles(projectDir, facts);

  // 7. Detect monorepo
  inferMonorepo(projectDir, facts);

  // 8. Calculate confidence scores
  calculateConfidence(facts);

  return facts;
}

/**
 * Infer from package.json
 */
function inferFromPackageJson(pkg, facts) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts || {};

  // Language
  facts.language = 'TypeScript';
  if (pkg.devDependencies?.typescript || deps.typescript) {
    facts.confidence.language = 0.95;
  } else if (pkg.devDependencies?.javascript || deps.javascript) {
    facts.language = 'JavaScript';
    facts.confidence.language = 0.8;
  } else {
    facts.confidence.language = 0.7;
  }

  // Package manager
  if (fs.existsSync(path.join(process.cwd(), 'pnpm-lock.yaml'))) facts.packageManager = 'pnpm';
  else if (fs.existsSync(path.join(process.cwd(), 'yarn.lock'))) facts.packageManager = 'yarn';
  else facts.packageManager = 'npm';
  facts.confidence.packageManager = 0.9;

  // Framework detection
  const frameworkScores = {
    'next': { framework: 'Next.js', buildTool: 'Next.js', confidence: 0.95 },
    'react': { framework: 'React', confidence: 0.7 },
    'vue': { framework: 'Vue', confidence: 0.8 },
    'svelte': { framework: 'Svelte', confidence: 0.8 },
    'astro': { framework: 'Astro', buildTool: 'Astro', confidence: 0.9 },
    '@remix-run/react': { framework: 'Remix', buildTool: 'Remix', confidence: 0.9 },
    'fastify': { framework: 'Fastify', confidence: 0.8 },
    'express': { framework: 'Express', confidence: 0.7 },
    'hono': { framework: 'Hono', confidence: 0.8 },
    'nestjs': { framework: 'NestJS', confidence: 0.8 },
    'fastapi': { framework: 'FastAPI', language: 'Python', confidence: 0.9 }
  };

  for (const [pkgName, info] of Object.entries(frameworkScores)) {
    if (deps[pkgName] || Object.keys(deps).some(d => d.includes(pkgName))) {
      if (!facts.framework || info.confidence > facts.confidence.framework) {
        facts.framework = info.framework;
        if (info.buildTool) facts.buildTool = info.buildTool;
        facts.confidence.framework = info.confidence;
      }
    }
  }

  // Build tool (if not set by framework)
  if (!facts.buildTool) {
    if (deps.vite) { facts.buildTool = 'Vite'; facts.confidence.buildTool = 0.9; }
    else if (deps.webpack) { facts.buildTool = 'Webpack'; facts.confidence.buildTool = 0.7; }
    else if (deps.esbuild) { facts.buildTool = 'esbuild'; facts.confidence.buildTool = 0.8; }
    else if (deps.parcel) { facts.buildTool = 'Parcel'; facts.confidence.buildTool = 0.7; }
  }

  // Styling
  if (deps.tailwindcss || deps['tailwindcss-animate']) { facts.styling = 'Tailwind CSS'; facts.confidence.styling = 0.95; }
  else if (deps['styled-components']) { facts.styling = 'Styled Components'; facts.confidence.styling = 0.9; }
  else if (deps['@emotion/react'] || deps['@emotion/styled']) { facts.styling = 'Emotion'; facts.confidence.styling = 0.8; }
  else if (deps.sass || deps['node-sass']) { facts.styling = 'Sass/SCSS'; facts.confidence.styling = 0.8; }

  // Database & ORM
  if (deps.prisma || deps['@prisma/client']) { facts.orm = 'Prisma'; facts.confidence.orm = 0.95; }
  else if (deps.drizzle) { facts.orm = 'Drizzle'; facts.confidence.orm = 0.9; }
  else if (deps.kysely) { facts.orm = 'Kysely'; facts.confidence.orm = 0.8; }
  else if (deps.sequelize) { facts.orm = 'Sequelize'; facts.confidence.orm = 0.8; }
  else if (deps.typeorm) { facts.orm = 'TypeORM'; facts.confidence.orm = 0.8; }
  else if (deps.mongoose) { facts.orm = 'Mongoose'; facts.database = 'MongoDB'; facts.confidence.orm = 0.8; }

  // Database type
  if (deps.pg || deps.postgres || deps['@neondatabase/serverless'] || deps['@vercel/postgres']) { facts.database = 'PostgreSQL'; facts.confidence.database = 0.9; }
  else if (deps.mysql2 || deps.mysql) { facts.database = 'MySQL'; facts.confidence.database = 0.8; }
  else if (deps.sqlite3 || deps['better-sqlite3']) { facts.database = 'SQLite'; facts.confidence.database = 0.7; }
  else if (deps.mongoose) { facts.database = 'MongoDB'; facts.confidence.database = 0.8; }

  // Auth
  if (deps['next-auth'] || deps['@auth/core']) { facts.auth = 'NextAuth.js'; facts.confidence.auth = 0.95; }
  else if (deps['@clerk/nextjs'] || deps['@clerk/clerk-react']) { facts.auth = 'Clerk'; facts.confidence.auth = 0.9; }
  else if (deps['@supabase/supabase-js']) { facts.auth = 'Supabase Auth'; facts.confidence.auth = 0.8; }
  else if (deps['firebase-admin'] || deps['firebase-auth']) { facts.auth = 'Firebase Auth'; facts.confidence.auth = 0.8; }
  else if (deps.lucia) { facts.auth = 'Lucia'; facts.confidence.auth = 0.8; }
  else if (deps['passport'] || deps['express-session']) { facts.auth = 'Passport/Session'; facts.confidence.auth = 0.7; }

  // API Style
  if (deps.trpc || deps['@trpc/server']) { facts.apiStyle = 'tRPC'; facts.confidence.apiStyle = 0.9; }
  else if (deps.graphql || deps.apollo || deps.urql) { facts.apiStyle = 'GraphQL'; facts.confidence.apiStyle = 0.8; }
  else if (deps['@fastify/swagger'] || deps.swagger) { facts.apiStyle = 'REST (OpenAPI)'; facts.confidence.apiStyle = 0.7; }
  else if (deps.grpc || deps['@grpc/grpc-js']) { facts.apiStyle = 'gRPC'; facts.confidence.apiStyle = 0.8; }

  // Testing
  if (deps.vitest) { facts.testing = 'Vitest'; facts.confidence.testing = 0.9; }
  else if (deps.jest) { facts.testing = 'Jest'; facts.confidence.testing = 0.8; }
  else if (deps.playwright) { facts.testing = facts.testing ? facts.testing + ' + Playwright' : 'Playwright'; facts.confidence.testing = 0.9; }
  else if (deps.cypress) { facts.testing = facts.testing ? facts.testing + ' + Cypress' : 'Cypress'; facts.confidence.testing = 0.8; }

  // Features from scripts
  if (scripts.dev) facts.features.push('dev-script');
  if (scripts.build) facts.features.push('build-script');
  if (scripts.test) facts.features.push('test-script');
  if (scripts.lint) facts.features.push('lint-script');
  if (scripts['db:push'] || scripts['db:migrate']) facts.features.push('db-migrations');
  if (scripts['db:studio']) facts.features.push('prisma-studio');
}

/**
 * Infer from Prisma schema
 */
function inferFromPrisma(projectDir, facts) {
  const prismaPaths = [
    path.join(projectDir, 'prisma', 'schema.prisma'),
    path.join(projectDir, 'schema.prisma')
  ];

  for (const p of prismaPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        facts.orm = 'Prisma';
        facts.confidence.orm = 0.95;

        // Extract provider
        const providerMatch = content.match(/provider\s*=\s*["']?(\w+)["']?/);
        if (providerMatch) {
          const provider = providerMatch[1].toLowerCase();
          if (provider.includes('postgres') || provider.includes('pg')) facts.database = 'PostgreSQL';
          else if (provider.includes('mysql')) facts.database = 'MySQL';
          else if (provider.includes('sqlite')) facts.database = 'SQLite';
          else if (provider.includes('mongo')) facts.database = 'MongoDB';
          else if (provider.includes('sqlserver')) facts.database = 'SQL Server';
          facts.confidence.database = 0.95;
        }

        // Extract models for features
        const models = content.match(/model\s+(\w+)\s*{/g);
        if (models) {
          const modelNames = models.map(m => m.replace(/model\s+(\w+)\s*{/, '$1'));
          facts.features.push(...modelNames.map(m => `model:${m.toLowerCase()}`));
        }
      } catch (e) {}
      break;
    }
  }
}

/**
 * Infer from middleware/auth files
 */
function inferFromMiddleware(projectDir, facts) {
  const middlewarePaths = [
    'src/middleware.ts',
    'src/middleware.js',
    'middleware.ts',
    'middleware.js',
    'src/auth.ts',
    'src/auth.js',
    'src/lib/auth.ts',
    'src/lib/auth.js'
  ];

  for (const p of middlewarePaths) {
    const fullPath = path.join(projectDir, p);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // Check for NextAuth
        if (content.includes('next-auth') || content.includes('@auth/core')) {
          facts.auth = 'NextAuth.js';
          facts.confidence.auth = 0.9;
        }
        
        // Check for session handling
        if (content.includes('getServerSession') || content.includes('getSession')) {
          facts.features.push('server-session');
        }
        
        // Check for JWT
        if (content.includes('jwt') || content.includes('JWT')) {
          facts.features.push('jwt');
        }
      } catch (e) {}
    }
  }
}

/**
 * Infer from deployment configs
 */
function inferFromDeploymentConfigs(projectDir, facts) {
  const deployConfigs = [
    { file: 'vercel.json', platform: 'Vercel', confidence: 0.95 },
    { file: 'netlify.toml', platform: 'Netlify', confidence: 0.9 },
    { file: 'Dockerfile', platform: 'Docker', confidence: 0.8 },
    { file: 'docker-compose.yml', platform: 'Docker Compose', confidence: 0.8 },
    { file: 'fly.toml', platform: 'Fly.io', confidence: 0.9 },
    { file: 'railway.toml', platform: 'Railway', confidence: 0.9 },
    { file: 'render.yaml', platform: 'Render', confidence: 0.9 },
    { file: 'wrangler.toml', platform: 'Cloudflare Workers', confidence: 0.9 },
    { file: '.vercel', platform: 'Vercel', confidence: 0.7 },
    { file: '.netlify', platform: 'Netlify', confidence: 0.7 }
  ];

  for (const { file, platform, confidence } of deployConfigs) {
    const fullPath = path.join(projectDir, file);
    if (fs.existsSync(fullPath)) {
      if (!facts.deployment || confidence > facts.confidence.deployment) {
        facts.deployment = platform;
        facts.confidence.deployment = confidence;
      }
    }
  }

  // Check for Kubernetes
  const k8sDir = path.join(projectDir, 'k8s');
  if (fs.existsSync(k8sDir)) {
    facts.deployment = 'Kubernetes';
    facts.confidence.deployment = 0.85;
  }
}

/**
 * Infer from CI/CD configs
 */
function inferFromCIConfigs(projectDir, facts) {
  const ciPaths = {
    'github': path.join(projectDir, '.github', 'workflows'),
    'gitlab': path.join(projectDir, '.gitlab-ci.yml'),
    'circleci': path.join(projectDir, '.circleci', 'config.yml'),
    'jenkins': path.join(projectDir, 'Jenkinsfile'),
    'azure': path.join(projectDir, 'azure-pipelines.yml')
  };

  for (const [ci, p] of Object.entries(ciPaths)) {
    if (fs.existsSync(p)) {
      facts.ci = ci;
      facts.confidence.ci = 0.9;
      break;
    }
  }
}

/**
 * Infer from other config files
 */
function inferFromConfigFiles(projectDir, facts) {
  const configs = [
    { file: 'tsconfig.json', fact: 'typescript', confidence: 0.9 },
    { file: 'tailwind.config.ts', fact: 'tailwind', confidence: 0.9 },
    { file: 'tailwind.config.js', fact: 'tailwind', confidence: 0.9 },
    { file: 'vite.config.ts', fact: 'vite', confidence: 0.9 },
    { file: 'next.config.js', fact: 'next', confidence: 0.9 },
    { file: 'next.config.ts', fact: 'next', confidence: 0.9 },
    { file: 'remix.config.js', fact: 'remix', confidence: 0.9 },
    { file: 'astro.config.mjs', fact: 'astro', confidence: 0.9 }
  ];

  for (const { file, fact, confidence } of configs) {
    if (fs.existsSync(path.join(projectDir, file))) {
      if (fact === 'tailwind') { facts.styling = 'Tailwind CSS'; facts.confidence.styling = confidence; }
      else if (fact === 'vite') { facts.buildTool = 'Vite'; facts.confidence.buildTool = confidence; }
      else if (fact === 'next') { facts.framework = 'Next.js'; facts.confidence.framework = confidence; }
      else if (fact === 'remix') { facts.framework = 'Remix'; facts.confidence.framework = confidence; }
      else if (fact === 'astro') { facts.framework = 'Astro'; facts.confidence.framework = confidence; }
    }
  }
}

/**
 * Detect monorepo
 */
function inferMonorepo(projectDir, facts) {
  const monorepoIndicators = [
    'pnpm-workspace.yaml',
    'turbo.json',
    'nx.json',
    'lerna.json',
    'rush.json'
  ];

  for (const indicator of monorepoIndicators) {
    if (fs.existsSync(path.join(projectDir, indicator))) {
      facts.monorepo = true;
      facts.confidence.monorepo = 0.95;
      break;
    }
  }

  // Check package.json workspaces
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        facts.monorepo = true;
        facts.confidence.monorepo = 0.9;
      }
    } catch (e) {}
  }
}

/**
 * Calculate confidence scores
 */
function calculateConfidence(facts) {
  // Normalize confidence to 0-1
  for (const key of Object.keys(facts.confidence)) {
    const val = facts.confidence[key];
    if (typeof val === 'number') {
      facts.confidence[key] = Math.min(1, Math.max(0, val));
    }
  }
}

module.exports = { inferFromRepo };
