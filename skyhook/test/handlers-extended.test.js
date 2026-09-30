import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SkyhookContext } from '../lib/context.js';
import {
  cmdInit,
  cmdStandards,
  cmdProfile,
  cmdDiscover,
  cmdQuestion,
  cmdInstall,
  cmdGetContext
} from '../lib/handlers/general.js';
import {
  cmdCoverage,
  cmdMapLegacy
} from '../lib/handlers/sync.js';
import {
  cmdHookInstall,
  cmdHookUninstall,
  cmdHookStatus
} from '../lib/handlers/hook.js';

test('Extended CLI Handlers - Standards, Profiles, Discovery & Context', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-handlers-test-'));
  const ctx = new SkyhookContext(tmpDir);

  try {
    // 1. Initialize project
    const initRes = await cmdInit(ctx, { name: 'Handler Test Project', profile: 'web-app' });
    assert.ok(initRes.message.includes('successfully'));

    // 2. cmdStandards - Default profile standards
    const stdRes = await cmdStandards(ctx, {});
    assert.ok(Array.isArray(stdRes.standards));
    assert.ok(stdRes.standards.length > 0);
    const secStd = stdRes.standards.find(s => s.standard === 'security' || s.standard === 'accessibility');
    assert.ok(secStd, 'Default standards should include security or accessibility');
    assert.strictEqual(secStd.source, 'profile-default');

    // 3. cmdStandards - Project YAML overrides
    const projectYamlPath = path.join(ctx.skyhookDir, 'project.yaml');
    const projectYaml = ctx.readYaml(projectYamlPath);
    projectYaml.configuration = {
      standardsOverrides: {
        accessibility: 'mandatory'
      }
    };
    ctx.writeYaml(projectYamlPath, projectYaml);

    const stdOverrideRes = await cmdStandards(ctx, {});
    const a11yStd = stdOverrideRes.standards.find(s => s.standard === 'accessibility');
    assert.ok(a11yStd);
    assert.strictEqual(a11yStd.level, 'mandatory');
    assert.strictEqual(a11yStd.source, 'project-override');

    // 4. cmdProfile - Inspect valid profile
    const profileRes = await cmdProfile(ctx, { name: 'web-app' });
    assert.strictEqual(profileRes.profile.id, 'web-app');
    assert.ok(profileRes.profile.name);
    assert.ok(profileRes.profile.techStack);

    // 5. cmdProfile - Non-existent profile
    const badProfileRes = await cmdProfile(ctx, { name: 'non-existent-profile-xyz' });
    assert.ok(badProfileRes.error);

    // 6. cmdDiscover - Run discovery workflow
    const discoverRes = await cmdDiscover(ctx, {});
    assert.ok(discoverRes.recommendations || discoverRes.phases || discoverRes.profile);

    // 7. cmdQuestion - Contextual architectural questions
    const questionRes = await cmdQuestion(ctx, {});
    assert.ok(Array.isArray(questionRes.questions));
    assert.ok(questionRes.questions.length > 0);

    // 8. cmdGetContext - Summarized context for agent injection
    const contextRes = await cmdGetContext(ctx, {});
    assert.ok(contextRes.project || contextRes.summary || contextRes.name);

    // 9. cmdInstall - Local installation scope
    const installRes = await cmdInstall(ctx, { scope: 'local', force: true });
    assert.strictEqual(installRes.success, true);
    assert.ok(fs.existsSync(installRes.path));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Extended CLI Handlers - Coverage, Legacy Mapping & Git Pre-commit Hooks', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-sync-hook-test-'));
  const ctx = new SkyhookContext(tmpDir);

  try {
    await cmdInit(ctx, { name: 'Sync Hook Project' });

    // Setup source files: one traced, one untraced
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, 'auth.js'), `
// @skyhook-implements REQ-AUTH-01
export function login(user, pass) {
  return true;
}
`);

    fs.writeFileSync(path.join(srcDir, 'utils.js'), `
export function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}
`);

    // 1. cmdCoverage - Dark matter analysis
    const covRes = await cmdCoverage(ctx, {});
    assert.ok(covRes.summary);
    assert.ok(covRes.summary.totalSymbols >= 2);
    assert.ok(covRes.darkMatter.length >= 1);

    // 2. cmdMapLegacy - Legacy symbol candidate mapping
    const mapRes = await cmdMapLegacy(ctx, {});
    assert.ok(mapRes.legacySymbols);
    assert.ok(mapRes.legacySymbols.length >= 1);

    // 3. Git pre-commit hooks via cmdHook*
    const gitDir = path.join(tmpDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });

    // Initial status: not installed
    const statusBefore = await cmdHookStatus(ctx, {});
    assert.strictEqual(statusBefore.hookInstalled, false);

    // Install hook
    const installHookRes = await cmdHookInstall(ctx, {});
    assert.strictEqual(installHookRes.success, true);
    assert.ok(fs.existsSync(installHookRes.hookPath));

    // Status: installed
    const statusMid = await cmdHookStatus(ctx, {});
    assert.strictEqual(statusMid.hookInstalled, true);

    // Uninstall hook
    const uninstallHookRes = await cmdHookUninstall(ctx, {});
    assert.strictEqual(uninstallHookRes.success, true);

    // Status: not installed
    const statusAfter = await cmdHookStatus(ctx, {});
    assert.strictEqual(statusAfter.hookInstalled, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
