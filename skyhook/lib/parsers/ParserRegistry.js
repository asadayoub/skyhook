/**
 * ParserRegistry - Dynamic Registry and Pipeline for AST Language Parsers
 * Manages built-in language parsers and user-provided workspace extensions.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { BaseParser } from './BaseParser.js';

class ParserRegistryImpl {
  constructor() {
    this.entries = []; // Array of { parser: BaseParser, priority: number }
    this.loadedExtensions = new Set();
  }

  /**
   * Register a language parser with a given priority (higher priority evaluated first).
   * @param {BaseParser} parser 
   * @param {number} priority 
   */
  register(parser, priority = 100) {
    if (!parser || !(parser instanceof BaseParser)) {
      throw new Error('Registered parser must be an instance of BaseParser');
    }

    // Remove existing parser with same ID if already registered
    this.unregister(parser.id);

    this.entries.push({ parser, priority });
    this.entries.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a parser by ID
   * @param {string} id 
   */
  unregister(id) {
    this.entries = this.entries.filter(e => e.parser.id !== id);
  }

  /**
   * Find a registered parser by its unique ID
   * @param {string} id 
   * @returns {BaseParser|null}
   */
  getParser(id) {
    const entry = this.entries.find(e => e.parser.id === id);
    return entry ? entry.parser : null;
  }

  /**
   * Get the highest-priority parser capable of handling the file
   * @param {string} filePath 
   * @param {string} [content]
   * @returns {BaseParser|null}
   */
  getParserForFile(filePath, content = '') {
    for (const { parser } of this.entries) {
      try {
        if (parser.canHandle(filePath, content)) {
          return parser;
        }
      } catch {
        // Skip parser if canHandle throws
      }
    }
    return null;
  }

  /**
   * Automatically discover and load custom parsers from .skyhook/extensions/parsers/
   * @param {string} projectDir 
   */
  async loadWorkspaceExtensions(projectDir) {
    if (!projectDir) return;
    const extensionsDir = path.join(projectDir, '.skyhook', 'extensions', 'parsers');
    if (!fs.existsSync(extensionsDir)) return;

    try {
      const files = fs.readdirSync(extensionsDir);
      for (const file of files) {
        if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;

        const fullPath = path.join(extensionsDir, file);
        if (this.loadedExtensions.has(fullPath)) continue;

        try {
          const fileUrl = pathToFileURL(fullPath).href;
          const module = await import(fileUrl);
          const CustomParserClass = module.default || module.CustomParser || Object.values(module).find(v => typeof v === 'function' && v.prototype instanceof BaseParser);

          if (CustomParserClass && CustomParserClass.prototype instanceof BaseParser) {
            const instance = new CustomParserClass();
            this.register(instance, 200); // Higher priority than built-ins
            this.loadedExtensions.add(fullPath);
          }
        } catch (err) {
          console.warn(`[ParserRegistry] Failed to load custom parser extension ${file}:`, err.message);
        }
      }
    } catch {
      // Non-fatal if extensions cannot be read
    }
  }

  /**
   * Get diagnostic status of all registered parsers
   * @returns {Object}
   */
  getStatus() {
    const status = {};
    for (const { parser } of this.entries) {
      status[parser.id] = parser.getStatus();
    }
    return status;
  }

  /**
   * Return array of all registered BaseParser instances
   * @returns {BaseParser[]}
   */
  getAllParsers() {
    return this.entries.map(e => e.parser);
  }

  /**
   * Reset registry to empty (primarily for testing)
   */
  clear() {
    this.entries = [];
    this.loadedExtensions.clear();
  }
}

export const ParserRegistry = new ParserRegistryImpl();
