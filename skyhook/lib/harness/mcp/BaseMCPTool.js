/**
 * BaseMCPTool - Abstract base class for all Skyhook MCP Tools
 * Enables modular, plug-and-play tool definitions for the Model Context Protocol.
 */

export class BaseMCPTool {
  /**
   * @param {string} name - Unique tool name (e.g. 'skyhook_get_next_task')
   * @param {string} description - Human and LLM readable tool description
   * @param {Object} inputSchema - JSON Schema for arguments
   */
  constructor(name, description, inputSchema = { type: 'object', properties: {} }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }
    this.name = name;
    this.description = description || '';
    this.inputSchema = inputSchema;
  }

  /**
   * Return tool metadata compliant with MCP tools/list specification
   * @returns {Object}
   */
  toDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema
    };
  }

  /**
   * Execute the tool with given arguments and Skyhook context
   * @param {Object} args - Arguments passed by the MCP client
   * @param {Object} context - SkyhookContext or workspace context
   * @returns {Promise<Object>} Tool result object: { content: [{ type: 'text', text: string }], isError?: boolean }
   */
  async execute(args = {}, context = {}) {
    throw new Error(`execute() not implemented for tool '${this.name}'`);
  }

  /**
   * Helper to format successful text content
   * @param {any} data 
   * @returns {Object}
   */
  formatSuccess(data) {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }

  /**
   * Helper to format error content
   * @param {string|Error} err 
   * @returns {Object}
   */
  formatError(err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${message}`
        }
      ]
    };
  }
}
