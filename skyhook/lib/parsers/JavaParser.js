/**
 * JavaParser - Dedicated AST/Structure Parser for Java, C#, and Kotlin (.java, .cs, .kt)
 * Extracts classes, interfaces, methods, annotations (@SkyhookImplements), and Javadocs.
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class JavaParser extends BaseParser {
  get id() {
    return 'java';
  }

  get name() {
    return 'Java & C# AST Parser';
  }

  getSupportedExtensions() {
    return ['.java', '.cs', '.kt'];
  }

  async parse(fullPath, projectDir, options = {}) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath);
    const symbols = [];
    const lines = content.split('\n');

    let pendingDocComments = [];
    let pendingAnnotations = [];
    let currentClassScope = null;
    let classScopeBraceDepth = 0;
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
          if (currentClassScope && globalBraceDepth < classScopeBraceDepth) {
            currentClassScope = null;
          }
        }
      }

      // Check comments: // or /* or *
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        const reqId = this.extractRequirementId(trimmed);
        if (reqId) {
          pendingDocComments.push({ line: i + 1, reqId });
        }
        continue;
      }

      // Check annotations: @SkyhookImplements("REQ-XXX") or @Annotation
      if (trimmed.startsWith('@')) {
        pendingAnnotations.push(trimmed);
        const reqId = this.extractRequirementId(trimmed);
        if (reqId) {
          pendingDocComments.push({ line: i + 1, reqId });
        }
        continue;
      }

      if (!trimmed) {
        continue;
      }

      // 1. Detect Class, Interface, Record, Enum
      const classMatch = trimmed.match(/^(?:(?:public|protected|private|abstract|static|final|sealed)\s+)*(class|interface|record|enum)\s+([A-Za-z0-9_]+)/);
      if (classMatch) {
        const kind = classMatch[1];
        const className = classMatch[2];
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
            symbolName: className,
            symbolType: kind === 'interface' ? 'interface' : 'class',
            line: startLine,
            endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'java',
              kind,
              annotations: [...pendingAnnotations]
            }
          })
        );

        currentClassScope = className;
        classScopeBraceDepth = globalBraceDepth;
        pendingDocComments = [];
        pendingAnnotations = [];
        continue;
      }

      // 2. Detect Method Declaration: [modifiers] ReturnType methodName(...) [throws ...] {
      // Must not match if, while, for, switch, catch
      const methodMatch = trimmed.match(/^(?:(?:public|protected|private|static|final|abstract|synchronized|native|override|async)\s+)*(?!if|for|while|switch|catch)([A-Za-z0-9_<>[\],]+)\s+([A-Za-z0-9_]+)\s*\((.*?)\)(?:\s*throws\s+[A-Za-z0-9_,\s]+)?(?:\s*\{|\s*;)/);
      if (methodMatch) {
        const returnType = methodMatch[1];
        const methodName = methodMatch[2];
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
            symbolName: methodName,
            symbolType: 'method',
            parentSymbol: currentClassScope || null,
            line: startLine,
            endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'java',
              returnType,
              annotations: [...pendingAnnotations]
            }
          })
        );

        pendingDocComments = [];
        pendingAnnotations = [];
        continue;
      }

      // Reset pending tags if standard code is encountered
      if (!trimmed.startsWith('@') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        pendingDocComments = [];
        pendingAnnotations = [];
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
      if (!foundInitialBrace && line.includes(';')) {
        return i + 1;
      }
    }

    return startIndex + 1;
  }
}
