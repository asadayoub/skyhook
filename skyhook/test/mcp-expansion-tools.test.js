import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MCPServer } from '../lib/harness/mcp/MCPServer.js';
import { cmdInit } from '../lib/handlers/general.js';
import { createSkyhookContext } from '../lib/context.js';

test('MCP Expansion Tools - Full-Lifecycle Autonomous Capability Suite', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-mcp-expansion-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');

  try {
    // 1. Initialize temporary workspace
    await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'MCP Expansion Project', profile: 'web-app' });
    const ctx = createSkyhookContext(tmpDir);
    const server = new MCPServer({ projectDir: tmpDir, context: ctx });

    // Helper to call tool via JSON-RPC
    let rpcId = 100;
    const callTool = async (name, args = {}) => {
      rpcId++;
      const res = await server.handleRequest({
        jsonrpc: '2.0',
        id: rpcId,
        method: 'tools/call',
        params: { name, arguments: args }
      });
      assert.strictEqual(res.jsonrpc, '2.0');
      assert.strictEqual(res.id, rpcId);
      assert.ok(res.result, `Expected result for tool ${name}`);
      assert.ok(!res.result.isError, `Tool ${name} returned unexpected error: ${JSON.stringify(res.result)}`);
      assert.ok(res.result.content && res.result.content[0], `Expected content for tool ${name}`);
      const text = res.result.content[0].text;
      try {
        return JSON.parse(text);
      } catch (_) {
        return text;
      }
    };

    // 2. Test tools/list exposes all tools
    const listRes = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    });
    const toolNames = listRes.result.tools.map(t => t.name);
    assert.ok(toolNames.length >= 28, `Expected at least 28 tools, found ${toolNames.length}`);
    assert.ok(toolNames.includes('skyhook_init_project'));
    assert.ok(toolNames.includes('skyhook_get_profile'));
    assert.ok(toolNames.includes('skyhook_manage_tech_stack'));
    assert.ok(toolNames.includes('skyhook_create_requirement'));
    assert.ok(toolNames.includes('skyhook_list_standards'));
    assert.ok(toolNames.includes('skyhook_view_standard'));
    assert.ok(toolNames.includes('skyhook_verify_standards'));
    assert.ok(toolNames.includes('skyhook_create_standard'));
    assert.ok(toolNames.includes('skyhook_list_features'));
    assert.ok(toolNames.includes('skyhook_add_feature'));
    assert.ok(toolNames.includes('skyhook_create_story'));
    assert.ok(toolNames.includes('skyhook_get_blockers'));
    assert.ok(toolNames.includes('skyhook_draft_adr'));
    assert.ok(toolNames.includes('skyhook_sync_adr'));
    assert.ok(toolNames.includes('skyhook_supersede_adr'));
    assert.ok(toolNames.includes('skyhook_get_adr_dag'));
    assert.ok(toolNames.includes('skyhook_adopt_drift'));
    assert.ok(toolNames.includes('skyhook_get_c4_architecture'));
    assert.ok(toolNames.includes('skyhook_recompile_plan'));
    assert.ok(toolNames.includes('skyhook_get_plan'));
    assert.ok(toolNames.includes('skyhook_get_coverage'));
    assert.ok(toolNames.includes('skyhook_analyze_impact'));
    assert.ok(toolNames.includes('skyhook_find_untraced'));
    assert.ok(toolNames.includes('skyhook_map_legacy_symbol'));

    // --- DOMAIN 1: PLANNING & DISCOVERY ---
    // A. skyhook_init_project on existing workspace returns safe response
    const initRes = await callTool('skyhook_init_project', { name: 'Duplicate' });
    assert.ok(initRes.message.includes('already initialized') || initRes.initialized);

    // B. skyhook_get_profile
    const profileRes = await callTool('skyhook_get_profile', { name: 'web-app' });
    assert.strictEqual(profileRes.profile.id, 'web-app');
    assert.ok(profileRes.profile.techStack);

    // C. skyhook_manage_tech_stack (list, add, remove)
    const addTechRes = await callTool('skyhook_manage_tech_stack', {
      action: 'add',
      technology: { name: 'Prisma ORM', category: 'Database & ORM', version: '^5.0.0' }
    });
    assert.ok(addTechRes.message.includes('added to tech-stack.yaml'));

    const listTechRes = await callTool('skyhook_manage_tech_stack', { action: 'list' });
    assert.ok(listTechRes.technologies.some(t => t.name === 'Prisma ORM'));

    // D. skyhook_create_requirement & skyhook_list_requirements & skyhook_update_requirement
    const reqRes = await callTool('skyhook_create_requirement', {
      type: 'functional',
      statement: 'User must authenticate via OAuth2/OIDC',
      rationale: 'Secure federated sign-in',
      priority: 'high'
    });
    assert.ok(reqRes.requirement);
    assert.ok(reqRes.requirement.id.startsWith('REQ-'));

    const listReqsRes = await callTool('skyhook_list_requirements', { type: 'functional' });
    assert.ok(listReqsRes.requirements.some(r => r.id === reqRes.requirement.id));

    const updateReqRes = await callTool('skyhook_update_requirement', {
      reqId: reqRes.requirement.id,
      statement: 'User must authenticate via OAuth2/OIDC with PKCE',
      priority: 'critical'
    });
    assert.strictEqual(updateReqRes.requirement.priority, 'critical');

    // --- DOMAIN 2: MODULAR STANDARDS ---
    // A. skyhook_list_standards
    const standardsListRes = await callTool('skyhook_list_standards', { domain: 'security' });
    assert.ok(Array.isArray(standardsListRes.catalog));
    assert.ok(standardsListRes.catalog.some(s => s.id === 'STD-SEC-001'));

    // B. skyhook_view_standard
    const viewStdRes = await callTool('skyhook_view_standard', { id: 'STD-SEC-001' });
    assert.strictEqual(viewStdRes.standard.id, 'STD-SEC-001');
    assert.ok(Array.isArray(viewStdRes.standard.guidelines));
    assert.ok(Array.isArray(viewStdRes.standard.automatedRules));

    // C. skyhook_create_standard
    const createStdRes = await callTool('skyhook_create_standard', {
      id: 'STD-CUSTOM-001',
      title: 'Custom Clean Architecture Rule',
      domain: 'software',
      severity: 'error',
      description: 'Enforce domain purity in application layer',
      guidelines: ['Do not import infrastructure in domain layer']
    });
    assert.strictEqual(createStdRes.standard.id, 'STD-CUSTOM-001');

    // D. skyhook_verify_standards
    const verifyStdRes = await callTool('skyhook_verify_standards', {});
    assert.ok(verifyStdRes.summary);
    assert.ok(typeof verifyStdRes.pass === 'boolean');

    // --- DOMAIN 3: BACKLOG & FEATURES ---
    // A. skyhook_add_feature
    const addFeatureRes = await callTool('skyhook_add_feature', {
      title: 'Payment Integration',
      description: 'Stripe payments and checkout flow',
      stories: [
        { title: 'Create checkout session', priority: 'critical', acceptanceCriteria: ['Returns session URL'] }
      ]
    });
    assert.ok(addFeatureRes.success);
    assert.ok(addFeatureRes.epicId);

    // B. skyhook_create_story
    const createStoryRes = await callTool('skyhook_create_story', {
      epicId: addFeatureRes.epicId,
      title: 'Webhook handler for Stripe invoice payment',
      acceptanceCriteria: ['Verifies stripe signature', 'Idempotent processing'],
      priority: 'high',
      standards: ['STD-SEC-001'],
      dependsOn: addFeatureRes.storyIds || []
    });
    assert.ok(createStoryRes.story);
    assert.strictEqual(createStoryRes.story.title, 'Webhook handler for Stripe invoice payment');

    // C. skyhook_list_features
    const listFeaturesRes = await callTool('skyhook_list_features', { status: 'all' });
    assert.ok(Array.isArray(listFeaturesRes.features));
    assert.ok(listFeaturesRes.features.some(f => f.epic.id === addFeatureRes.epicId));

    // D. skyhook_get_blockers
    const blockersRes = await callTool('skyhook_get_blockers', {});
    assert.ok(Array.isArray(blockersRes.blockers));

    // E. skyhook_get_backlog_metrics
    const metricsRes = await callTool('skyhook_get_backlog_metrics', { limit: 10 });
    assert.ok(Array.isArray(metricsRes.events));

    // --- DOMAIN 4: ARCHITECTURE & ADRS ---
    // A. skyhook_record_decision
    const adr1Res = await callTool('skyhook_record_decision', {
      title: 'Use PostgreSQL for Primary Relational Store',
      decision: 'We will use PostgreSQL 16 hosted on Supabase',
      context: 'Need strong relational ACID semantics and JSON support',
      status: 'accepted'
    });
    assert.ok(adr1Res.decisionId);

    // B. skyhook_draft_adr
    const draftAdrRes = await callTool('skyhook_draft_adr', {
      title: 'Adopt Redis for Distributed Caching',
      decision: 'Use Valkey / Redis cluster for session caching',
      context: 'High database read contention on sessions'
    });
    assert.ok(draftAdrRes.file || draftAdrRes.message);

    // C. skyhook_supersede_adr
    const adr2Res = await callTool('skyhook_record_decision', {
      title: 'Migrate to CockroachDB for Global Scale',
      decision: 'We will use CockroachDB instead of PostgreSQL',
      context: 'Multi-region active-active deployment requirements',
      status: 'accepted'
    });
    const supersedeRes = await callTool('skyhook_supersede_adr', {
      oldId: adr1Res.decisionId,
      newId: adr2Res.decisionId,
      reason: 'Global multi-region expansion required active-active consensus'
    });
    assert.strictEqual(supersedeRes.oldId, adr1Res.decisionId);
    assert.strictEqual(supersedeRes.newId, adr2Res.decisionId);

    // D. skyhook_get_adr_dag
    const dagRes = await callTool('skyhook_get_adr_dag', { format: 'mermaid' });
    assert.ok(dagRes.mermaid && (dagRes.mermaid.includes('flowchart') || dagRes.mermaid.includes('graph')));

    // E. skyhook_sync_adr
    const syncAdrRes = await callTool('skyhook_sync_adr', {});
    assert.ok(syncAdrRes.message.includes('synchronized'));

    // --- DOMAIN 5: ARCHITECTURE DRIFT & C4 ---
    // A. skyhook_adopt_drift
    const adoptRes = await callTool('skyhook_adopt_drift', {
      technologies: [{ name: 'TailwindCSS', category: 'Styling' }]
    });
    assert.ok(adoptRes.success);

    // B. skyhook_get_c4_architecture
    const c4Res = await callTool('skyhook_get_c4_architecture', { level: 'all' });
    assert.ok(c4Res.mermaidContainer || c4Res.mermaidComponent || c4Res.level);

    // --- DOMAIN 6: LIVING PLAN ---
    // A. skyhook_recompile_plan
    const recompileRes = await callTool('skyhook_recompile_plan', { all: true });
    assert.ok(recompileRes.path || recompileRes.message);

    // B. skyhook_get_plan
    const getPlanRes = await callTool('skyhook_get_plan', {});
    assert.ok(getPlanRes.content || getPlanRes.path);

    // --- DOMAIN 7: TRACEABILITY & DARK MATTER ---
    // A. skyhook_get_coverage
    const covRes = await callTool('skyhook_get_coverage', {});
    assert.ok(covRes.summary);

    // B. skyhook_find_untraced
    const untracedRes = await callTool('skyhook_find_untraced', {});
    assert.ok(Array.isArray(untracedRes.untraced) || Array.isArray(untracedRes));

    // C. skyhook_analyze_impact
    const impactRes = await callTool('skyhook_analyze_impact', { id: reqRes.requirement.id });
    assert.ok(impactRes.requirementId || impactRes.requirement);

    // D. skyhook_map_legacy_symbol
    const legacyRes = await callTool('skyhook_map_legacy_symbol', { limit: 5 });
    assert.ok(Array.isArray(legacyRes.legacySymbols));

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
