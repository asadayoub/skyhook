/**
 * GoParser - Dedicated AST/Structure Parser for Go (.go)
 * Extracts package functions, receiver methods, structs, interfaces, and doc comment annotations.
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class GoParser extends BaseParser {
  get id() {
    return 'go';
  }

  get name() {
    return 'Go AST Parser';
  }

  getSupportedExtensions() {
    return ['.go'];
  }

  async parse(fullPath, projectDir, options = {}) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath);
    const symbols = [];
    const lines = content.split('\n');

    let pendingDocComments = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Collect doc comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        const reqId = this.extractRequirementId(trimmed);
        if (reqId) {
          pendingDocComments.push({ line: i + 1, reqId });
        }
        continue;
      }

      if (!trimmed) {
        // Blank line separates doc comments from declarations in Go
        pendingDocComments = [];
        continue;
      }

      // 1. Detect Struct or Interface: type Name struct | interface
      const typeMatch = trimmed.match(/^type\s+([A-Za-z0-9_]+)\s+(struct|interface)\b/);
      if (typeMatch) {
        const typeName = typeMatch[1];
        const kind = typeMatch[2];
        const startLine = i + 1;
        const endLine = this.findMatchingBraceEnd(lines, i);

        let reqId = null;
        if (pendingDocComments.length > 0) {
          reqId = pendingDocComments[pendingDocComments.length - 1].reqId;
        }

        const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');

        symbols.push(
          this.createSymbol({
            file: relativeFile,
            symbolName: typeName,
            symbolType: kind === 'struct' ? 'struct' : 'interface',
            line: startLine,
            endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'go',
              kind
            }
          })
        );

        pendingDocComments = [];
        continue;
      }

      // 2. Detect Method on receiver: func (r *Receiver) MethodName(...) ...
      const methodMatch = trimmed.match(/^func\s+\(\s*([A-Za-z0-9_*]+(?:\s+[A-Za-z0-9_*]+)?)\s*\)\s*([A-Za-z0-9_]+)\s*\(/);
      if (methodMatch) {
        const rawReceiver = methodMatch[1];
        const methodName = methodMatch[2];
        const startLine = i + 1;
        const endLine = this.findMatchingBraceEnd(lines, i);

        // Extract clean receiver type (e.g. "*Server" -> "Server")
        const receiverParts = rawReceiver.trim().split(/\s+/);
        const receiverType = (receiverParts[receiverParts.length - 1] || '').replace(/[*&]/g, '');

        let reqId = null;
        if (pendingDocComments.length > 0) {
          reqId = pendingDocComments[pendingDocComments.length - 1].reqId;
        }

        const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');

        symbols.push(
          this.createSymbol({
            file: relativeFile,
            symbolName: methodName,
            symbolType: 'method',
            parentSymbol: receiverType || null,
            line: startLine,
            endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'go',
              receiver: rawReceiver
            }
          })
        );

        pendingDocComments = [];
        continue;
      }

      // 3. Detect Package-Level Function: func FunctionName(...) ...
      const funcMatch = trimmed.match(/^func\s+([A-Za-z0-9_]+)\s*\(/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const startLine = i + 1;
        const endLine = this.findMatchingBraceEnd(lines, i);

        let reqId = null;
        if (pendingDocComments.length > 0) {
          reqId = pendingDocComments[pendingDocComments.length - 1].reqId;
        }

        const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');

        symbols.push(
          this.createSymbol({
            file: relativeFile,
            symbolName: funcName,
            symbolType: 'function',
            line: startLine,
            endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'go'
            }
          })
        );

        pendingDocComments = [];
        continue;
      }

      // Reset pending comments if a regular statement is passed
      if (!trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        pendingDocComments = [];
      }
    }

    return symbols;
  }

  /**
   * Helper to balance curly braces { } and find the ending line of a Go block
   */
  findMatchingBraceEnd(lines, startIndex) {
    let braceDepth = 0;
    let foundInitialBrace = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceDepth++;
          foundInitialBrace = true;
        } else if (char === '}') {
          braceDepth--;
          if (foundInitialBrace && braceDepth <= 0) {
            return i + 1;
          }
        }
      }
    }

    return startIndex + 1;
  }
}
