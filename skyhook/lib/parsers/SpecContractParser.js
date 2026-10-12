/**
 * SpecContractParser - API Specification & Contract Parser
 * Extracts contract endpoints, schemas, RPCs, and types from OpenAPI, Swagger, GraphQL, and Protobuf specs.
 * Classifies symbols with artifactKind: 'derived-contract' to distinguish generated/spec contracts from source code.
 */

import fs from 'fs';
import path from 'path';
import { BaseParser } from './BaseParser.js';

export class SpecContractParser extends BaseParser {
  get id() {
    return 'spec';
  }

  get name() {
    return 'API Contract & Specification Parser (OpenAPI, GraphQL, Protobuf)';
  }

  getSupportedExtensions() {
    return ['.json', '.yaml', '.yml', '.proto', '.graphql', '.gql'];
  }

  canHandle(filePath, content = '') {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    if (['.proto', '.graphql', '.gql'].includes(ext)) {
      return true;
    }

    if (['.json', '.yaml', '.yml'].includes(ext)) {
      if (basename.includes('openapi') || basename.includes('swagger') || basename.includes('api-spec') || basename.includes('schema') || basename.includes('contract')) {
        return true;
      }
      if (content) {
        return /(?:["']?(?:openapi|swagger)["']?\s*:|"paths"\s*:|paths\s*:|components\s*:|definitions\s*:)/i.test(content);
      }
    }

    return false;
  }

  async parse(fullPath, projectDir, options = {}) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relativeFile = path.relative(projectDir, fullPath).replace(/\\/g, '/');
    const ext = path.extname(fullPath).toLowerCase();
    const lines = content.split('\n');
    const symbols = [];

    const isProto = ext === '.proto';
    const isGraphql = ext === '.graphql' || ext === '.gql';
    const isSpecDoc = !isProto && !isGraphql;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const reqId = this.extractRequirementId(line);

      if (reqId) {
        const lineNumber = i + 1;
        let symbolName = '';
        let symbolType = 'contract-endpoint';

        if (isProto) {
          // Protobuf parsing: prioritize rpc, then message, then service
          symbolType = 'contract-rpc';
          for (let dist = 0; dist <= 6; dist++) {
            const candidates = [i + dist, i - dist].filter(idx => idx >= 0 && idx < lines.length);
            for (const j of candidates) {
              const rpcMatch = lines[j].match(/\brpc\s+([A-Za-z0-9_]+)/i);
              if (rpcMatch) {
                symbolName = rpcMatch[1];
                symbolType = 'contract-rpc';
                break;
              }
            }
            if (symbolName) break;
          }
          if (!symbolName) {
            for (let dist = 0; dist <= 6; dist++) {
              const candidates = [i + dist, i - dist].filter(idx => idx >= 0 && idx < lines.length);
              for (const j of candidates) {
                const msgMatch = lines[j].match(/\bmessage\s+([A-Za-z0-9_]+)/i);
                const srvMatch = lines[j].match(/\bservice\s+([A-Za-z0-9_]+)/i);
                if (msgMatch) {
                  symbolName = msgMatch[1];
                  symbolType = 'contract-schema';
                  break;
                } else if (srvMatch) {
                  symbolName = srvMatch[1];
                  symbolType = 'contract-service';
                  break;
                }
              }
              if (symbolName) break;
            }
          }
          if (!symbolName) {
            symbolName = path.basename(fullPath, ext);
          }
        } else if (isGraphql) {
          // GraphQL parsing: prioritize type/input, then query/mutation
          symbolType = 'contract-type';
          for (let dist = 0; dist <= 6; dist++) {
            const candidates = [i + dist, i - dist].filter(idx => idx >= 0 && idx < lines.length);
            for (const j of candidates) {
              const typeMatch = lines[j].match(/\b(?:type|interface|input|enum)\s+([A-Za-z0-9_]+)/i);
              const queryMatch = lines[j].match(/\b(?:query|mutation|subscription)\s+([A-Za-z0-9_]+)/i);
              if (typeMatch) {
                symbolName = typeMatch[1];
                symbolType = 'contract-type';
                break;
              } else if (queryMatch) {
                symbolName = queryMatch[1];
                symbolType = 'contract-query';
                break;
              }
            }
            if (symbolName) break;
          }
          if (!symbolName) {
            symbolName = path.basename(fullPath, ext);
          }
        } else {
          // OpenAPI / Swagger JSON or YAML
          let detectedMethod = null;
          let detectedPath = null;
          let detectedSchema = null;
          let detectedOperationId = null;

          // 1. Scan upwards to find enclosing path or schema
          for (let j = i; j >= Math.max(0, i - 40); j--) {
            const curLine = lines[j];

            // Method match: get, post, put, delete, patch, options, head
            if (!detectedMethod) {
              const m = curLine.match(/(?:^|\s)["']?(get|post|put|delete|patch|options|head)["']?\s*:/i);
              if (m) detectedMethod = m[1].toUpperCase();
            }

            // Path match: e.g. "/api/v1/auth/login": or '/users':
            if (!detectedPath) {
              const p = curLine.match(/(?:^|\s)["']?(\/[a-zA-Z0-9_\-\/{}\.]+)["']?\s*:/);
              if (p) detectedPath = p[1];
            }

            // OperationId match
            if (!detectedOperationId) {
              const op = curLine.match(/["']?operationId["']?\s*:\s*["']?([A-Za-z0-9_]+)["']?/i);
              if (op) detectedOperationId = op[1];
            }

            // Schema match: e.g. "UserDTO": or components/schemas/UserDTO
            if (!detectedSchema) {
              const refMatch = curLine.match(/(?:schemas|definitions)\/([A-Za-z0-9_]+)/i);
              const inlineObjMatch = curLine.match(/(?:^|\s)["']?([A-Za-z0-9_]+)["']?\s*:\s*\{\s*["']?type["']?\s*:\s*["']?object["']?/i);
              if (refMatch) {
                detectedSchema = refMatch[1];
              } else if (inlineObjMatch) {
                detectedSchema = inlineObjMatch[1];
              } else {
                const yamlKeyMatch = curLine.match(/^\s*([A-Za-z0-9_]+):\s*$/);
                if (yamlKeyMatch) {
                  const key = yamlKeyMatch[1];
                  const ignoredKeys = ['components', 'schemas', 'definitions', 'properties', 'paths', 'responses', 'parameters', 'info', 'tags', 'content', 'items'];
                  if (!ignoredKeys.includes(key)) {
                    detectedSchema = key;
                  }
                }
              }
            }
          }

          // Also scan downwards for operationId or method if annotation was placed on path level
          if (!detectedMethod || !detectedOperationId) {
            for (let j = i + 1; j <= Math.min(lines.length - 1, i + 10); j++) {
              const curLine = lines[j];
              if (!detectedMethod) {
                const m = curLine.match(/(?:^|\s)["']?(get|post|put|delete|patch|options|head)["']?\s*:/i);
                if (m) detectedMethod = m[1].toUpperCase();
              }
              if (!detectedOperationId) {
                const op = curLine.match(/["']?operationId["']?\s*:\s*["']?([A-Za-z0-9_]+)["']?/i);
                if (op) detectedOperationId = op[1];
              }
            }
          }

          if (detectedMethod && detectedPath) {
            symbolName = `${detectedMethod} ${detectedPath}`;
            symbolType = 'contract-endpoint';
          } else if (detectedPath) {
            symbolName = detectedMethod ? `${detectedMethod} ${detectedPath}` : detectedPath;
            symbolType = 'contract-endpoint';
          } else if (detectedOperationId) {
            symbolName = detectedOperationId;
            symbolType = 'contract-endpoint';
          } else if (detectedSchema) {
            symbolName = detectedSchema;
            symbolType = 'contract-schema';
          } else if (detectedMethod) {
            symbolName = detectedMethod;
            symbolType = 'contract-endpoint';
          } else {
            // Check current or nearby line key
            const keyMatch = line.match(/(?:^|\s)["']?([A-Za-z0-9_\-]+)["']?\s*:/);
            if (keyMatch && keyMatch[1] !== 'description' && keyMatch[1] !== 'summary') {
              symbolName = keyMatch[1];
              symbolType = 'contract-schema';
            } else {
              symbolName = path.basename(fullPath);
              symbolType = 'contract-spec';
            }
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
              language: 'spec',
              artifactKind: 'derived-contract',
              specType: isProto ? 'protobuf' : isGraphql ? 'graphql' : 'openapi'
            }
          })
        );
      }
    }

    return symbols;
  }
}
