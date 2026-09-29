/**
 * Skyhook Language Parsers - Pluggable Polyglot AST Engine
 */

import fs from 'fs';
import { BaseParser } from './BaseParser.js';
import { ParserRegistry } from './ParserRegistry.js';
import { JavaScriptParser } from './JavaScriptParser.js';
import { PythonParser } from './PythonParser.js';
import { GoParser } from './GoParser.js';
import { RustParser } from './RustParser.js';
import { JavaParser } from './JavaParser.js';
import { RegexFallbackParser } from './RegexFallbackParser.js';

// Register built-in parsers
const jsParser = new JavaScriptParser();
const pyParser = new PythonParser();
const goParser = new GoParser();
const rsParser = new RustParser();
const javaParser = new JavaParser();
const fallbackParser = new RegexFallbackParser();

ParserRegistry.register(jsParser, 100);
ParserRegistry.register(pyParser, 100);
ParserRegistry.register(goParser, 100);
ParserRegistry.register(rsParser, 100);
ParserRegistry.register(javaParser, 100);
ParserRegistry.register(fallbackParser, 10); // Lowest priority fallback

export {
  BaseParser,
  ParserRegistry,
  JavaScriptParser,
  PythonParser,
  GoParser,
  RustParser,
  JavaParser,
  RegexFallbackParser
};

let extensionsLoadedFor = null;

/**
 * Get dynamic status of all registered language parsers
 * @returns {Object}
 */
export function getParserStatus() {
  const regStatus = ParserRegistry.getStatus();
  return {
    javascript: { loaded: Boolean(regStatus.javascript?.loaded), error: regStatus.javascript?.error || null },
    typescript: { loaded: Boolean(regStatus.javascript?.loaded), error: regStatus.javascript?.error || null },
    python: { loaded: Boolean(regStatus.python?.loaded), error: null },
    go: { loaded: Boolean(regStatus.go?.loaded), error: null },
    rust: { loaded: Boolean(regStatus.rust?.loaded), error: null },
    java: { loaded: Boolean(regStatus.java?.loaded), error: null },
    registry: regStatus
  };
}

/**
 * Parse any source code file using the appropriate registered language parser
 * @param {string} filePath - Absolute path to file
 * @param {string} projectDir - Workspace root directory
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function parseFile(filePath, projectDir, options = {}) {
  // Dynamically load project custom extensions once per project
  if (extensionsLoadedFor !== projectDir) {
    await ParserRegistry.loadWorkspaceExtensions(projectDir);
    extensionsLoadedFor = projectDir;
  }

  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return [];
  }

  const parser = ParserRegistry.getParserForFile(filePath, content) || fallbackParser;

  try {
    return await parser.parse(filePath, projectDir, options);
  } catch (err) {
    // If a dedicated parser fails, attempt graceful fallback
    if (parser.id !== 'fallback') {
      try {
        return await fallbackParser.parse(filePath, projectDir, options);
      } catch {
        return [];
      }
    }
    return [];
  }
}
