/**
 * ASTImportGraph - Universal Polyglot Codebase Dependency & Import Graph
 * Extracts imports and exports across JS/TS, Python, Go, Rust, and Java/C#,
 * resolves path aliases and relative paths, and builds a directed graph.
 */

import fs from 'fs';
import path from 'path';
import { parseYaml } from '../utils.js';

export class ASTImportGraph {
  constructor(projectDir = process.cwd(), options = {}) {
    this.projectDir = path.resolve(projectDir);
    this.options = options;
    this.nodes = new Map(); // relativeFilePath -> NodeInfo
    this.edges = []; // Array of EdgeInfo
    this.externalPackages = new Map(); // packageName -> Set of importing files
    this.pathAliases = []; // Array of { prefix, targetPattern }
    this.ignoredDirs = new Set([
      'node_modules', '.git', '.skyhook', 'dist', 'build', '.next', 'coverage',
      '__pycache__', 'target', 'bin', 'obj',
      '.venv', 'venv', 'env', '.env', '.tox', '.nox', '.pytest_cache', '.mypy_cache', '.ruff_cache',
      'vendor', 'Pods', '.gemini'
    ]);
    if (options.ignoreDirs) {
      for (const d of options.ignoreDirs) this.ignoredDirs.add(d);
    }
    this.loadIgnoreConfigurations();
    this.loadCompilerOptions();
  }

