import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CMD_BIN = path.resolve(__dirname, '../cli/skyhook-cmd.js');

function runProtocolJson(payload, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CMD_BIN], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', code => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    proc.stdin.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    proc.stdin.end();
  });
}

function runProtocolArgv(args, cwd) {
  return new Promise((resolve) => {
    exec(`node ${CMD_BIN} ${args.join(' ')}`, { cwd }, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code || 1 : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

test('CLI Stdio JSON Protocol - Happy Path & Command Matrix', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-protocol-test-'));

  try {
    // 1. Initialize project via protocol
    const initRes = await runProtocolJson({
      command: 'init',
      projectDir: tmpDir,
      args: { name: 'Protocol Test Project' }
    }, tmpDir);
    assert.strictEqual(initRes.code, 0, `Init stderr: ${initRes.stderr}`);
    const initData = JSON.parse(initRes.stdout);
    assert.ok(initData.success || initData.message);

    // 2. Add a feature with a child story
    const addRes = await runProtocolJson({
      command: 'addFeature',
      projectDir: tmpDir,
      args: {
        title: 'Authentication Module',
        stories: [
          { title: 'JWT Sign In', storyPoints: 5, acceptanceCriteria: ['Returns valid token'] }
        ]
      }
    }, tmpDir);
    assert.strictEqual(addRes.code, 0, `AddFeature stderr: ${addRes.stderr}`);
    const addData = JSON.parse(addRes.stdout);
    assert.ok(addData.epicId);
    assert.strictEqual(addData.storyIds.length, 1);
    const storyId = addData.storyIds[0];

    // 3. Update story status to 'ready'
    const updateRes = await runProtocolJson({
      command: 'updateStatus',
      projectDir: tmpDir,
      args: { storyId, status: 'ready' }
    }, tmpDir);
    assert.strictEqual(updateRes.code, 0, `UpdateStatus stderr: ${updateRes.stderr}`);
    const updateData = JSON.parse(updateRes.stdout);
    assert.strictEqual(updateData.status, 'ready');

    // 4. Get next task (leases task to agent)
    const nextTaskRes = await runProtocolJson({
      command: 'getNextTask',
      projectDir: tmpDir,
      args: { agent: 'copilot-agent' }
    }, tmpDir);
    assert.strictEqual(nextTaskRes.code, 0, `GetNextTask stderr: ${nextTaskRes.stderr}`);
    const nextTaskData = JSON.parse(nextTaskRes.stdout);
    assert.strictEqual(nextTaskData.task.id, storyId);
    assert.strictEqual(nextTaskData.task.title, 'JWT Sign In');

    // 5. Release lease
    const releaseRes = await runProtocolJson({
      command: 'releaseLease',
      projectDir: tmpDir,
      args: { storyId, agent: 'copilot-agent' }
    }, tmpDir);
    assert.strictEqual(releaseRes.code, 0, `ReleaseLease stderr: ${releaseRes.stderr}`);
    const releaseData = JSON.parse(releaseRes.stdout);
    assert.strictEqual(releaseData.success, true);

    // 6. Record architectural decision (ADR)
    const decideRes = await runProtocolJson({
      command: 'recordDecision',
      projectDir: tmpDir,
      args: {
        title: 'Use Argon2 For Hashing',
        decision: 'We will use Argon2id for password hashing.',
        context: 'Need secure, memory-hard key derivation.'
      }
    }, tmpDir);
    assert.strictEqual(decideRes.code, 0, `RecordDecision stderr: ${decideRes.stderr}`);
    const decideData = JSON.parse(decideRes.stdout);
    assert.ok(decideData.decisionId || decideData.message);

    // 7. Check ADR DAG and policy compilation commands
    const dagRes = await runProtocolJson({
      command: 'dagAdr',
      projectDir: tmpDir,
      args: {}
    }, tmpDir);
    assert.strictEqual(dagRes.code, 0, `dagAdr stderr: ${dagRes.stderr}`);

    const compileRes = await runProtocolJson({
      command: 'compileAdr',
      projectDir: tmpDir,
      args: {}
    }, tmpDir);
    assert.strictEqual(compileRes.code, 0, `compileAdr stderr: ${compileRes.stderr}`);

    // 8. Check drift & boundaries commands
    const driftRes = await runProtocolJson({
      command: 'drift',
      projectDir: tmpDir,
      args: { json: true }
    }, tmpDir);
    assert.strictEqual(driftRes.code, 0, `Drift stderr: ${driftRes.stderr}`);
    const driftData = JSON.parse(driftRes.stdout);
    assert.ok(driftData.healthScore !== undefined);

    const boundariesRes = await runProtocolJson({
      command: 'boundaries',
      projectDir: tmpDir,
      args: { json: true }
    }, tmpDir);
    assert.strictEqual(boundariesRes.code, 0, `Boundaries stderr: ${boundariesRes.stderr}`);

    // 9. Check getContext command
    const contextRes = await runProtocolJson({
      command: 'getContext',
      projectDir: tmpDir,
      args: {}
    }, tmpDir);
    assert.strictEqual(contextRes.code, 0, `GetContext stderr: ${contextRes.stderr}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI Stdio JSON Protocol - Error Handling & Edge Cases', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-protocol-err-'));

  try {
    // 1. Unknown command error
    const unknownRes = await runProtocolJson({
      command: 'unknownNonExistentCommand',
      args: {}
    }, tmpDir);
    assert.strictEqual(unknownRes.code, 1);
    const unknownErr = JSON.parse(unknownRes.stderr);
    assert.ok(unknownErr.error.includes("Unknown command 'unknownNonExistentCommand'"));

    // 2. Missing command field
    const missingCmdRes = await runProtocolJson({
      args: { test: true }
    }, tmpDir);
    assert.strictEqual(missingCmdRes.code, 1);
    const missingCmdErr = JSON.parse(missingCmdRes.stderr);
    assert.ok(missingCmdErr.error.includes("Missing 'command' field"));

    // 3. Malformed JSON syntax
    const malformedRes = await runProtocolJson('{ invalid json: true }', tmpDir);
    assert.strictEqual(malformedRes.code, 1);
    const malformedErr = JSON.parse(malformedRes.stderr);
    assert.ok(malformedErr.error.includes('Invalid JSON provided'));

    // 4. Empty input
    const emptyRes = await runProtocolJson('   ', tmpDir);
    assert.strictEqual(emptyRes.code, 1);
    const emptyErr = JSON.parse(emptyRes.stderr);
    assert.ok(emptyErr.error.includes('No input provided'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CLI Positional Argv Mode - Execution & Version Info', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-argv-test-'));

  try {
    // 1. Run version command
    const verRes = await runProtocolArgv(['version'], tmpDir);
    assert.strictEqual(verRes.code, 0);
    assert.ok(verRes.stdout.includes('version') || verRes.stdout.includes('Skyhook'));

    // 2. Run help command
    const helpRes = await runProtocolArgv(['help'], tmpDir);
    assert.strictEqual(helpRes.code, 0);
    assert.ok(helpRes.stdout.includes('commands') || helpRes.stdout.includes('listCurrentFeatures') || helpRes.stdout.includes('Usage'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
