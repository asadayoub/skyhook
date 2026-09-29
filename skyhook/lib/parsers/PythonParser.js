/**
 * PythonParser - Dedicated AST/Structure Parser for Python (.py, .pyw, .pyi)
 * Extracts classes, methods, functions, async defs, decorators, docstrings, and requirement tags.
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class PythonParser extends BaseParser {
  get id() {
    return 'python';
  }

  get name() {
    return 'Python AST Parser';
  }

  getSupportedExtensions() {
    return ['.py', '.pyw', '.pyi'];
  }

  canHandle(filePath, content = '') {
    if (super.canHandle(filePath, content)) return true;
    // Check for python shebang
    if (content.startsWith('#!') && content.toLowerCase().includes('python')) {
      return true;
    }
    return false;
  }

  async parse(fullPath, projectDir, options = {}) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath);
    const symbols = [];
    const lines = content.split('\n');

    // Track indentation stack to determine symbol endLine and nesting
    // Scope stack holds { indent: number, name: string, type: 'class'|'function' }
    const scopeStack = [];
    let pendingDecorators = [];
    let pendingComments = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Check comments
      if (trimmed.startsWith('#')) {
        const reqId = this.extractRequirementId(trimmed);
        if (reqId) {
          pendingComments.push({ line: i + 1, reqId });
        }
        continue;
      }

      // Check decorators: @decorator or @decorator(...)
      if (trimmed.startsWith('@')) {
        pendingDecorators.push(trimmed);
        continue;
      }

      if (!trimmed) {
        // Blank line, keep pending decorators and comments if close
        continue;
      }

      // Calculate indentation (spaces)
      const indent = rawLine.search(/\S|$/);

      // Pop finished scopes
      while (scopeStack.length > 0 && indent <= scopeStack[scopeStack.length - 1].indent) {
        const closed = scopeStack.pop();
        // Update closed symbol's endLine
        if (closed.symbol) {
          closed.symbol.endLine = Math.max(closed.symbol.line, i);
        }
      }

      // 1. Detect Class Definition
      const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)(?:\s*\((.*?)\))?\s*:/);
      if (classMatch) {
        const className = classMatch[1];
        const startLine = i + 1;
        const parentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1].name : null;

        // Check for attached requirement ID from preceding comments or docstrings
        let reqId = null;
        if (pendingComments.length > 0) {
          reqId = pendingComments[pendingComments.length - 1].reqId;
        }

        // Check immediate docstring below class
        const docstringReq = this.scanDocstring(lines, i + 1);
        if (docstringReq) {
          reqId = docstringReq;
        }

        const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');

        const symbol = this.createSymbol({
          file: relativeFile,
          symbolName: className,
          symbolType: 'class',
          parentSymbol: parentScope,
          line: startLine,
          endLine: startLine, // will be updated when scope closes
          context,
          requirementId: reqId,
          metadata: {
            language: 'python',
            superclasses: classMatch[2] ? classMatch[2].split(',').map(s => s.trim()) : [],
            decorators: [...pendingDecorators]
          }
        });

        symbols.push(symbol);
        scopeStack.push({ indent, name: className, type: 'class', symbol });
        pendingDecorators = [];
        pendingComments = [];
        continue;
      }

      // 2. Detect Function or Method Definition (def or async def)
      const defMatch = trimmed.match(/^(async\s+def|def)\s+([A-Za-z0-9_]+)\s*\((.*?)\)(?:\s*->\s*(.*?))?\s*:/);
      if (defMatch) {
        const isAsync = defMatch[1].startsWith('async');
        const funcName = defMatch[2];
        const params = defMatch[3];
        const returnType = defMatch[4] || null;
        const startLine = i + 1;

        const parentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1].name : null;
        const isMethod = scopeStack.length > 0 && scopeStack[scopeStack.length - 1].type === 'class';

        // Check attached requirement ID
        let reqId = null;
        if (pendingComments.length > 0) {
          reqId = pendingComments[pendingComments.length - 1].reqId;
        }

        // Check immediate docstring below def
        const docstringReq = this.scanDocstring(lines, i + 1);
        if (docstringReq) {
          reqId = docstringReq;
        }

        const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');

        const symbol = this.createSymbol({
          file: relativeFile,
          symbolName: funcName,
          symbolType: isMethod ? 'method' : 'function',
          parentSymbol: parentScope,
          line: startLine,
          endLine: startLine, // will be updated when scope closes
          context,
          requirementId: reqId,
          metadata: {
            language: 'python',
            isAsync,
            parameters: params,
            returnType,
            decorators: [...pendingDecorators]
          }
        });

        symbols.push(symbol);
        scopeStack.push({ indent, name: funcName, type: 'function', symbol });
        pendingDecorators = [];
        pendingComments = [];
        continue;
      }

      // Reset pending tags if regular code is encountered
      if (!trimmed.startsWith('@') && !trimmed.startsWith('#')) {
        pendingDecorators = [];
        pendingComments = [];
      }
    }

    // Close any remaining scopes at end of file
    while (scopeStack.length > 0) {
      const closed = scopeStack.pop();
      if (closed.symbol) {
        closed.symbol.endLine = lines.length;
      }
    }

    return symbols;
  }

  /**
   * Helper to inspect the docstring immediately following a function or class
   * @param {string[]} lines 
   * @param {number} nextIndex 
   * @returns {string|null}
   */
  scanDocstring(lines, nextIndex) {
    if (nextIndex >= lines.length) return null;
    const nextLine = lines[nextIndex].trim();

    if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
      const quote = nextLine.startsWith('"""') ? '"""' : "'''";
      // Single line docstring: """..."""
      if (nextLine.length > 3 && nextLine.endsWith(quote)) {
        return this.extractRequirementId(nextLine);
      }
      // Multiline docstring
      let docText = nextLine;
      for (let j = nextIndex + 1; j < Math.min(nextIndex + 15, lines.length); j++) {
        docText += '\n' + lines[j];
        if (lines[j].includes(quote)) break;
      }
      return this.extractRequirementId(docText);
    }
    return null;
  }
}