  /**
   * Load ignore rules from .gitignore, .skyhook/project.yaml, or architecture-boundaries.yaml
   */
  loadIgnoreConfigurations() {
    // 1. Read .gitignore in project root if present
    const gitignorePath = path.join(this.projectDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const clean = trimmed.replace(/^[/\\]+|[/\\]+$/g, '');
          if (!clean.includes('*') && !clean.includes('/')) {
            this.ignoredDirs.add(clean);
          }
        }
      } catch (_) {}
    }

    // 2. Read .skyhook/project.yaml or architecture-boundaries.yaml
    const candidateFiles = [
      path.join(this.projectDir, '.skyhook', 'project.yaml'),
      path.join(this.projectDir, '.skyhook', 'architecture-boundaries.yaml'),
      path.join(this.projectDir, '.skyhook', 'drift.yaml')
    ];
    for (const confFile of candidateFiles) {
      if (fs.existsSync(confFile)) {
        try {
          const raw = fs.readFileSync(confFile, 'utf-8');
          const parsed = parseYaml(raw);
          if (parsed && typeof parsed === 'object') {
            const customIgnores = parsed.ignoreDirs || parsed.ignoredDirs || parsed.ignore || [];
            if (Array.isArray(customIgnores)) {
              for (const item of customIgnores) {
                if (typeof item === 'string') {
                  const clean = item.replace(/^[/\\]+|[/\\]+$/g, '');
                  this.ignoredDirs.add(clean);
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  /**
   * Load tsconfig.json or jsconfig.json to resolve path aliases (e.g. @/* -> src/*)
   */
  loadCompilerOptions() {
    const configCandidates = [
      path.join(this.projectDir, 'tsconfig.json'),
      path.join(this.projectDir, 'jsconfig.json')
    ];

    for (const configPath of configCandidates) {
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf-8');
          // Strip comments from json
          const stripped = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
          const config = JSON.parse(stripped);
          const compilerOptions = config.compilerOptions || {};
          const baseUrl = compilerOptions.baseUrl || '.';
          const paths = compilerOptions.paths || {};

          for (const [aliasPattern, targetList] of Object.entries(paths)) {
            const cleanAlias = aliasPattern.replace(/\*$/, '');
            const primaryTarget = Array.isArray(targetList) && targetList.length > 0 ? targetList[0] : '';
            const cleanTarget = primaryTarget.replace(/\*$/, '');
            const resolvedTarget = path.join(baseUrl, cleanTarget);

            this.pathAliases.push({
              prefix: cleanAlias,
              target: resolvedTarget.replace(/^[./]+/, '')
            });
          }
          break; // Stop after first valid config
        } catch {
          // Ignore JSON parse errors in tsconfig
        }
      }
    }
  }

  /**
   * Build the complete graph by scanning all source files in the project
   * @param {string[]} [fileList] - Optional explicit list of absolute or relative file paths
   * @returns {Promise<ASTImportGraph>}
   */
  async build(fileList = null) {
    this.nodes.clear();
    this.edges = [];
    this.externalPackages.clear();

    const filesToScan = fileList || this.discoverSourceFiles(this.projectDir);

    for (const file of filesToScan) {
      const fullPath = path.isAbsolute(file) ? file : path.join(this.projectDir, file);
      const relPath = path.relative(this.projectDir, fullPath).replace(/\\/g, '/');

      if (!fs.existsSync(fullPath)) continue;

      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const lang = this.detectLanguage(fullPath);
      this.nodes.set(relPath, {
        file: relPath,
        language: lang,
        importsCount: 0,
        exportsCount: 0
      });

      const extracted = this.extractImportsAndExports(content, lang, relPath);
      const node = this.nodes.get(relPath);
      node.importsCount = extracted.imports.length;
      node.exportsCount = extracted.exports.length;

      for (const imp of extracted.imports) {
        const resolved = this.resolveImportSpecifier(imp.specifier, relPath);
        const edge = {
          from: relPath,
          to: resolved.target,
          specifier: imp.specifier,
          isInternal: resolved.isInternal,
          line: imp.line,
          importType: imp.type,
          specifiers: imp.names || []
        };
        this.edges.push(edge);

        if (!resolved.isInternal && resolved.target) {
          const pkg = resolved.target;
          if (!this.externalPackages.has(pkg)) {
            this.externalPackages.set(pkg, new Set());
          }
          this.externalPackages.get(pkg).add(relPath);
        }
      }
    }

    return this;
  }

  /**
   * Detect source language from file extension
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.js':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.jsx':
        return 'jsx';
      case '.ts':
      case '.mts':
      case '.cts':
        return 'typescript';
      case '.tsx':
        return 'tsx';
      case '.py':
      case '.pyw':
      case '.pyi':
        return 'python';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.java':
        return 'java';
      case '.cs':
        return 'csharp';
      case '.kt':
        return 'kotlin';
      default:
        return 'unknown';
    }
  }

  /**
   * Extract import and export statements from file content based on language
   */
  extractImportsAndExports(content, language, currentRelFile) {
    const imports = [];
    const exports = [];
    const lines = content.split('\n');

    if (['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
      this.extractJSImports(content, lines, imports, exports);
    } else if (language === 'python') {
      this.extractPythonImports(lines, imports, exports);
    } else if (language === 'go') {
      this.extractGoImports(content, lines, imports, exports);
    } else if (language === 'rust') {
      this.extractRustImports(lines, imports, exports);
    } else if (['java', 'csharp', 'kotlin'].includes(language)) {
      this.extractJavaCSharpImports(lines, imports, exports);
    }

    return { imports, exports };
  }

  /**
   * Extract JavaScript & TypeScript imports (supports multiline, dynamic, and CJS require)
   */
  extractJSImports(content, lines, imports, exports) {
    // 1. ES Imports & Re-exports across multiline blocks
    // Matches: import ... from 'specifier' or import 'specifier' or export ... from 'specifier'
    const esImportRegex = /(?:import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?|export\s+(?:(?:[\w*\s{},]*)\s+from\s+))['"]([^'"]+)['"]/g;
    let match;
    while ((match = esImportRegex.exec(content)) !== null) {
      const specifier = match[1];
      const matchIndex = match.index;
      // Calculate line number from char index
      const lineNum = content.slice(0, matchIndex).split('\n').length;
      const isExport = match[0].startsWith('export');

      if (isExport) {
        exports.push({ specifier, line: lineNum, type: 're-export' });
        // Re-export also constitutes a dependency
        imports.push({ specifier, line: lineNum, type: 're-export' });
      } else {
        imports.push({ specifier, line: lineNum, type: 'import' });
      }
    }

    // 2. CommonJS require('specifier') & dynamic import('specifier')
    const requireRegex = /(?:require\s*\(|import\s*\()\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const specifier = match[1];
      const matchIndex = match.index;
      const lineNum = content.slice(0, matchIndex).split('\n').length;
      const isDynamic = match[0].startsWith('import');
      imports.push({ specifier, line: lineNum, type: isDynamic ? 'dynamic' : 'require' });
    }
  }

  /**
   * Extract Python imports (import foo, from foo.bar import baz, from . import local)
   */
  extractPythonImports(lines, imports, exports) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) continue;

      // from package.sub import symbol
      const fromMatch = line.match(/^from\s+([.\w]+)\s+import\s+(.*)/);
      if (fromMatch) {
        imports.push({
          specifier: fromMatch[1],
          line: i + 1,
          type: 'import',
          names: fromMatch[2].split(',').map(s => s.trim())
        });
        continue;
      }

      // import package
      const importMatch = line.match(/^import\s+([\w,.\s]+)/);
      if (importMatch) {
        const pkgs = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
        for (const pkg of pkgs) {
          if (pkg) {
            imports.push({ specifier: pkg, line: i + 1, type: 'import' });
          }
        }
      }
    }
  }

  /**
   * Extract Go imports (import "fmt" or multiline import blocks)
   */
  extractGoImports(content, lines, imports, exports) {
    // Single line: import "pkg" or import alias "pkg"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const singleMatch = line.match(/^import\s+(?:[A-Za-z0-9_.]+\s+)?["']([^"']+)["']/);
      if (singleMatch) {
        imports.push({ specifier: singleMatch[1], line: i + 1, type: 'import' });
      }
    }

    // Multiline import ( "pkg1" \n "pkg2" )
    const blockRegex = /import\s*\(([\s\S]*?)\)/g;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(content)) !== null) {
      const blockContent = blockMatch[1];
      const startLine = content.slice(0, blockMatch.index).split('\n').length;
      const blockLines = blockContent.split('\n');
      for (let j = 0; j < blockLines.length; j++) {
        const l = blockLines[j].trim();
        const m = l.match(/(?:[A-Za-z0-9_.]+\s+)?["']([^"']+)["']/);
        if (m) {
          imports.push({ specifier: m[1], line: startLine + j, type: 'import' });
        }
      }
    }
  }

  /**
   * Extract Rust imports (use crate::..., use super::..., mod ...)
   */
  extractRustImports(lines, imports, exports) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//')) continue;

      const useMatch = line.match(/^(?:pub\s+)?use\s+([^;]+);/);
      if (useMatch) {
        const spec = useMatch[1].trim();
        imports.push({ specifier: spec, line: i + 1, type: 'import' });
        continue;
      }

      const modMatch = line.match(/^(?:pub\s+)?mod\s+([A-Za-z0-9_]+);/);
      if (modMatch) {
        imports.push({ specifier: `./${modMatch[1]}`, line: i + 1, type: 'import' });
      }
    }
  }

  /**
   * Extract Java and C# imports (import com.pkg.*; or using System.Data;)
   */
  extractJavaCSharpImports(lines, imports, exports) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Java import
      const javaMatch = line.match(/^import\s+(?:static\s+)?([A-Za-z0-9_.*]+);/);
      if (javaMatch) {
        imports.push({ specifier: javaMatch[1], line: i + 1, type: 'import' });
        continue;
      }

      // C# using
      const csMatch = line.match(/^using\s+([A-Za-z0-9_.]+);/);
      if (csMatch) {
        imports.push({ specifier: csMatch[1], line: i + 1, type: 'import' });
      }
    }
  }

  /**
   * Resolve an import specifier to either an internal file path or an external package
   * @param {string} specifier - The raw string inside import
   * @param {string} fromRelFile - Workspace-relative path of the importing file
   * @returns {{ target: string, isInternal: boolean }}
   */
  resolveImportSpecifier(specifier, fromRelFile) {
    if (!specifier) return { target: '', isInternal: false };

    // 1. Check path aliases (e.g. @/components/Button)
    for (const alias of this.pathAliases) {
      if (specifier.startsWith(alias.prefix)) {
        const remainder = specifier.slice(alias.prefix.length);
        const candidateRel = path.join(alias.target, remainder).replace(/\\/g, '/');
        const resolvedInternal = this.findInternalFileMatch(candidateRel);
        if (resolvedInternal) {
          return { target: resolvedInternal, isInternal: true };
        }
      }
    }

    // Normalize Python relative dot imports (.models -> ./models, ..models -> ../models)
    let cleanSpecifier = specifier;
    const pyDotMatch = specifier.match(/^(\.+)([a-zA-Z0-9_].*)/);
    if (pyDotMatch) {
      const dotCount = pyDotMatch[1].length;
      const remainder = pyDotMatch[2].replace(/\./g, '/');
      cleanSpecifier = (dotCount === 1 ? './' : '../'.repeat(dotCount - 1)) + remainder;
    }

    // 2. Relative imports (./foo, ../bar)
    if (cleanSpecifier.startsWith('.')) {
      const fromDir = path.dirname(fromRelFile);
      const targetRel = path.join(fromDir, cleanSpecifier).replace(/\\/g, '/');
      const resolvedInternal = this.findInternalFileMatch(targetRel);
      if (resolvedInternal) {
        return { target: resolvedInternal, isInternal: true };
      }
      return { target: targetRel, isInternal: true };
    }

    // 4. Check if specifier directly matches an internal file under src/ or root
    const directMatch = this.findInternalFileMatch(specifier);
    if (directMatch) {
      return { target: directMatch, isInternal: true };
    }

    // 5. Otherwise, it is an external package or standard library
    let cleanPkg = specifier;
    if (fromRelFile.endsWith('.go')) {
      cleanPkg = specifier;
    } else if (specifier.startsWith('@')) {
      cleanPkg = specifier.split('/').slice(0, 2).join('/');
    } else {
      cleanPkg = specifier.split('/')[0];
    }

    return { target: cleanPkg, isInternal: false };
  }

  /**
   * Helper to check if a relative path exists as a physical file, testing common extensions
   */
  findInternalFileMatch(candidateRel) {
    const extensions = [
      '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.go', '.rs', '.java', '.cs',
      '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/__init__.py'
    ];

    for (const ext of extensions) {
      const testPath = path.join(this.projectDir, candidateRel + ext);
      if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
        return path.relative(this.projectDir, testPath).replace(/\\/g, '/');
      }
    }

    return null;
  }

  /**
   * Discover all source files across the project directory, skipping ignored folders
   */
  discoverSourceFiles(dir) {
    const results = [];
    const ignoreDirs = this.ignoredDirs || new Set([
      'node_modules', '.git', '.skyhook', 'dist', 'build', '.next', 'coverage',
      '__pycache__', 'target', 'bin', 'obj',
      '.venv', 'venv', 'env', '.env', '.tox', '.nox', '.pytest_cache', '.mypy_cache', '.ruff_cache',
      'vendor', 'Pods', '.gemini'
    ]);

    const codeExts = new Set([
      '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
      '.py', '.go', '.rs', '.java', '.cs', '.kt'
    ]);

    const scan = (current) => {
      if (!fs.existsSync(current)) return;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name)) {
            scan(path.join(current, entry.name));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (codeExts.has(ext) && !entry.name.endsWith('.d.ts')) {
            results.push(path.join(current, entry.name));
          }
        }
      }
    };

    scan(dir);
    return results;
  }

  /**
   * Get all internal dependency edges
   * @returns {Array<EdgeInfo>}
   */
  getAllInternalEdges() {
    return this.edges.filter(e => e.isInternal);
  }

  /**
   * Get all dependencies for a specific file
   * @param {string} relFile 
   * @returns {{ internal: string[], external: string[] }}
   */
  getDependenciesOf(relFile) {
    const normalized = relFile.replace(/\\/g, '/');
    const edges = this.edges.filter(e => e.from === normalized);
    return {
      internal: Array.from(new Set(edges.filter(e => e.isInternal).map(e => e.to))),
      external: Array.from(new Set(edges.filter(e => !e.isInternal).map(e => e.to)))
    };
  }

  /**
   * Get all files that depend on a specific file (incoming edges)
   * @param {string} relFile 
   * @returns {string[]}
   */
  getDependentsOf(relFile) {
    const normalized = relFile.replace(/\\/g, '/');
    const edges = this.edges.filter(e => e.isInternal && e.to === normalized);
    return Array.from(new Set(edges.map(e => e.from)));
  }

  /**
   * Detect circular dependencies across all internal nodes using Tarjan's SCC algorithm
   * @returns {Array<string[]>} Array of cycles (cycles with length >= 2)
   */
  findCircularDependencies() {
    const adj = new Map();
    for (const [node] of this.nodes) {
      adj.set(node, []);
    }

    for (const edge of this.edges) {
      if (edge.isInternal && edge.to && adj.has(edge.from) && adj.has(edge.to)) {
        if (edge.from !== edge.to) { // ignore self-dependency
          adj.get(edge.from).push(edge.to);
        }
      }
    }

    let index = 0;
    const indices = new Map();
    const lowlinks = new Map();
    const onStack = new Map();
    const stack = [];
    const sccs = [];

    const strongConnect = (v) => {
      indices.set(v, index);
      lowlinks.set(v, index);
      index++;
      stack.push(v);
      onStack.set(v, true);

      const neighbors = adj.get(v) || [];
      for (const w of neighbors) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
        } else if (onStack.get(w)) {
          lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
        }
      }

      if (lowlinks.get(v) === indices.get(v)) {
        const scc = [];
        let w;
        do {
          w = stack.pop();
          onStack.set(w, false);
          scc.push(w);
        } while (w !== v);

        if (scc.length > 1) {
          sccs.push(scc);
        }
      }
    };

    for (const [node] of this.nodes) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    return sccs;
  }
}
