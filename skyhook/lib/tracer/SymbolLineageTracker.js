/**
 * SymbolLineageTracker - Cross-Commit Symbol Lineage & Refactoring Tracker
 * Traces symbols across Git commits, detects renames and moves, and preserves requirement links.
 */

import { execSync } from 'child_process';
import path from 'path';

export class SymbolLineageTracker {
  /**
   * Compute an AST structural fingerprint for a code symbol.
   * Enables matching symbols even when renamed or refactored.
   * @param {Object} symbol 
   * @returns {Object} Fingerprint containing structural features
   */
  static computeASTFingerprint(symbol) {
    if (!symbol) return null;

    const context = (symbol.context || '').toLowerCase();
    
    // Extract parameter count heuristic
    const paramMatch = context.match(/\((.*?)\)/);
    const paramCount = paramMatch && paramMatch[1].trim()
      ? paramMatch[1].split(',').filter(p => p.trim().length > 0).length
      : 0;

    // Extract identifier tokens (excluding language keywords)
    const rawTokens = context.match(/[A-Za-z0-9_]{3,}/g) || [];
    const keywords = new Set([
      'function', 'class', 'const', 'let', 'var', 'async', 'await', 'return',
      'import', 'export', 'default', 'public', 'private', 'static', 'def', 'func',
      'type', 'struct', 'interface', 'package', 'impl', 'trait', 'void'
    ]);
    const tokens = new Set(rawTokens.filter(t => !keywords.has(t)));

    return {
      name: symbol.symbolName,
      type: symbol.symbolType,
      paramCount,
      tokens: Array.from(tokens),
      lineSpan: Math.max(1, (symbol.endLine || symbol.line) - symbol.line + 1),
      language: symbol.metadata?.language || 'unknown'
    };
  }

  /**
   * Calculate structural similarity score [0.0 - 1.0] between two symbols
   * @param {Object} symbolA 
   * @param {Object} symbolB 
   * @returns {number}
   */
  static calculateSimilarity(symbolA, symbolB) {
    if (!symbolA || !symbolB) return 0;

    const fpA = this.computeASTFingerprint(symbolA);
    const fpB = this.computeASTFingerprint(symbolB);

    let score = 0;

    // Exact name match gives immediate high affinity
    if (fpA.name.toLowerCase() === fpB.name.toLowerCase()) {
      score += 0.35;
    } else {
      // Substring or fuzzy name match
      if (fpA.name.toLowerCase().includes(fpB.name.toLowerCase()) ||
          fpB.name.toLowerCase().includes(fpA.name.toLowerCase())) {
        score += 0.15;
      }
    }

    // Symbol type match (function, class, method)
    if (fpA.type === fpB.type) {
      score += 0.25;
    }

    // Parameter count match
    if (fpA.paramCount === fpB.paramCount) {
      score += 0.20;
    }

    // Body token Jaccard similarity (excluding the symbol name itself to support renaming)
    const nameA = fpA.name.toLowerCase();
    const nameB = fpB.name.toLowerCase();
    const tokensA = fpA.tokens.filter(t => t !== nameA);
    const tokensB = fpB.tokens.filter(t => t !== nameB);
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const union = new Set([...setA, ...setB]);
    if (union.size > 0) {
      let intersection = 0;
      for (const t of setA) {
        if (setB.has(t)) intersection++;
      }
      score += 0.35 * (intersection / union.size);
    }

    return Math.min(1.0, score);
  }

  /**
   * Search candidate symbols to find the best refactored match for a target symbol
   * @param {Object} targetSymbol 
   * @param {Array<Object>} candidates 
   * @param {number} threshold - Minimum similarity score (default: 0.70)
   * @returns {Object|null}
   */
  static findRefactoredMatch(targetSymbol, candidates = [], threshold = 0.70) {
    let bestMatch = null;
    let highestScore = 0;

    for (const candidate of candidates) {
      // Don't compare identical file:line locations
      if (candidate.file === targetSymbol.file && candidate.line === targetSymbol.line) {
        continue;
      }

      const sim = this.calculateSimilarity(targetSymbol, candidate);
      if (sim > highestScore && sim >= threshold) {
        highestScore = sim;
        bestMatch = {
          symbol: candidate,
          similarity: Math.round(sim * 100),
          reason: targetSymbol.symbolName !== candidate.symbolName ? 'renamed' : 'moved'
        };
      }
    }

    return bestMatch;
  }

