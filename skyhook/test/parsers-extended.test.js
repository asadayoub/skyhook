import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { JavaScriptParser } from '../lib/parsers/JavaScriptParser.js';
import { RegexFallbackParser } from '../lib/parsers/RegexFallbackParser.js';
import { PackageJsonProvider } from '../lib/inference/providers/PackageJsonProvider.js';
import { PrismaProvider } from '../lib/inference/providers/PrismaProvider.js';
import { DeploymentProvider } from '../lib/inference/providers/DeploymentProvider.js';
import { ConfigProvider } from '../lib/inference/providers/ConfigProvider.js';
import { InferenceEngine } from '../lib/inference/InferenceEngine.js';

test('JavaScriptParser - Comprehensive Symbol Extraction & Traceability Annotations', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-js-parser-test-'));
  const jsFile = path.join(tmpDir, 'service.js');

  const jsCode = `
// @skyhook-implements REQ-AUTH-001
export class AuthService {
  constructor(config) {
    this.config = config;
  }

  // @skyhook-implements REQ-AUTH-002
  login(username, password) {
    return true;
  }

  logout() {
    return false;
  }
}

// @skyhook-implements REQ-UTIL-001
export const generateToken = (payload) => {
  return 'jwt.token';
};

function helperFunction() {
  return 42;
}

module.exports = {
  AuthService,
  generateToken,
  helperFunction
};
`;

  fs.writeFileSync(jsFile, jsCode);

  try {
    const parser = new JavaScriptParser();
    const symbols = await parser.parse(jsFile, tmpDir);

    assert.ok(Array.isArray(symbols));
    assert.ok(symbols.length >= 4);

    // Verify AuthService class
    const authClass = symbols.find(s => s.symbolName === 'AuthService');
    assert.ok(authClass, 'Finds AuthService class');
    assert.strictEqual(authClass.symbolType, 'class');
    assert.strictEqual(authClass.traced, true);
    assert.strictEqual(authClass.requirementId, 'REQ-AUTH-001');

    // Verify login method
    const loginMethod = symbols.find(s => s.symbolName === 'login');
    assert.ok(loginMethod, 'Finds login method');
    assert.strictEqual(loginMethod.traced, true);
    assert.strictEqual(loginMethod.requirementId, 'REQ-AUTH-002');

    // Verify logout method (untraced dark matter)
    const logoutMethod = symbols.find(s => s.symbolName === 'logout');
    assert.ok(logoutMethod, 'Finds logout method');
    assert.strictEqual(logoutMethod.traced, false);

    // Verify generateToken arrow function
    const tokenFn = symbols.find(s => s.symbolName === 'generateToken');
    assert.ok(tokenFn, 'Finds generateToken arrow function');
    assert.strictEqual(tokenFn.traced, true);
    assert.strictEqual(tokenFn.requirementId, 'REQ-UTIL-001');

    // Verify helperFunction (untraced function declaration)
    const helperFn = symbols.find(s => s.symbolName === 'helperFunction');
    assert.ok(helperFn, 'Finds helperFunction');
    assert.strictEqual(helperFn.traced, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RegexFallbackParser - Fallback Symbol Extraction for Polyglot Files', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-fallback-parser-test-'));
  const parser = new RegexFallbackParser();

  try {
    // 1. Ruby file
    const rbFile = path.join(tmpDir, 'payment.rb');
    fs.writeFileSync(rbFile, `
# @skyhook-implements REQ-PAY-01
class PaymentGateway
  def process_charge(amount)
    true
  end
end
`);
    const rbSymbols = await parser.parse(rbFile, tmpDir);
    assert.ok(rbSymbols.length > 0);
    const rbClass = rbSymbols.find(s => s.symbolName === 'PaymentGateway');
    assert.ok(rbClass);
    assert.strictEqual(rbClass.requirementId, 'REQ-PAY-01');

    // 2. PHP file
    const phpFile = path.join(tmpDir, 'User.php');
    fs.writeFileSync(phpFile, `<?php
// @skyhook-implements REQ-USER-01
class UserController {
  public function index() {}
}
`);
    const phpSymbols = await parser.parse(phpFile, tmpDir);
    assert.ok(phpSymbols.length > 0);
    const phpClass = phpSymbols.find(s => s.symbolName === 'UserController');
    assert.ok(phpClass);
    assert.strictEqual(phpClass.requirementId, 'REQ-USER-01');

    // 3. Kotlin file
    const ktFile = path.join(tmpDir, 'Order.kt');
    fs.writeFileSync(ktFile, `
// @skyhook-implements REQ-ORD-01
class OrderService {
  fun createOrder() {}
}
`);
    const ktSymbols = await parser.parse(ktFile, tmpDir);
    assert.ok(ktSymbols.length > 0);
    const ktClass = ktSymbols.find(s => s.symbolName === 'OrderService');
    assert.ok(ktClass);
    assert.strictEqual(ktClass.requirementId, 'REQ-ORD-01');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('InferenceEngine Providers - PackageJson, Prisma, Deployment & Config', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-inference-test-'));

  try {
    // 1. PackageJsonProvider
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'ecommerce-app',
      dependencies: {
        express: '^4.19.2',
        pg: '^8.11.3',
        tailwindcss: '^3.4.1'
      },
      devDependencies: {
        vitest: '^1.4.0'
      },
      scripts: {
        dev: 'vite',
        test: 'vitest'
      }
    }, null, 2));

    const pkgFacts = { features: [], confidence: {} };
    const pkgProvider = new PackageJsonProvider();
    await pkgProvider.infer(tmpDir, pkgFacts);
    assert.strictEqual(pkgFacts.framework, 'Express');
    assert.strictEqual(pkgFacts.database, 'PostgreSQL');
    assert.strictEqual(pkgFacts.styling, 'Tailwind CSS');
    assert.strictEqual(pkgFacts.testing, 'Vitest');

    // 2. PrismaProvider
    const prismaDir = path.join(tmpDir, 'prisma');
    fs.mkdirSync(prismaDir, { recursive: true });
    fs.writeFileSync(path.join(prismaDir, 'schema.prisma'), `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
}
`);
    const prismaFacts = { features: [], confidence: {} };
    const prismaProvider = new PrismaProvider();
    await prismaProvider.infer(tmpDir, prismaFacts);
    assert.strictEqual(prismaFacts.orm, 'Prisma');
    assert.strictEqual(prismaFacts.database, 'PostgreSQL');
    assert.ok(prismaFacts.features.includes('model:user'));

    // 3. DeploymentProvider
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20-alpine\nWORKDIR /app\n');
    fs.writeFileSync(path.join(tmpDir, 'fly.toml'), 'app = "my-app"\n');

    const deployFacts = { features: [], confidence: {} };
    const deployProvider = new DeploymentProvider();
    await deployProvider.infer(tmpDir, deployFacts);
    assert.strictEqual(deployFacts.deployment, 'Fly.io');

    // 4. ConfigProvider
    fs.writeFileSync(path.join(tmpDir, 'vite.config.ts'), 'export default {}');
    const configFacts = { features: [], confidence: {} };
    const configProvider = new ConfigProvider();
    await configProvider.infer(tmpDir, configFacts);
    assert.strictEqual(configFacts.buildTool, 'Vite');

    // 5. Full integrated InferenceEngine.analyze()
    const engine = new InferenceEngine();
    const allFacts = await engine.analyze(tmpDir);
    assert.strictEqual(allFacts.framework, 'Express');
    assert.strictEqual(allFacts.database, 'PostgreSQL');
    assert.strictEqual(allFacts.orm, 'Prisma');
    assert.strictEqual(allFacts.deployment, 'Fly.io');
    assert.strictEqual(allFacts.buildTool, 'Vite');
    assert.strictEqual(allFacts.styling, 'Tailwind CSS');
    assert.ok(allFacts.features.includes('model:user'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
