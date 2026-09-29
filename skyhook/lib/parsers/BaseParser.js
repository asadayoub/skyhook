/**
 * BaseParser - Abstract Base Class for all Skyhook Language Parsers
 * Every language parser must extend this class and implement its core contract.
 */

import path from 'path';

export class BaseParser {
  /**
   * Unique parser ID (e.g., 'javascript', 'python', 'go', 'rust')
   * @type {string}
   */
  get id() {
    throw new Error('Parser must define a unique getter: id');
  }

  /**
   * Human-readable parser display name
   * @type {string}
   */
  get name() {
    return this.id;
  }

  /**
   * List of supported file extensions (lowercase with leading dot)
   * @returns {string[]} e.g., ['.py', '.pyw', '.pyi']
   */
  getSupportedExtensions() {
    return [];
  }

  /**
   * Determine if this parser can handle the given file.
   * Can check extension, filename, or sniff initial content (e.g. shebangs).
   * @param {string} filePath 
   * @param {string} [content]
   * @returns {boolean}
   */
  canHandle(filePath, content = '') {
    const ext = path.extname(filePath).toLowerCase();
    const extensions = this.getSupportedExtensions();
    return extensions.includes(ext);
  }

  /**
   * Extract AST symbols from source file.
   * @param {string} fullPath - Absolute path to the file
   * @param {string} projectDir - Workspace root directory
   * @param {Object} [options] - Parsing options
   * @returns {Promise<Array<Object>>} Standardized ASTSymbol objects
   */
  async parse(fullPath, projectDir, options = {}) {
    throw new Error(`parse() must be implemented by parser '${this.id}'`);
  }

  /**
   * Extract requirement ID annotations from comments or docstrings.
   * Recognizes:
   *  - @skyhook-implements REQ-XXX
   *  - implements: REQ-XXX
   *  - @implements REQ-XXX
   * @param {string} text
   * @returns {string|null} The requirement ID or null
   */
  extractRequirementId(text) {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/(@skyhook-implements|implements:|@implements|@skyhookimplements)(?:\s+|(?:\(["']))([A-Za-z0-9_-]+)/i);
    return match ? match[2] : null;
  }

  /**
   * Standardize symbol object to maintain a strict common interchange schema.
   * @param {Object} data 
   * @returns {Object}
   */
  createSymbol({
    file,
    symbolName = 'Anonymous',
    symbolType = 'function',
    parentSymbol = null,
    line = 1,
    endLine = line,
    context = '',
    requirementId = null,
    metadata = {}
  }) {
    return {
      file,
      symbolName,
      symbolType,
      parentSymbol,
      line: Math.max(1, line),
      endLine: Math.max(line, endLine),
      context: (context || '').trim(),
      traced: Boolean(requirementId),
      requirementId: requirementId || null,
      metadata: {
        language: this.id,
        ...metadata
      }
    };
  }

  /**
   * Health and diagnostic status of this parser.
   * @returns {Object}
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      loaded: true,
      extensions: this.getSupportedExtensions(),
      error: null
    };
  }
}
