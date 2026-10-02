/**
 * MCPServer - 100% Offline Model Context Protocol (MCP) JSON-RPC 2.0 Engine
 * Implements MCP specification 2024-11-05.
 * Zero external network calls, zero external telemetry.
 */

import { MCPToolRegistry } from './MCPToolRegistry.js';
import { MCPResourceRegistry } from './MCPResourceRegistry.js';
import { createSkyhookContext } from '../../context.js';
import { SKYHOOK_VERSION } from '../../utils.js';

export const PROTOCOL_VERSION = '2024-11-05';

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

export class MCPServer {
  /**
   * @param {Object} [options]
   * @param {string} [options.projectDir]
   * @param {MCPToolRegistry} [options.toolRegistry]
   * @param {MCPResourceRegistry} [options.resourceRegistry]
   */
  constructor(options = {}) {
    this.projectDir = options.projectDir || process.cwd();
    this.toolRegistry = options.toolRegistry || MCPToolRegistry.createDefault();
    this.resourceRegistry = options.resourceRegistry || MCPResourceRegistry.createDefault();
    this.context = options.context || createSkyhookContext(this.projectDir);
  }

  /**
   * Handle incoming parsed JSON-RPC request and return response object
   * @param {Object} req - Parsed JSON-RPC request
   * @returns {Promise<Object|null>} JSON-RPC response or null for notifications
   */
  async handleRequest(req) {
    if (!req || typeof req !== 'object') {
      return this.createError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request');
    }

    const { id, method, params } = req;

    // Notifications (no ID)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        return null;
      }
      return null;
    }

    try {
      switch (method) {
        // 1. Handshake
        case 'initialize':
          return this.createSuccess(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: {},
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: 'skyhook-mcp',
              version: SKYHOOK_VERSION || '2.0.0'
            }
          });

        // 2. Ping
        case 'ping':
          return this.createSuccess(id, {});

        // 3. Tools
        case 'tools/list':
          return this.createSuccess(id, {
            tools: this.toolRegistry.list()
          });

        case 'tools/call': {
          if (!params || !params.name) {
            return this.createError(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'Missing tool name in params');
          }
          const result = await this.toolRegistry.execute(params.name, params.arguments || {}, this.context);
          return this.createSuccess(id, result);
        }

        // 4. Resources
        case 'resources/list':
          return this.createSuccess(id, {
            resources: this.resourceRegistry.list()
          });

        case 'resources/read': {
          if (!params || !params.uri) {
            return this.createError(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'Missing uri in params');
          }
          const content = await this.resourceRegistry.read(params.uri, this.context);
          return this.createSuccess(id, content);
        }

        // 5. Prompts
        case 'prompts/list':
          return this.createSuccess(id, {
            prompts: [
              {
                name: 'task_kickoff',
                description: 'Prepares context and acceptance criteria to implement a specific story.',
                arguments: [
                  { name: 'storyId', description: 'ID of the story to implement', required: true }
                ]
              },
              {
                name: 'architecture_review',
                description: 'Prompts an AI model to evaluate code against accepted ADR policies and boundary invariants.',
                arguments: []
              }
            ]
          });

        case 'prompts/get': {
          if (!params || !params.name) {
            return this.createError(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'Missing prompt name in params');
          }
          return this.handlePromptGet(id, params.name, params.arguments || {});
        }

        default:
          return this.createError(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method '${method}' not found`);
      }
    } catch (err) {
      return this.createError(id, JSON_RPC_ERRORS.INTERNAL_ERROR, err.message || 'Internal MCP Server Error');
    }
  }

  /**
   * Handle prompts/get method
   */
  handlePromptGet(id, name, args) {
    if (name === 'task_kickoff') {
      const storyId = args.storyId || 'CURRENT';
      return this.createSuccess(id, {
        description: `Kickoff workflow for story ${storyId}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You are implementing story ${storyId} in this Skyhook repository.\n1. Inspect the story requirements using 'skyhook_get_next_task' or 'skyhook://backlog'.\n2. Verify you hold an advisory lease on the story.\n3. Verify architectural boundaries before modifying files using 'skyhook_verify_policies'.\n4. Add '@skyhook-implements REQ-XXX' comments to all exported symbols.\n5. Transition the story to 'in-review' once completed.`
            }
          }
        ]
      });
    }

    if (name === 'architecture_review') {
      return this.createSuccess(id, {
        description: 'Review code changes for architectural boundary violations',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Review the current workspace changes against accepted Architectural Decision Records.\nCall 'skyhook_verify_policies' and 'skyhook_check_drift' to detect any prohibited imports, DDD layer bypasses, or circular dependencies.`
            }
          }
        ]
      });
    }

    return this.createError(id, JSON_RPC_ERRORS.INVALID_PARAMS, `Prompt '${name}' not found`);
  }

  createSuccess(id, result) {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  createError(id, code, message, data = null) {
    const res = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
    if (data !== null) res.error.data = data;
    return res;
  }
}