  /**
   * Inspect Git commit history for a file to discover file renames or moves
   * @param {string} projectDir 
   * @param {string} relativeFilePath 
   * @param {number} limit 
   * @returns {Array<Object>}
   */
  static getFileGitHistory(projectDir, relativeFilePath, limit = 10) {
    try {
      const output = execSync(
        `git log --follow --name-status --oneline -n ${limit} -- "${relativeFilePath}"`,
        { cwd: projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const commits = [];
      const lines = output.trim().split('\n');
      let currentCommit = null;

      for (const line of lines) {
        const commitMatch = line.match(/^([a-f0-9]+)\s+(.*)/);
        if (commitMatch && !line.match(/^[A-Z]\t/)) {
          currentCommit = {
            hash: commitMatch[1],
            message: commitMatch[2],
            files: []
          };
          commits.push(currentCommit);
        } else if (currentCommit && line.match(/^[A-Z0-9]+\t/)) {
          const parts = line.split('\t');
          currentCommit.files.push({
            status: parts[0],
            path: parts[1],
            oldPath: parts[2] || null
          });
        }
      }

      return commits;
    } catch {
      return []; // Return empty array if not in a git repo
    }
  }

  /**
   * Detect broken requirement traces and suggest lineage recoveries
   * @param {Array<Object>} allSymbols 
   * @param {Array<Object>} requirements 
   * @returns {Array<Object>}
   */
  static detectBrokenLineage(allSymbols = [], requirements = []) {
    const tracedReqIds = new Set(allSymbols.filter(s => s.traced).map(s => s.requirementId));
    const broken = [];

    for (const req of requirements) {
      if (!tracedReqIds.has(req.id)) {
        // Look for potential matches across untraced symbols
        const potentialMatches = allSymbols
          .filter(s => !s.traced)
          .map(s => ({
            symbol: s,
            score: this.calculateKeywordMatch(req.title + ' ' + (req.description || ''), s)
          }))
          .filter(m => m.score >= 0.5)
          .sort((a, b) => b.score - a.score);

        if (potentialMatches.length > 0) {
          broken.push({
            requirementId: req.id,
            requirementTitle: req.title,
            suggestedSymbols: potentialMatches.slice(0, 3).map(m => ({
              file: m.symbol.file,
              symbolName: m.symbol.symbolName,
              line: m.symbol.line,
              confidence: Math.round(m.score * 100)
            }))
          });
        }
      }
    }

    return broken;
  }

  /**
   * Helper keyword similarity check between requirement text and symbol
   */
  static calculateKeywordMatch(text, symbol) {
    if (!text || !symbol) return 0;

    const splitWords = (str) => {
      if (!str) return [];
      const expanded = str
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\W]+/g, ' ')
        .toLowerCase();
      return (expanded.match(/[a-z0-9]{3,}/g) || []);
    };

    const keywords = new Set([
      'function', 'class', 'const', 'let', 'var', 'async', 'await', 'return',
      'import', 'export', 'default', 'public', 'private', 'static', 'def', 'func',
      'type', 'struct', 'interface', 'package', 'impl', 'trait', 'void'
    ]);

    const reqWords = new Set(splitWords(text));
    const rawSymbolWords = splitWords(symbol.symbolName + ' ' + (symbol.context || ''));
    const symbolWords = new Set(rawSymbolWords.filter(w => !keywords.has(w)));

    if (reqWords.size === 0 || symbolWords.size === 0) return 0;

    const commonPrefixLen = (a, b) => {
      let len = 0;
      while (len < a.length && len < b.length && a[len] === b[len]) len++;
      return len;
    };

    let matches = 0;
    for (const sw of symbolWords) {
      for (const rw of reqWords) {
        if (
          rw === sw ||
          rw.startsWith(sw) ||
          sw.startsWith(rw) ||
          commonPrefixLen(rw, sw) >= 5
        ) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.min(symbolWords.size, 5);
  }
}
