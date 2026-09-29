/**
 * DarkMatterAnalyzer - Codebase Coverage & Dark Matter Risk Engine
 * Computes exact mathematical coverage rates, risk stratification,
 * language distributions, and hierarchical treemap data for untraced code.
 */

import path from 'path';

export class DarkMatterAnalyzer {
  /**
   * Run comprehensive dark matter analysis over indexed symbols
   * @param {Array<Object>} allSymbols 
   * @returns {Object}
   */
  static analyze(allSymbols = []) {
    const totalSymbols = allSymbols.length;
    const tracedSymbols = allSymbols.filter(s => s.traced).length;
    const untracedSymbols = totalSymbols - tracedSymbols;
    const overallCoverage = totalSymbols > 0 ? Math.round((tracedSymbols / totalSymbols) * 100) : 0;

    // File-level aggregation
    const fileMap = new Map();
    const languageStats = {};

    for (const s of allSymbols) {
      const file = s.file;
      const lang = s.metadata?.language || 'other';

      // Track language stats
      if (!languageStats[lang]) {
        languageStats[lang] = { total: 0, traced: 0, untraced: 0 };
      }
      languageStats[lang].total++;
      if (s.traced) languageStats[lang].traced++;
      else languageStats[lang].untraced++;

      // Track file stats
      if (!fileMap.has(file)) {
        fileMap.set(file, {
          file,
          language: lang,
          total: 0,
          traced: 0,
          untraced: 0,
          untracedSymbols: [],
          tracedSymbols: []
        });
      }

      const fileEntry = fileMap.get(file);
      fileEntry.total++;
      if (s.traced) {
        fileEntry.traced++;
        fileEntry.tracedSymbols.push({
          name: s.symbolName,
          type: s.symbolType,
          line: s.line,
          reqId: s.requirementId
        });
      } else {
        fileEntry.untraced++;
        fileEntry.untracedSymbols.push({
          name: s.symbolName,
          type: s.symbolType,
          line: s.line,
          context: s.context
        });
      }
    }

    // Process files with coverage and risk tier
    const files = [];
    for (const [file, stats] of fileMap.entries()) {
      const coverage = stats.total > 0 ? Math.round((stats.traced / stats.total) * 100) : 0;
      let risk = 'grounded';
      if (stats.untraced >= 10 || (stats.untraced >= 5 && coverage === 0)) {
        risk = 'critical';
      } else if (stats.untraced > 0 && coverage < 50) {
        risk = 'moderate';
      } else if (stats.untraced > 0) {
        risk = 'low';
      }

      files.push({
        file,
        language: stats.language,
        total: stats.total,
        traced: stats.traced,
        untraced: stats.untraced,
        coverage,
        risk,
        untracedSymbols: stats.untracedSymbols,
        tracedSymbols: stats.tracedSymbols
      });
    }

    // Sort files by highest untraced count first
    files.sort((a, b) => b.untraced - a.untraced);

    // Compute directory-level hierarchy for Treemap visualization
    const directories = this.computeDirectoryHierarchy(files);

    // Compute language percentages
    const languages = Object.entries(languageStats).map(([lang, stat]) => ({
      language: lang,
      total: stat.total,
      traced: stat.traced,
      untraced: stat.untraced,
      coverage: stat.total > 0 ? Math.round((stat.traced / stat.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    return {
      summary: {
        totalSymbols,
        tracedSymbols,
        untracedSymbols,
        overallCoverage,
        criticalFilesCount: files.filter(f => f.risk === 'critical').length,
        moderateFilesCount: files.filter(f => f.risk === 'moderate').length,
        groundedFilesCount: files.filter(f => f.risk === 'grounded').length
      },
      files,
      directories,
      languages
    };
  }

  /**
   * Aggregate files into hierarchical directory nodes
   * @param {Array<Object>} files 
   * @returns {Array<Object>}
   */
  static computeDirectoryHierarchy(files) {
    const dirMap = new Map();

    for (const file of files) {
      const dir = path.dirname(file.file);
      const topDir = dir === '.' ? 'root' : dir.split(path.sep)[0];

      if (!dirMap.has(topDir)) {
        dirMap.set(topDir, {
          directory: topDir,
          total: 0,
          traced: 0,
          untraced: 0,
          fileCount: 0
        });
      }

      const entry = dirMap.get(topDir);
      entry.total += file.total;
      entry.traced += file.traced;
      entry.untraced += file.untraced;
      entry.fileCount++;
    }

    return Array.from(dirMap.values()).map(d => ({
      ...d,
      coverage: d.total > 0 ? Math.round((d.traced / d.total) * 100) : 0
    })).sort((a, b) => b.untraced - a.untraced);
  }
}
