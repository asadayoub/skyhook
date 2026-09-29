import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PythonParser } from '../lib/parsers/PythonParser.js';
import { GoParser } from '../lib/parsers/GoParser.js';
import { RustParser } from '../lib/parsers/RustParser.js';
import { JavaParser } from '../lib/parsers/JavaParser.js';

test('PythonParser: extracts classes, functions, async defs, docstrings, and decorators', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-test-py-'));
  const pyFile = path.join(tmpDir, 'service.py');

  const pyCode = `
# @skyhook-implements REQ-AUTH-01
class AuthService:
    """Authentication and authorization service"""
    def __init__(self):
        self.secret = "key"

    @property
    def is_ready(self):
        return True

    # @skyhook-implements REQ-AUTH-02
    @router.post("/login")
    async def login_user(self, username: str) -> bool:
        """@skyhook-implements REQ-AUTH-03"""
        return True

def untraced_helper():
    pass
`;

  fs.writeFileSync(pyFile, pyCode);

  try {
    const parser = new PythonParser();
    const symbols = await parser.parse(pyFile, tmpDir);

    // Verify AuthService class
    const authClass = symbols.find(s => s.symbolName === 'AuthService');
    assert.ok(authClass);
    assert.strictEqual(authClass.symbolType, 'class');
    assert.strictEqual(authClass.requirementId, 'REQ-AUTH-01');
    assert.strictEqual(authClass.traced, true);

    // Verify __init__ method
    const initMethod = symbols.find(s => s.symbolName === '__init__');
    assert.ok(initMethod);
    assert.strictEqual(initMethod.symbolType, 'method');
    assert.strictEqual(initMethod.parentSymbol, 'AuthService');
    assert.strictEqual(initMethod.traced, false); // Untraced symbol captured!

    // Verify is_ready method with decorator
    const readyMethod = symbols.find(s => s.symbolName === 'is_ready');
    assert.ok(readyMethod);
    assert.ok(readyMethod.metadata.decorators.includes('@property'));

    // Verify login_user async method
    const loginMethod = symbols.find(s => s.symbolName === 'login_user');
    assert.ok(loginMethod);
    assert.strictEqual(loginMethod.symbolType, 'method');
    assert.strictEqual(loginMethod.metadata.isAsync, true);
    assert.ok(loginMethod.requirementId.startsWith('REQ-AUTH-'));
    assert.strictEqual(loginMethod.traced, true);

    // Verify untraced standalone function
    const helperFunc = symbols.find(s => s.symbolName === 'untraced_helper');
    assert.ok(helperFunc);
    assert.strictEqual(helperFunc.symbolType, 'function');
    assert.strictEqual(helperFunc.traced, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GoParser: extracts package functions, receiver methods, structs, and interfaces', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-test-go-'));
  const goFile = path.join(tmpDir, 'server.go');

  const goCode = `
package main

// @skyhook-implements REQ-NET-01
type Server struct {
    port int
}

type Router interface {
    Route() string
}

// @skyhook-implements REQ-NET-02
func (s *Server) Start() error {
    return nil
}

func HelperInit() {
    // untraced function
}
`;

  fs.writeFileSync(goFile, goCode);

  try {
    const parser = new GoParser();
    const symbols = await parser.parse(goFile, tmpDir);

    // Verify struct
    const serverStruct = symbols.find(s => s.symbolName === 'Server');
    assert.ok(serverStruct);
    assert.strictEqual(serverStruct.symbolType, 'struct');
    assert.strictEqual(serverStruct.requirementId, 'REQ-NET-01');

    // Verify interface
    const routerIface = symbols.find(s => s.symbolName === 'Router');
    assert.ok(routerIface);
    assert.strictEqual(routerIface.symbolType, 'interface');
    assert.strictEqual(routerIface.traced, false);

    // Verify method on receiver
    const startMethod = symbols.find(s => s.symbolName === 'Start');
    assert.ok(startMethod);
    assert.strictEqual(startMethod.symbolType, 'method');
    assert.strictEqual(startMethod.parentSymbol, 'Server');
    assert.strictEqual(startMethod.requirementId, 'REQ-NET-02');

    // Verify untraced package function
    const helperFunc = symbols.find(s => s.symbolName === 'HelperInit');
    assert.ok(helperFunc);
    assert.strictEqual(helperFunc.symbolType, 'function');
    assert.strictEqual(helperFunc.traced, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RustParser: extracts functions, structs, impl blocks, and doc attributes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-test-rs-'));
  const rsFile = path.join(tmpDir, 'engine.rs');

  const rsCode = `
/// @skyhook-implements REQ-CORE-01
pub struct CoreEngine {
    state: u32,
}

impl CoreEngine {
    /// @skyhook-implements REQ-CORE-02
    pub fn process_event(&self) -> bool {
        true
    }

    fn internal_tick(&self) {
        // untraced internal method
    }
}

pub async fn run_daemon() {
    // untraced standalone function
}
`;

  fs.writeFileSync(rsFile, rsCode);

  try {
    const parser = new RustParser();
    const symbols = await parser.parse(rsFile, tmpDir);

    // Verify struct
    const engineStruct = symbols.find(s => s.symbolName === 'CoreEngine');
    assert.ok(engineStruct);
    assert.strictEqual(engineStruct.symbolType, 'struct');
    assert.strictEqual(engineStruct.requirementId, 'REQ-CORE-01');

    // Verify method in impl block
    const processMethod = symbols.find(s => s.symbolName === 'process_event');
    assert.ok(processMethod);
    assert.strictEqual(processMethod.symbolType, 'method');
    assert.strictEqual(processMethod.parentSymbol, 'CoreEngine');
    assert.strictEqual(processMethod.requirementId, 'REQ-CORE-02');

    // Verify untraced method inside impl
    const tickMethod = symbols.find(s => s.symbolName === 'internal_tick');
    assert.ok(tickMethod);
    assert.strictEqual(tickMethod.symbolType, 'method');
    assert.strictEqual(tickMethod.traced, false);

    // Verify standalone async fn
    const daemonFunc = symbols.find(s => s.symbolName === 'run_daemon');
    assert.ok(daemonFunc);
    assert.strictEqual(daemonFunc.symbolType, 'function');
    assert.strictEqual(daemonFunc.metadata.isAsync, true);
    assert.strictEqual(daemonFunc.traced, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('JavaParser: extracts classes, methods, and @SkyhookImplements annotations', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-test-java-'));
  const javaFile = path.join(tmpDir, 'PaymentService.java');

  const javaCode = `
package com.app;

/**
 * @skyhook-implements REQ-PAY-01
 */
public class PaymentService {
    @SkyhookImplements("REQ-PAY-02")
    public void chargeCard(String token, double amount) {
        // charge card logic
    }

    private void validateToken(String token) {
        // untraced method
    }
}
`;

  fs.writeFileSync(javaFile, javaCode);

  try {
    const parser = new JavaParser();
    const symbols = await parser.parse(javaFile, tmpDir);

    // Verify class
    const payClass = symbols.find(s => s.symbolName === 'PaymentService');
    assert.ok(payClass);
    assert.strictEqual(payClass.symbolType, 'class');
    assert.strictEqual(payClass.requirementId, 'REQ-PAY-01');

    // Verify annotated method
    const chargeMethod = symbols.find(s => s.symbolName === 'chargeCard');
    assert.ok(chargeMethod);
    assert.strictEqual(chargeMethod.symbolType, 'method');
    assert.strictEqual(chargeMethod.requirementId, 'REQ-PAY-02');
    assert.strictEqual(chargeMethod.parentSymbol, 'PaymentService');

    // Verify untraced private method
    const validateMethod = symbols.find(s => s.symbolName === 'validateToken');
    assert.ok(validateMethod);
    assert.strictEqual(validateMethod.symbolType, 'method');
    assert.strictEqual(validateMethod.traced, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
