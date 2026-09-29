/**
 * RustParser - Dedicated AST/Structure Parser for Rust (.rs)
 * Extracts functions, structs, enums, impl blocks, traits, and doc comments (///).
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class RustParser extends BaseParser {
  get id() {
    return 'rust';
  }

  get name() {
    return 'Rust AST Parser';
  }

  getSupportedExtensions() {
    return ['.rs'];
  }

  async parse(fullPath, projectDir, options = {}) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath);
    const symbols = [];
    const lines = content.split('\n');

    let pendingDocComments = [];
    let currentImplScope = null;
    let implScopeBraceDepth = 0;
    let globalBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Track brace depth
      for (const char of rawLine) {
        if (char === '{') {
          globalBraceDepth++;
        } else if (char === '}') {
          globalBraceDepth--;
          if (currentImplScope && globalBraceDepth < implScopeBraceDepth) {
            currentImplScope = null;
          }
        }
      }

      // Collect doc comments (///) or standard comments (//) or attributes (#[...])
      if (trimmed.startsWith('///') || trimmed.startsWith('//') || trimmed.startsWith('#[')) {
        const reqId = this.extractRequirementId(trimmed);
        if (reqId) {
          pendingDocComments.push({ line: i + 1, reqId });
        }
        continue;
      }

      if (!trimmed) {
        pendingDocComments = [];
        continue;
      }

      // 1. Detect Impl block: impl [Trait for] Type {
      const implMatch = trimmed.match(/^impl(?:\s*<.*?>)?\s+(?:([A-Za-z0-9_]+)\s+for\s+)?([A-Za-z0-9_]+)/);
      if (implMatch) {
        const traitName = implMatch[1];
        const targetType = implMatch[2];
        currentImplScope = traitName ? `${targetType}` : targetType;
        implScopeBraceDepth = globalBraceDepth;
        pendingDocComments = [];
        continue;
      }

      // 2. Detect Struct or Enum or Trait
      const typeMatch = trimmed.match(/^(?:pub(?:\(.*?\))?\s+)?(struct|enum|trait)\s+([A-Za-z0-9_]+)/);
      if (typeMatch) {
        const kind = typeMatch[1];
        const typeName = typeMatch[2];
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
              language: 'rust',
              kind
            }
          })
        );

        pendingDocComments = [];
        continue;
      }

      // 3. Detect Function or Method: [pub] [async] [const] [unsafe] fn name(...)
      const fnMatch = trimmed.match(/^(?:pub(?:\(.*?\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+([A-Za-z0-9_]+)\s*(?:<.*?>)?\s*\(/);
      if (fnMatch) {
        const fnName = fnMatch[1];
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
            symbolName: fnName,
            symbolType: currentImplScope ? 'method' : 'function',
            parentSymbol: currentImplScope || null,
            line: startLine,
            endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'rust',
              isAsync: trimmed.includes('async fn')
            }
          })
        );

        pendingDocComments = [];
        continue;
      }

      // Reset pending comments if non-comment code
      if (!trimmed.startsWith('//') && !trimmed.startsWith('///') && !trimmed.startsWith('#[')) {
        pendingDocComments = [];
      }
    }

    return symbols;
  }

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
      // Statement without braces (e.g. trait declaration fn signature ;)
      if (!foundInitialBrace && line.includes(';')) {
        return i + 1;
      }
    }

    return startIndex + 1;
  }
}
