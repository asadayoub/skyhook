import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SystemDoctor } from '../lib/diagnostics/SystemDoctor.js';
import { cmdDoctor } from '../lib/handlers/general.js';
import { MCPToolRegistry } from '../lib/harness/mcp/MCPToolRegistry.js';
import { registerCoreTools } from '../lib/harness/mcp/tools/coreTools.js';
import { createSkyhookContext } from '../lib/context.js';
import { cmdInit } from '../lib/handlers/general.js';

describe('TASK-C08: Interactive System Health & Diagnostics Engine (skyhook doctor)', () => {
  it('runDiagnostics returns structured report on initialized project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-doctor-init-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Doctor Test Proj', profile: 'web-app' });

      const report = await SystemDoctor.runDiagnostics({
        projectDir: tmpDir,
        skyhookDir
      });

      assert.strictEqual(report.healthy, true);
      assert.strictEqual(report.totalChecks, 7);
      assert.ok(report.passedChecks >= 5);
      assert.strictEqual(report.failedChecks, 0);

      const nodeCheck = report.checks.find(c => c.id === 'node_runtime');
      assert.strictEqual(nodeCheck.status, 'pass');

      const projCheck = report.checks.find(c => c.id === 'project_init');
      assert.strictEqual(projCheck.status, 'pass');
      assert.ok(projCheck.message.includes('Doctor Test Proj'));

      const backlogCheck = report.checks.find(c => c.id === 'backlog_integrity');
      assert.strictEqual(backlogCheck.status, 'pass');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runDiagnostics detects missing .skyhook project and provides remediation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-doctor-uninit-'));
    try {
      const report = await SystemDoctor.runDiagnostics({
        projectDir: tmpDir,
        skyhookDir: path.join(tmpDir, '.skyhook')
      });

      const projCheck = report.checks.find(c => c.id === 'project_init');
      assert.strictEqual(projCheck.status, 'warn');
      assert.strictEqual(projCheck.remediation, 'Run: skyhook init');

      const backlogCheck = report.checks.find(c => c.id === 'backlog_integrity');
      assert.strictEqual(backlogCheck.status, 'warn');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runDiagnostics detects corrupted backlog and reports schema failure', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-doctor-corrupt-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Corrupt Test Proj' });

      // Corrupt epics.yaml
      const epicsFile = path.join(skyhookDir, 'backlog', 'epics.yaml');
      fs.writeFileSync(epicsFile, 'epics:\n  - invalid: [unclosed array\n', 'utf-8');

      const report = await SystemDoctor.runDiagnostics({
        projectDir: tmpDir,
        skyhookDir
      });

      assert.strictEqual(report.healthy, false);
      assert.strictEqual(report.failedChecks, 1);

      const backlogCheck = report.checks.find(c => c.id === 'backlog_integrity');
      assert.strictEqual(backlogCheck.status, 'fail');
      assert.ok(backlogCheck.remediation.includes('epics.yaml'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('formatReport formats terminal output with scorecard and status line', async () => {
    const report = {
      healthy: true,
      totalChecks: 2,
      passedChecks: 2,
      failedChecks: 0,
      warningChecks: 0,
      checks: [
        { id: 'node_runtime', name: 'Node.js Runtime', status: 'pass', message: 'v20.0.0 (supported)', remediation: null },
        { id: 'git_hooks', name: 'Git Lifecycle Hooks', status: 'pass', message: 'Active', remediation: null }
      ]
    };

    const formatted = SystemDoctor.formatReport(report, { useColor: false });
    assert.ok(formatted.includes('Skyhook Diagnostic Health Check'));
    assert.ok(formatted.includes('[✓] Node.js Runtime:'));
    assert.ok(formatted.includes('100% HEALTHY'));
  });

  it('cmdDoctor handler returns success and formatted summary', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-doctor-handler-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'Handler Test Proj' });
      const ctx = createSkyhookContext(tmpDir);

      const result = await cmdDoctor(ctx, { noColor: true });
      assert.strictEqual(result.success, true);
      assert.ok(result.report);
      assert.ok(result.summary.includes('Skyhook Diagnostic Health Check'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('MCP tool skyhook_doctor executes and returns diagnostic results', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-doctor-mcp-'));
    try {
      const skyhookDir = path.join(tmpDir, '.skyhook');
      await cmdInit({ skyhookDir, projectDir: tmpDir }, { name: 'MCP Test Proj' });
      const ctx = createSkyhookContext(tmpDir);

      const registry = new MCPToolRegistry();
      registerCoreTools(registry);

      const doctorTool = registry.get('skyhook_doctor');
      assert.ok(doctorTool, 'skyhook_doctor tool must be registered');

      const toolResult = await doctorTool.execute({}, ctx);
      assert.ok(toolResult.content);
      const parsed = JSON.parse(toolResult.content[0].text);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.report.totalChecks, 7);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

