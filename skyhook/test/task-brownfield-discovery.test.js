import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SkyhookContext } from '../lib/context.js';
import { cmdDiscover } from '../lib/handlers/general.js';
import { cmdMapLegacy } from '../lib/handlers/sync.js';
import { readYaml } from '../lib/utils.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { registerPlanningTools } from '../lib/harness/mcp/tools/planningTools.js';
import { registerTraceTools } from '../lib/harness/mcp/tools/traceTools.js';

function setupBrownfieldRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-brownfield-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(skyhookDir, 'backlog'), { recursive: true });

  fs.writeFileSync(path.join(skyhookDir, 'project.yaml'), 'name: brownfield-app\nprofile: web-app\n');

  // Package manifest
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
    name: 'brownfield-app',
    dependencies: {
      express: '^4.19.0',
      pg: '^8.11.0'
    }
  }, null, 2));

  // Source directories
  const authDir = path.join(tmpDir, 'src', 'auth');
  const billDir = path.join(tmpDir, 'src', 'billing');
  const userDir = path.join(tmpDir, 'src', 'users');

  fs.mkdirSync(authDir, { recursive: true });
  fs.mkdirSync(billDir, { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });

  fs.writeFileSync(path.join(authDir, 'jwt.js'), `
export class TokenService {
  generateToken(userId) { return 'tok'; }
  verifyToken(tok) { return true; }
}
`);

  fs.writeFileSync(path.join(billDir, 'stripe.js'), `
export class StripeGateway {
  charge(amount) { return { success: true }; }
  refund(chargeId) { return { success: true }; }
}
`);

  fs.writeFileSync(path.join(userDir, 'userService.js'), `
export class UserService {
  getUser(id) { return { id }; }
  deleteUser(id) { return true; }
}
`);

  const ctx = new SkyhookContext(tmpDir);
  return { tmpDir, skyhookDir, ctx };
}

test('TASK-F11: cmdDiscover --auto clusters domains and synthesizes candidate requirements', async () => {
  const { tmpDir, ctx } = setupBrownfieldRepo();

  try {
    const res = await cmdDiscover(ctx, { auto: true });

    assert.ok(res.message.includes('Automated brownfield discovery completed'));
    assert.strictEqual(res.inferredStack.framework, 'Express');
    assert.strictEqual(res.inferredStack.database, 'PostgreSQL');

    // Domains
    const domains = res.discoveredDomains.map(d => d.domain);
    assert.ok(domains.includes('auth'), 'Should discover auth domain');
    assert.ok(domains.includes('billing'), 'Should discover billing domain');
    assert.ok(domains.includes('users'), 'Should discover users domain');

    // Candidate requirements
    const reqIds = res.candidateRequirements.map(r => r.id);
    assert.ok(reqIds.includes('REQ-AUTH-001'));
    assert.ok(reqIds.includes('REQ-BILLING-001'));
    assert.ok(reqIds.includes('REQ-USERS-001'));

    assert.strictEqual(res.written, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F11: cmdDiscover --auto --write persists candidate requirements into functional.yaml', async () => {
  const { tmpDir, skyhookDir, ctx } = setupBrownfieldRepo();

  try {
    const res = await cmdDiscover(ctx, { auto: true, write: true });
    assert.strictEqual(res.written, true);

    const savedReqs = readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml'));
    assert.ok(savedReqs && savedReqs.requirements);
    assert.strictEqual(savedReqs.requirements.length >= 3, true);

    const authReq = savedReqs.requirements.find(r => r.id === 'REQ-AUTH-001');
    assert.ok(authReq);
    assert.strictEqual(authReq.source, 'auto-discovery');

    // Run again with write to ensure idempotency
    const secondRes = await cmdDiscover(ctx, { auto: true, write: true });
    const secondSaved = readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml'));
    assert.strictEqual(secondSaved.requirements.length, savedReqs.requirements.length);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F11: cmdMapLegacy --synthesize groups legacy symbols into epics, stories, and tasks', async () => {
  const { tmpDir, ctx } = setupBrownfieldRepo();

  try {
    const res = await cmdMapLegacy(ctx, { synthesize: true });

    assert.ok(res.message.includes('Synthesized'));
    assert.strictEqual(res.written, false);

    const epicIds = res.synthesizedEpics.map(e => e.id);
    assert.ok(epicIds.includes('EPIC-AUTH'));
    assert.ok(epicIds.includes('EPIC-BILLING'));
    assert.ok(epicIds.includes('EPIC-USERS'));

    const storyIds = res.synthesizedStories.map(s => s.id);
    assert.ok(storyIds.includes('STORY-AUTH-01'));
    assert.ok(storyIds.includes('STORY-BILLING-01'));
    assert.ok(storyIds.includes('STORY-USERS-01'));

    const authTask = res.synthesizedTasks.find(t => t.id === 'TASK-AUTH-01');
    assert.ok(authTask);
    assert.ok(authTask.targetFiles.some(f => f.includes('jwt.js')));
    assert.ok(authTask.subtasks.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F11: cmdMapLegacy --synthesize --write persists items into backlog epics.yaml', async () => {
  const { tmpDir, skyhookDir, ctx } = setupBrownfieldRepo();

  try {
    const res = await cmdMapLegacy(ctx, { synthesize: true, write: true });
    assert.strictEqual(res.written, true);

    const backlog = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml'));
    assert.ok(backlog);
    assert.ok(backlog.epics.some(e => e.id === 'EPIC-AUTH'));
    assert.ok(backlog.stories.some(s => s.id === 'STORY-AUTH-01'));
    assert.ok(backlog.tasks.some(t => t.id === 'TASK-AUTH-01'));

    // Context readBacklog can read it seamlessly
    const loadedBacklog = ctx.readBacklog();
    assert.strictEqual(loadedBacklog.epics.length, backlog.epics.length);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F11: MCP tools skyhook_run_discovery and skyhook_map_legacy_symbol execute synthesis', async () => {
  const { tmpDir, skyhookDir, ctx } = setupBrownfieldRepo();

  try {
    const registry = new MCPToolRegistry();
    registerPlanningTools(registry);
    registerTraceTools(registry);

    // 1. skyhook_run_discovery with autoScan: true, write: true
    const discTool = registry.get('skyhook_run_discovery');
    const discRes = await discTool.execute({ autoScan: true, write: true }, ctx);
    assert.ok(!discRes.isError);
    const discData = JSON.parse(discRes.content[0].text);
    assert.strictEqual(discData.written, true);
    assert.ok(discData.candidateRequirements.length >= 3);

    // 2. skyhook_map_legacy_symbol with synthesize: true, write: true
    const mapTool = registry.get('skyhook_map_legacy_symbol');
    const mapRes = await mapTool.execute({ synthesize: true, write: true }, ctx);
    assert.ok(!mapRes.isError);
    const mapData = JSON.parse(mapRes.content[0].text);
    assert.strictEqual(mapData.written, true);
    assert.ok(mapData.synthesizedEpics.length >= 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
