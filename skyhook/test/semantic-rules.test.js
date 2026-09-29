import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SemanticRuleEngine } from '../lib/drift/SemanticRuleEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'semantic_rules_test');

describe('SemanticRuleEngine', () => {
  before(() => {
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'config'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'controllers'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'services'), { recursive: true });
    fs.mkdirSync(path.join(FIXTURES_DIR, 'src', 'repositories'), { recursive: true });

    // Config file: allowed direct env access
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'config', 'database.js'), `
      export const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432
      };
    `);

    // Violating service: direct process.env access and unstructured console.log
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'services', 'payment.js'), `
      export class PaymentService {
        charge(amount) {
          const apiKey = process.env.STRIPE_SECRET_KEY;
          console.log("Processing payment: " + amount);
          return { status: 'ok' };
        }
      }
    `);

    // Violating controller: raw SQL and direct Prisma call
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'controllers', 'userController.js'), `
      export async function getUser(req, res) {
        // Raw SQL violation
        const rawUsers = await db.query("SELECT id, name, email FROM users WHERE id = ?", [req.params.id]);
        
        // Direct ORM call violation
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });

        // Comment should be ignored: SELECT * FROM mock_table
        res.json({ user });
      }
    `);

    // Compliant repository: raw SQL allowed in repository layer
    fs.writeFileSync(path.join(FIXTURES_DIR, 'src', 'repositories', 'userRepository.js'), `
      export class UserRepository {
        async findById(id) {
          return db.query("SELECT * FROM users WHERE id = ?", [id]);
        }
      }
    `);
  });

  after(() => {
    if (fs.existsSync(FIXTURES_DIR)) {
      fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    }
  });

  test('detects direct environment variable access outside config and unstructured logging', async () => {
    const engine = new SemanticRuleEngine(FIXTURES_DIR);
    const serviceViolations = engine.checkFile('src/services/payment.js');

    const envViolation = serviceViolations.find(v => v.ruleId === 'no-direct-env-access');
    assert.ok(envViolation, 'Should detect direct process.env access in service');
    assert.strictEqual(envViolation.severity, 'error');
    assert.match(envViolation.snippet, /process\.env\.STRIPE_SECRET_KEY/);

    const logViolation = serviceViolations.find(v => v.ruleId === 'enforce-structured-logging');
    assert.ok(logViolation, 'Should detect console.log in service');
    assert.strictEqual(logViolation.severity, 'warning');

    // Config file should pass without env violation
    const configViolations = engine.checkFile('src/config/database.js');
    const configEnv = configViolations.find(v => v.ruleId === 'no-direct-env-access');
    assert.strictEqual(configEnv, undefined, 'Config files should be permitted to read process.env');
  });

  test('detects raw SQL and direct ORM calls in controller layer', async () => {
    const engine = new SemanticRuleEngine(FIXTURES_DIR);
    const controllerViolations = engine.checkFile('src/controllers/userController.js');

    const sqlViolation = controllerViolations.find(v => v.ruleId === 'no-raw-sql-in-controllers');
    assert.ok(sqlViolation, 'Should detect raw SQL in controller');
    assert.strictEqual(sqlViolation.severity, 'error');

    const repoViolation = controllerViolations.find(v => v.ruleId === 'enforce-repository-pattern');
    assert.ok(repoViolation, 'Should detect direct Prisma ORM call in controller');
    assert.strictEqual(repoViolation.severity, 'warning');

    // Repository file should allow SQL queries
    const repoViolations = engine.checkFile('src/repositories/userRepository.js');
    const repoSql = repoViolations.find(v => v.ruleId === 'no-raw-sql-in-controllers');
    assert.strictEqual(repoSql, undefined, 'Repositories are permitted to use SQL queries');
  });

  test('runs project-wide analysis and supports custom declarative rules', async () => {
    const engine = new SemanticRuleEngine(FIXTURES_DIR, {
      semantic_rules: {
        custom_rules: [
          {
            id: 'no-hardcoded-stripe',
            name: 'No Hardcoded Stripe String',
            pattern: 'STRIPE_SECRET_KEY',
            severity: 'error',
            message: 'Stripe secret key references should be wrapped.'
          }
        ]
      }
    });

    const report = await engine.run();
    assert.ok(report.totalChecked >= 4, 'Should check all discovered files');
    assert.ok(report.errorsCount > 0, 'Should register errors');
    assert.strictEqual(report.pass, false, 'Project with errors should fail pass flag');

    const customViolation = report.violations.find(v => v.ruleId === 'no-hardcoded-stripe');
    assert.ok(customViolation, 'Should execute and report custom rules');
  });
});
