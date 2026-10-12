import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ADRPolicyGuard } from '../lib/adr/ADRPolicyGuard.js';

function setupMockPolyglotRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-polyglot-adr-test-'));
  const skyhookDir = path.join(tmpDir, '.skyhook');
  fs.mkdirSync(skyhookDir, { recursive: true });

  const pyDir = path.join(tmpDir, 'services');
  fs.mkdirSync(pyDir, { recursive: true });

  const goDir = path.join(tmpDir, 'internal', 'db');
  fs.mkdirSync(goDir, { recursive: true });

  const rsDir = path.join(tmpDir, 'crates', 'engine');
  fs.mkdirSync(rsDir, { recursive: true });

  const javaDir = path.join(tmpDir, 'src', 'main', 'java');
  fs.mkdirSync(javaDir, { recursive: true });

  return { tmpDir, skyhookDir, pyDir, goDir, rsDir, javaDir };
}

test('TASK-F07: ADRPolicyGuard detects prohibited import in Python file', async () => {
  const { tmpDir, skyhookDir, pyDir } = setupMockPolyglotRepo();

  try {
    fs.writeFileSync(path.join(pyDir, 'fetcher.py'), `
import os
import requests

def get_data(url):
    return requests.get(url).json()
`, 'utf-8');

    const decisions = [
      {
        id: 'ADR-PY-01',
        title: 'Deprecate Requests in favor of httpx',
        status: 'accepted',
        enforcement: {
          rules: [
            {
              prohibitedImports: ['requests'],
              violationMessage: 'Use httpx instead of requests in Python services.'
            }
          ]
        }
      }
    ];

    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const res = await guard.verifyPolicies(decisions);

    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.violations.length, 1);
    assert.strictEqual(res.violations[0].adrId, 'ADR-PY-01');
    assert.ok(res.violations[0].file.includes('fetcher.py'));
    assert.ok(res.violations[0].message.includes('Use httpx instead of requests'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F07: ADRPolicyGuard detects boundary violation in Go file', async () => {
  const { tmpDir, skyhookDir, goDir } = setupMockPolyglotRepo();

  try {
    fs.writeFileSync(path.join(goDir, 'store.go'), `
package db

import (
    "database/sql"
    "net/http"
)

type Store struct{}
`, 'utf-8');

    const decisions = [
      {
        id: 'ADR-GO-02',
        title: 'DB Layer Isolation',
        status: 'accepted',
        enforcement: {
          rules: [
            {
              restrictDir: true,
              forbiddenInDir: 'internal/db',
              forbiddenImports: ['net/http'],
              violationMessage: 'DB layer must not import HTTP client/server packages.'
            }
          ]
        }
      }
    ];

    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const res = await guard.verifyPolicies(decisions);

    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.violations.length, 1);
    assert.strictEqual(res.violations[0].adrId, 'ADR-GO-02');
    assert.ok(res.violations[0].file.includes('store.go'));
    assert.ok(res.violations[0].message.includes('DB layer must not import HTTP'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F07: ADRPolicyGuard detects prohibited crate in Rust file', async () => {
  const { tmpDir, skyhookDir, rsDir } = setupMockPolyglotRepo();

  try {
    fs.writeFileSync(path.join(rsDir, 'mod.rs'), `
use std::fs;
use serde_json::Value;

pub fn read_config() -> Value {
    let content = fs::read_to_string("config.json").unwrap();
    serde_json::from_str(&content).unwrap()
}
`, 'utf-8');

    const decisions = [
      {
        id: 'ADR-RS-03',
        title: 'Virtual Filesystem Enforcement',
        status: 'accepted',
        enforcement: {
          rules: [
            {
              prohibitedImports: ['std::fs'],
              violationMessage: 'Direct std::fs is prohibited. Use VirtualFileSystem.'
            }
          ]
        }
      }
    ];

    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const res = await guard.verifyPolicies(decisions);

    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.violations.length, 1);
    assert.strictEqual(res.violations[0].adrId, 'ADR-RS-03');
    assert.ok(res.violations[0].file.includes('mod.rs'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F07: ADRPolicyGuard detects prohibited package in Java file', async () => {
  const { tmpDir, skyhookDir, javaDir } = setupMockPolyglotRepo();

  try {
    fs.writeFileSync(path.join(javaDir, 'UserService.java'), `
package com.example.service;

import java.sql.DriverManager;
import java.util.List;

public class UserService {
}
`, 'utf-8');

    const decisions = [
      {
        id: 'ADR-JAVA-04',
        title: 'Connection Pooling Required',
        status: 'accepted',
        enforcement: {
          rules: [
            {
              prohibitedImports: ['java.sql.DriverManager'],
              violationMessage: 'Direct DriverManager prohibited. Use HikariDataSource.'
            }
          ]
        }
      }
    ];

    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const res = await guard.verifyPolicies(decisions);

    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.violations.length, 1);
    assert.strictEqual(res.violations[0].adrId, 'ADR-JAVA-04');
    assert.ok(res.violations[0].file.includes('UserService.java'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F07: ADRPolicyGuard findSourceFiles discovers polyglot extensions', () => {
  const { tmpDir, skyhookDir, pyDir, goDir, rsDir, javaDir } = setupMockPolyglotRepo();

  try {
    fs.writeFileSync(path.join(pyDir, 'test.py'), '# python', 'utf-8');
    fs.writeFileSync(path.join(goDir, 'test.go'), '// go', 'utf-8');
    fs.writeFileSync(path.join(rsDir, 'test.rs'), '// rust', 'utf-8');
    fs.writeFileSync(path.join(javaDir, 'Test.java'), '// java', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'ignored.txt'), 'txt', 'utf-8');

    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const files = guard.findSourceFiles(tmpDir);

    const basenames = files.map(f => path.basename(f));
    assert.ok(basenames.includes('test.py'));
    assert.ok(basenames.includes('test.go'));
    assert.ok(basenames.includes('test.rs'));
    assert.ok(basenames.includes('Test.java'));
    assert.strictEqual(basenames.includes('ignored.txt'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-F07: ADRPolicyGuard passes when polyglot files comply with policies', async () => {
  const { tmpDir, skyhookDir, pyDir, goDir } = setupMockPolyglotRepo();

  try {
    fs.writeFileSync(path.join(pyDir, 'client.py'), 'import httpx\n', 'utf-8');
    fs.writeFileSync(path.join(goDir, 'repo.go'), 'package db\nimport "database/sql"\n', 'utf-8');

    const decisions = [
      {
        id: 'ADR-01',
        title: 'Prohibit requests',
        status: 'accepted',
        enforcement: {
          rules: [{ prohibitedImports: ['requests'] }]
        }
      }
    ];

    const guard = new ADRPolicyGuard(skyhookDir, tmpDir);
    const res = await guard.verifyPolicies(decisions);

    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.violations.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
