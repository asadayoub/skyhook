/**
 * BaseMCPResource - Abstract base class for all Skyhook MCP Resources
 * Enables modular URI providers (e.g. skyhook://backlog, skyhook://decisions).
 */

export class BaseMCPResource {
  /**
   * @param {string} uri - Unique URI (e.g. 'skyhook://backlog')
   * @param {string} name - Human readable resource name
   * @param {string} [mimeType] - MIME type ('application/json', 'text/markdown', etc.)
   * @param {string} [description] - Resource description
   */
  constructor(uri, name, mimeType = 'application/json', description = '') {
    if (!uri || typeof uri !== 'string') {
      throw new Error('Resource URI must be a non-empty string');
    }
    this.uri = uri;
    this.name = name || uri;
    this.mimeType = mimeType;
    this.description = description;
  }

  /**
   * Return resource metadata for MCP resources/list
   * @returns {Object}
   */
  toDefinition() {
    return {
      uri: this.uri,
      name: this.name,
      description: this.description,
      mimeType: this.mimeType
    };
  }

  /**
   * Read the resource content for a given URI
   * @param {string} uri 
   * @param {Object} context - SkyhookContext or workspace context
   * @returns {Promise<Object>} { contents: [{ uri, mimeType, text }] }
   */
  async read(uri, context = {}) {
    throw new Error(`read() not implemented for resource '${this.uri}'`);
  }

  /**
   * Format content object
   * @param {string} uri 
   * @param {string} text 
   * @param {string} [mimeType] 
   * @returns {Object}
   */
  formatContent(uri, text, mimeType = this.mimeType) {
    return {
      contents: [
        {
          uri,
          mimeType,
          text
        }
      ]
    };
  }
}
