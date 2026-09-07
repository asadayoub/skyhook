import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class PackageJsonProvider extends Provider {
  async infer(projectDir, facts) {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
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
      if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) facts.packageManager = 'pnpm';
      else if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) facts.packageManager = 'yarn';
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
          if (!facts.framework || info.confidence > (facts.confidence.framework || 0)) {
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

      // Monorepo workspaces check
      if (pkg.workspaces) {
        facts.monorepo = true;
        facts.confidence.monorepo = 0.9;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
}
