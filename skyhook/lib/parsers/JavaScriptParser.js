/**
 * JavaScriptParser - Babel AST Parser for JS, TS, JSX, and TSX
 * Extends BaseParser to extract classes, functions, methods, and requirement bindings.
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class JavaScriptParser extends BaseParser {
  constructor() {
    super();
    this.babelParser = null;
    this.babelTraverse = null;
    this.loadError = null;
  }

  get id() {
    return 'javascript';
  }

  get name() {
    return 'JavaScript & TypeScript (Babel AST)';
  }

  getSupportedExtensions() {
    return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
  }

  async loadBabel() {
    if (!this.babelParser || !this.babelTraverse) {
      try {
        const p = await import('@babel/parser');
        const t = await import('@babel/traverse');
        this.babelParser = p.default || p;
        this.babelTraverse = t.default || t;
        this.loadError = null;
      } catch (e) {
        this.loadError = 'Missing dependencies: @babel/parser and @babel/traverse';
        throw new Error(this.loadError);
      }
    }
  }

  async parse(fullPath, projectDir, options = {}) {
    await this.loadBabel();

    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath);
    const symbols = [];

    try {
      const ast = this.babelParser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy']
      });

      // Map line numbers to comments containing @skyhook-implements
      const commentsByLine = {};
      if (ast.comments) {
        for (const comment of ast.comments) {
          const reqId = this.extractRequirementId(comment.value);
          if (reqId) {
            const targetLine = comment.loc.end.line + 1;
            commentsByLine[targetLine] = reqId;
          }
        }
      }

      const contentLines = content.split('\n');

      const processNode = (node, type, defaultName, parent = null) => {
        let name = defaultName || 'Anonymous';
        if (node.id && node.id.name) {
          name = node.id.name;
        }

        const startLine = node.loc.start.line;
        const endLine = node.loc.end.line;

        // Check if node has an attached requirement tag
        let reqId = commentsByLine[startLine] || null;

        if (!reqId && node.leadingComments) {
          for (const c of node.leadingComments) {
            const matched = this.extractRequirementId(c.value);
            if (matched) {
              reqId = matched;
              break;
            }
          }
        }

        const context = contentLines.slice(startLine - 1, Math.min(startLine + 2, endLine)).join('\n');

        symbols.push(
          this.createSymbol({
            file: relativeFile,
            symbolName: name,
            symbolType: type,
            parentSymbol: parent,
            line: startLine,
            endLine: endLine,
            context,
            requirementId: reqId,
            metadata: {
              language: 'javascript',
              isAsync: Boolean(node.async),
              generator: Boolean(node.generator)
            }
          })
        );
      };

      const traverseFn = this.babelTraverse.default || this.babelTraverse;
      traverseFn(ast, {
        ClassDeclaration(p) {
          processNode(p.node, 'class', 'AnonymousClass');
        },
        FunctionDeclaration(p) {
          processNode(p.node, 'function', 'AnonymousFunction');
        },
        VariableDeclarator(p) {
          if (
            p.node.init &&
            (p.node.init.type === 'ArrowFunctionExpression' || p.node.init.type === 'FunctionExpression')
          ) {
            processNode(p.node, 'function', p.node.id?.name);
          }
        },
        ClassMethod(p) {
          const parentClass = p.parentPath?.parentPath?.node?.id?.name || null;
          processNode(p.node, 'method', p.node.key?.name, parentClass);
        },
        ObjectMethod(p) {
          processNode(p.node, 'method', p.node.key?.name);
        }
      });
    } catch (e) {
      throw new Error(`AST Parse Error in ${relativeFile}: ${e.message}`);
    }

    return symbols;
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      loaded: !this.loadError,
      extensions: this.getSupportedExtensions(),
      error: this.loadError
    };
  }
}
