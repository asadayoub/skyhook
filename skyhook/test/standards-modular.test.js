import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StandardsRegistry } from '../lib/standards/StandardsRegistry.js';
import { StandardsResolver } from '../lib/standards/StandardsResolver.js';
import { StandardsPackageInstaller } from '../lib/standards/StandardsPackageInstaller.js';
import { SemanticRuleEngine } from '../lib/drift/SemanticRuleEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '.tmp_standards_modular_test');

describe('Standards Modular Engine & Registry Suite', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (_) {}
  });

  test('StandardsRegistry discovers all 16 built-in standards across domains', () => {
    const all = StandardsRegistry.loadAll(TEST_DIR);
    assert.ok(all.length >= 16, `Expected at least 16 standards, found ${all.length}`);

    // Verify IDs exist
    const ids = all.map(s => s.id);
    assert.ok(ids.includes('STD-SEC-001'), 'STD-SEC-001 should be present');
    assert.ok(ids.includes('STD-SEC-002'), 'STD-SEC-002 should be present');
    assert.ok(ids.includes('STD-A11Y-001'), 'STD-A11Y-001 should be present');
    assert.ok(ids.includes('STD-ARCH-001'), 'STD-ARCH-001 should be present');
    assert.ok(ids.includes('STD-SOFT-001'), 'STD-SOFT-001 should be present');
    assert.ok(ids.includes('STD-TEST-001'), 'STD-TEST-001 should be present');
    assert.ok(ids.includes('STD-UX-001'), 'STD-UX-001 should be present');
  });

  test('StandardsRegistry filters by domain, category, tag and severity', () => {
    const secStandards = StandardsRegistry.listStandards({ domain: 'security' }, TEST_DIR);
    secStandards.forEach(s => assert.ok(s.domain.toLowerCase() === 'security' || s.category.toLowerCase() === 'security'));

    const a11yStandards = StandardsRegistry.listStandards({ category: 'accessibility' }, TEST_DIR);
    assert.ok(a11yStandards.length >= 4, 'Should find at least 4 accessibility standards');

    const jwtStandards = StandardsRegistry.listStandards({ tag: 'jwt' }, TEST_DIR);
    assert.ok(jwtStandards.length >= 1, 'Should find jwt standard');
    assert.strictEqual(jwtStandards[0].id, 'STD-SEC-001');

    const criticalStandards = StandardsRegistry.listStandards({ severity: 'critical' }, TEST_DIR);
    assert.ok(criticalStandards.length >= 1, 'Should find critical standards');
  });

  test('Multi-tier priority: workspace custom standard overrides built-in standard with same ID', () => {
    const customDir = path.join(TEST_DIR, '.skyhook', 'standards', 'custom');
    fs.mkdirSync(customDir, { recursive: true });

    // Override STD-SEC-001 with custom company policy
    const customStandardContent = `
id: STD-SEC-001
title: Acme Enterprise JWT & SSO Standard
version: 2.0.0
domain: security
category: security
severity: critical
summary: Custom enterprise JWT policy requiring RS256 with key rotation.
tags: [security, jwt, sso]
guidelines:
  - Enterprise SSO tokens must use RS256 algorithm.
acceptanceCriteria:
  - id: AC-CUSTOM-1
    criterion: HS256 is strictly prohibited.
automatedRules:
  - ruleId: STD-SEC-001-CUSTOM
    name: Prohibit HS256 algorithm
    pattern: "algorithms:\\s*\\[.*['\\\"]HS256['\\\"].*\\]"
    severity: critical
    message: Enterprise policy requires RS256; HS256 is forbidden.
`;
    fs.writeFileSync(path.join(customDir, 'STD-SEC-001-custom.yaml'), customStandardContent, 'utf-8');

    const resolved = StandardsRegistry.getStandard('STD-SEC-001', TEST_DIR);
    assert.ok(resolved, 'Should resolve standard');
    assert.strictEqual(resolved.title, 'Acme Enterprise JWT & SSO Standard', 'Custom standard should override built-in');
    assert.strictEqual(resolved.tier, 'workspace-custom');
    assert.strictEqual(resolved.version, '2.0.0');
  });

  test('StandardsPackageInstaller scaffolds new custom standard correctly', () => {
    const scaffoldRes = StandardsPackageInstaller.scaffoldCustomStandard({
      id: 'STD-DATA-001',
      title: 'PII Data Redaction Standard',
      domain: 'security',
      severity: 'error',
      description: 'Customer PII must be masked in application logs.',
      tags: ['pii', 'gdpr', 'privacy']
    }, TEST_DIR);

    assert.ok(scaffoldRes.success);
    assert.strictEqual(scaffoldRes.standard.id, 'STD-DATA-001');
    assert.ok(fs.existsSync(scaffoldRes.filePath), 'File must exist on disk');

    // Retrieve via registry
    const fetched = StandardsRegistry.getStandard('STD-DATA-001', TEST_DIR);
    assert.ok(fetched);
    assert.strictEqual(fetched.title, 'PII Data Redaction Standard');
  });

  test('StandardsPackageInstaller installs standards package bundle', () => {
    // Create mock package bundle directory
    const pkgSourceDir = path.join(TEST_DIR, 'mock-standards-pack');
    fs.mkdirSync(pkgSourceDir, { recursive: true });

    fs.writeFileSync(path.join(pkgSourceDir, 'STD-FIN-001-double-entry.yaml'), `
id: STD-FIN-001
title: Double Entry Ledger Accounting
version: 1.0.0
domain: financial
category: architecture
severity: error
tags: [finance, ledger, audit]
guidelines:
  - Debits and credits must always balance to zero.
acceptanceCriteria:
  - id: AC-FIN-1
    criterion: Zero sum verification on balance updates.
`, 'utf-8');

    const installRes = StandardsPackageInstaller.installPackage(pkgSourceDir, TEST_DIR);
    assert.ok(installRes.success);
    assert.strictEqual(installRes.installedCount, 1);

    const fetched = StandardsRegistry.getStandard('STD-FIN-001', TEST_DIR);
    assert.ok(fetched);
    assert.strictEqual(fetched.tier, 'workspace-package');
  });

  test('StandardsResolver resolves references by ID and semantic tags', () => {
    // Direct ID resolution
    const direct = StandardsResolver.resolveReferences(['STD-A11Y-001'], TEST_DIR);
    assert.strictEqual(direct.length, 1);
    assert.strictEqual(direct[0].id, 'STD-A11Y-001');

    // Semantic tag resolution
    const tagMatch = StandardsResolver.resolveReferences(['accessibility/keyboard'], TEST_DIR);
    assert.ok(tagMatch.length >= 1);
    assert.ok(tagMatch.some(s => s.id === 'STD-A11Y-002'));
  });

  test('StandardsResolver compiles compact LLM Agent Briefing', () => {
    const story = {
      id: 'STORY-001',
      title: 'Implement user login with JWT tokens',
      standards: ['STD-SEC-001', 'STD-SEC-003']
    };

    const briefingRes = StandardsResolver.resolveBriefingForStory(story, TEST_DIR);
    assert.strictEqual(briefingRes.standardsCount, 2);
    assert.strictEqual(briefingRes.governingStandards.length, 2);

    const std1 = briefingRes.governingStandards.find(s => s.id === 'STD-SEC-001');
    assert.ok(std1);
    assert.ok(Array.isArray(std1.criticalRules));
    assert.ok(Array.isArray(std1.acceptanceCriteria));
    assert.ok(std1.criticalRules.length > 0);
  });

  test('SemanticRuleEngine dynamically loads automated rules from standards and flags violations', async () => {
    // Create source files violating standards
    const srcDir = path.join(TEST_DIR, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // File 1: Prohibited algorithm and insecure token handling
    const authFile = path.join(srcDir, 'clientAuth.js');
    fs.writeFileSync(authFile, `
      export function saveSession(token) {
        const options = { algorithms: ['HS256'] };
        localStorage.setItem('jwt', token);
      }
    `, 'utf-8');

    // File 2: Clean file
    const cleanFile = path.join(srcDir, 'cleanService.js');
    fs.writeFileSync(cleanFile, `
      export function sum(a, b) {
        return a + b;
      }
    `, 'utf-8');

    const engine = new SemanticRuleEngine(TEST_DIR);
    const report = await engine.verifyStandards();

    assert.strictEqual(report.pass, false, 'Should fail verification on violation');
    assert.strictEqual(report.exitCode, 1, 'Should set exitCode to 1');
    assert.ok(report.violations.length >= 1, 'Should report violations');

    const jwtViolation = report.violations.find(v => v.standardId === 'STD-SEC-001' || v.file.includes('clientAuth.js'));
    assert.ok(jwtViolation, 'Should flag clientAuth.js violation');
    assert.strictEqual(jwtViolation.severity, 'critical');

    // Test clean file verification
    const cleanEngine = new SemanticRuleEngine(TEST_DIR);
    const cleanReport = await cleanEngine.verifyStandards(['src/cleanService.js']);
    assert.strictEqual(cleanReport.pass, true, 'Clean file should pass');
    assert.strictEqual(cleanReport.exitCode, 0, 'Clean file exit code should be 0');
  });
});
