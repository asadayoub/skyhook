/**
 * RegexFallbackParser - Universal Regex Fallback Parser
 * Operates at lowest priority to catch annotated code symbols in unsupported or raw text files.
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class RegexFallbackParser extends BaseParser {
  get id() {
    return 'fallback';
  }

  get name() {
    return 'Regex Line Scanner (Universal Fallback)';
  }

  getSupportedExtensions() {
    return ['*']; // Universal fallback
  }

  canHandle(filePath, content = '') {
    return true; // Catches anything
  }

  async parse(fullPath, projectDir, options = {}) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath);
    const symbols = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const reqId = this.extractRequirementId(line);

      if (reqId) {
        const lineNumber = i + 1;
        let symbolName = 'UnknownSymbol';
        let symbolType = 'unknown';

        // Scan the following few lines to detect standard identifier definitions
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const nextLine = lines[j];
          const classMatch = nextLine.match(/\bclass\s+([A-Za-z0-9_]+)/);
          const defMatch = nextLine.match(/\bdef\s+([A-Za-z0-9_]+)/);
          const funcMatch = nextLine.match(/\bfunc\s+(?:\([^)]*\)\s+)?([A-Za-z0-9_]+)/);
          const fnMatch = nextLine.match(/\bfn\s+([A-Za-z0-9_]+)/);
          const standardFuncMatch = nextLine.match(/\bfunction\s+([A-Za-z0-9_]+)/);

          if (classMatch) {
            symbolName = classMatch[1];
            symbolType = 'class';
            break;
          } else if (defMatch) {
            symbolName = defMatch[1];
            symbolType = 'function';
            break;
          } else if (funcMatch) {
            symbolName = funcMatch[1];
            symbolType = 'function';
            break;
          } else if (fnMatch) {
            symbolName = fnMatch[1];
            symbolType = 'function';
            break;
          } else if (standardFuncMatch) {
            symbolName = standardFuncMatch[1];
            symbolType = 'function';
            break;
          }
        }

        const start = Math.max(0, lineNumber - 2);
        const end = Math.min(lines.length, lineNumber + 3);
        const context = lines.slice(start, end).join('\n');

        symbols.push(
          this.createSymbol({
            file: relativeFile,
            symbolName,
            symbolType,
            line: lineNumber,
            endLine: lineNumber,
            context,
            requirementId: reqId,
            metadata: {
              language: 'fallback',
              parser: 'regex'
            }
          })
        );
      }
    }

    return symbols;
  }
}
