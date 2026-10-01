import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ASTImportGraph } from '../lib/drift/ASTImportGraph.js';

test('ASTImportGraph: extracts polyglot imports, resolves aliases, and builds dependency edges', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-graph-test-'));

  try {
    // 1. Create tsconfig.json with path aliases
    const tsconfig = {
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['src/*'],
          '#services/*': ['src/services/*']
        }
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    // 2. Create directory structure
    const srcDomain = path.join(tmpDir, 'src', 'domain');
    const srcServices = path.join(tmpDir, 'src', 'services');
    const srcControllers = path.join(tmpDir, 'src', 'controllers');
    const pyDir = path.join(tmpDir, 'python_app');
    const goDir = path.join(tmpDir, 'go_server');

    fs.mkdirSync(srcDomain, { recursive: true });
    fs.mkdirSync(srcServices, { recursive: true });
    fs.mkdirSync(srcControllers, { recursive: true });
    fs.mkdirSync(pyDir, { recursive: true });
    fs.mkdirSync(goDir, { recursive: true });

    // 3. Create JS/TS files
    fs.writeFileSync(path.join(srcDomain, 'User.js'), `
      export class User {
        constructor(id, name) { this.id = id; this.name = name; }
      }
    `);

    fs.writeFileSync(path.join(srcServices, 'UserService.js'), `
      import { User } from '../domain/User.js';
      import axios from 'axios';
      export class UserService {
        findUser(id) { return new User(id, 'Alice'); }
      }
    `);

    fs.writeFileSync(path.join(srcControllers, 'UserController.js'), `
      import { UserService } from '#services/UserService.js';
      const express = require('express');
      export { UserService } from '#services/UserService.js';
      async function dynamicLoad() {
        const auth = await import('../domain/User.js');
      }
    `);

    // 4. Create Python files
    fs.writeFileSync(path.join(pyDir, 'models.py'), `
      class Order:
          pass
    `);

    fs.writeFileSync(path.join(pyDir, 'service.py'), `
      import requests
      from .models import Order
    `);

    // 5. Create Go file
    fs.writeFileSync(path.join(goDir, 'main.go'), `
      package main
      import (
        "fmt"
        "net/http"
        "github.com/gin-gonic/gin"
      )
      func main() {}
    `);

    // Build the AST import graph
    const graph = new ASTImportGraph(tmpDir);
    await graph.build();

    // Verify nodes discovered
    assert.ok(graph.nodes.has('src/domain/User.js'));
    assert.ok(graph.nodes.has('src/services/UserService.js'));
    assert.ok(graph.nodes.has('src/controllers/UserController.js'));
    assert.ok(graph.nodes.has('python_app/service.py'));
    assert.ok(graph.nodes.has('go_server/main.go'));

    // Verify relative import resolution
    const serviceDeps = graph.getDependenciesOf('src/services/UserService.js');
    assert.ok(serviceDeps.internal.includes('src/domain/User.js'));
    assert.ok(serviceDeps.external.includes('axios'));

    // Verify tsconfig alias resolution (#services/UserService.js -> src/services/UserService.js)
    const controllerDeps = graph.getDependenciesOf('src/controllers/UserController.js');
    assert.ok(controllerDeps.internal.includes('src/services/UserService.js'));
    assert.ok(controllerDeps.external.includes('express'));

    // Verify dependents (incoming edges)
    const userDependents = graph.getDependentsOf('src/domain/User.js');
    assert.ok(userDependents.includes('src/services/UserService.js'));
    assert.ok(userDependents.includes('src/controllers/UserController.js'));

    // Verify Python imports
    const pyDeps = graph.getDependenciesOf('python_app/service.py');
    assert.ok(pyDeps.internal.includes('python_app/models.py'));
    assert.ok(pyDeps.external.includes('requests'));

    // Verify Go imports
    const goDeps = graph.getDependenciesOf('go_server/main.go');
    assert.ok(goDeps.external.includes('fmt'));
    assert.ok(goDeps.external.includes('net/http'));
    assert.ok(goDeps.external.includes('github.com/gin-gonic/gin'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ASTImportGraph: detects circular dependency cycles accurately using Tarjan algorithm', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-cycle-test-'));

  try {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Create A -> B -> C -> A cycle
    fs.writeFileSync(path.join(srcDir, 'a.js'), "import { b } from './b.js'; export const a = 1;");
    fs.writeFileSync(path.join(srcDir, 'b.js'), "import { c } from './c.js'; export const b = 2;");
    fs.writeFileSync(path.join(srcDir, 'c.js'), "import { a } from './a.js'; export const c = 3;");

    // Create D (acyclic independent node)
    fs.writeFileSync(path.join(srcDir, 'd.js'), "import { a } from './a.js'; export const d = 4;");

    const graph = new ASTImportGraph(tmpDir);
    await graph.build();

    const cycles = graph.findCircularDependencies();
    assert.strictEqual(cycles.length, 1);
    const cycle = cycles[0];
    assert.strictEqual(cycle.length, 3);
    assert.ok(cycle.includes('src/a.js'));
    assert.ok(cycle.includes('src/b.js'));
    assert.ok(cycle.includes('src/c.js'));
    assert.ok(!cycle.includes('src/d.js')); // d is not part of the cycle
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ASTImportGraph: ignores Python virtual environments (.venv, venv) and custom ignoreDirs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyhook-venv-test-'));

  try {
    // 1. Create a Python project with real app and a .venv directory
    const appDir = path.join(tmpDir, 'app');
    const venvDir = path.join(tmpDir, '.venv', 'lib', 'python3.11', 'site-packages', 'thirdparty');
    const customIgnoreDir = path.join(tmpDir, 'custom_build');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(venvDir, { recursive: true });
    fs.mkdirSync(customIgnoreDir, { recursive: true });

    // App file
    fs.writeFileSync(path.join(appDir, 'main.py'), 'import thirdparty\nprint("Hello")\n');

    // .venv files that have internal circular imports
    fs.writeFileSync(path.join(venvDir, 'pkg_a.py'), 'from . import pkg_b\n');
    fs.writeFileSync(path.join(venvDir, 'pkg_b.py'), 'from . import pkg_a\n');

    // Custom ignore file
    fs.writeFileSync(path.join(customIgnoreDir, 'ignored.py'), 'import os\n');

    // .gitignore with custom_build
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'custom_build/\n');

    const graph = new ASTImportGraph(tmpDir);
    await graph.build();

    const discovered = graph.discoverSourceFiles(tmpDir);
    const discoveredRel = discovered.map(p => path.relative(tmpDir, p).replace(/\\/g, '/'));

    // Should include app/main.py
    assert.ok(discoveredRel.includes('app/main.py'));

    // Should NOT include any files from .venv or custom_build
    assert.strictEqual(discoveredRel.filter(p => p.startsWith('.venv')).length, 0);
    assert.strictEqual(discoveredRel.filter(p => p.startsWith('custom_build')).length, 0);

    // Circular dependencies in .venv should NOT be reported
    const cycles = graph.findCircularDependencies();
    assert.strictEqual(cycles.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
