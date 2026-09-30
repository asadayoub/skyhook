/**
 * SemanticRuleEngine - Declarative AST Pattern Matching & Architecture Linter
 * Enforces clean code patterns, prevents architectural leaks, and flags smells:
 * - no-direct-env-access: Flags process.env calls outside config directories
 * - no-raw-sql-in-controllers: Flags raw SQL literals in presentation/controllers
 * - enforce-repository-pattern: Flags direct ORM calls in HTTP controllers
 * - enforce-structured-logging: Flags console.log / print in core services
 * Supports custom declarative rules via .skyhook/architecture-boundaries.yaml
 */

import fs from 'fs';
import path from 'path';
import { StandardsRegistry } from '../standards/StandardsRegistry.js';

export class SemanticRuleEngine {
  /**
   * @param {string} projectDir 
   * @param {Object} [config] - Optional configuration overrides or boundary rules
   */
  constructor(projectDir = process.cwd(), config = {}) {
    this.projectDir = path.resolve(projectDir);
    this.config = config.semantic_rules || config || {};
    this.rules = this.initRules();
  }

  /**
   * Initialize built-in rules merged with user configurations
   */
  initRules() {
    const defaultRules = [
      {
        id: 'no-direct-env-access',
        name: 'No Direct Environment Variable Access',
        description: 'Environment variables should only be read inside configuration modules to ensure validation and central access.',
        severity: 'error',
        allowedPaths: ['**/config/**', '**/settings/**', '**/env/**', '**/cli/**', '**/.env*'],
        ignoredPaths: ['**/test/**', '**/*.test.*', '**/*.spec.*', '**/fixtures/**', '**/node_modules/**'],
        check: (filePath, lineContent, lineNum) => {
          // JS/TS: process.env.VAR or process.env['VAR']
          const jsEnvMatch = lineContent.match(/\bprocess\.env(\.([A-Za-z0-9_]+)|\[['"`]([A-Za-z0-9_]+)['"`]\])/);
          if (jsEnvMatch) {
            const varName = jsEnvMatch[2] || jsEnvMatch[3] || 'UNKNOWN';
            return {
              matched: true,
              message: `Direct access to process.env.${varName} outside configuration directory`,
              suggestion: 'Import validated configuration properties from your central config module.'
            };
          }
          // Python: os.environ[...] or os.getenv(...)
          const pyEnvMatch = lineContent.match(/\bos\.(environ(?:\[['"][A-Za-z0-9_]+['"]\]|\.get\(['"][A-Za-z0-9_]+['"]\))|getenv\(['"][A-Za-z0-9_]+['"]\))/);
          if (pyEnvMatch) {
            return {
              matched: true,
              message: `Direct access to os.getenv/os.environ outside configuration directory`,
              suggestion: 'Access environment variables through a centralized settings module.'
            };
          }
          return { matched: false };
        }
      },
      {
        id: 'no-raw-sql-in-controllers',
        name: 'No Raw SQL in Presentation / Controllers',
        description: 'Presentation controllers and route handlers should not contain raw SQL query statements.',
        severity: 'error',
        targetPaths: ['**/controllers/**', '**/routes/**', '**/handlers/**', '**/presentation/**', '**/views/**', '**/api/**'],
        ignoredPaths: ['**/test/**', '**/*.test.*', '**/*.spec.*', '**/fixtures/**'],
        check: (filePath, lineContent, lineNum) => {
          // Detect SQL keywords
          const sqlMatch = lineContent.match(/\b(SELECT\s+[\w\s,*]+\s+FROM|INSERT\s+INTO\s+[\w.]+|UPDATE\s+[\w.]+\s+SET|DELETE\s+FROM\s+[\w.]+|DROP\s+TABLE|ALTER\s+TABLE)\b/i);
          if (sqlMatch) {
            return {
              matched: true,
              message: `Raw SQL statement literal '${sqlMatch[1].trim()}' detected inside controller/presentation layer`,
              suggestion: 'Encapsulate database queries in repositories or data mappers.'
            };
          }
          return { matched: false };
        }
      },
      {
        id: 'enforce-repository-pattern',
        name: 'Enforce Repository Pattern in Controllers',
        description: 'HTTP controllers should invoke repositories or services, not direct ORM/database client queries.',
        severity: 'warning',
        targetPaths: ['**/controllers/**', '**/routes/**', '**/handlers/**', '**/presentation/**'],
        ignoredPaths: ['**/test/**', '**/*.test.*', '**/*.spec.*', '**/fixtures/**', '**/repositories/**', '**/models/**'],
        check: (filePath, lineContent, lineNum) => {
          // Prisma direct model call in controller
          const prismaMatch = lineContent.match(/\bprisma\.([A-Za-z0-9_]+)\.(findMany|findUnique|findFirst|create|update|delete|upsert|aggregate)\b/);
          if (prismaMatch) {
            return {
              matched: true,
              message: `Direct ORM call 'prisma.${prismaMatch[1]}.${prismaMatch[2]}()' found in controller`,
              suggestion: 'Delegate data persistence to a Repository or Service method.'
            };
          }
          // Direct DB query client call
          const directDbMatch = lineContent.match(/\b(db|database|session|connection|knex)\.(query|raw|select|table|collection)\s*\(/);
          if (directDbMatch) {
            return {
              matched: true,
              message: `Direct database connection call '${directDbMatch[0]}' found in controller`,
              suggestion: 'Use a repository interface instead of invoking the database client directly.'
            };
          }
          // Active Record direct model query
          const activeRecordMatch = lineContent.match(/\b([A-Z][A-Za-z0-9_]+)\.(find|findById|findOne|create|update|destroy|where|save)\s*\(/);
          if (activeRecordMatch && !filePath.includes('services/')) {
            const modelName = activeRecordMatch[1];
            // Disregard standard JS built-ins like Promise.resolve, Object.assign, Array.from
            const builtIns = ['Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Date', 'Reflect', 'Map', 'Set', 'Buffer', 'RegExp', 'Error', 'URL', 'Event'];
            if (!builtIns.includes(modelName)) {
              return {
                matched: true,
                message: `ActiveRecord model query '${modelName}.${activeRecordMatch[2]}()' called directly from controller`,
                suggestion: 'Abstract data access behind an application service or repository.'
              };
            }
          }
          return { matched: false };
        }
      },
      {
        id: 'enforce-structured-logging',
        name: 'Enforce Structured Logging in Core Layers',
        description: 'Server services and controllers should use structured loggers rather than console logging.',
        severity: 'warning',
        targetPaths: ['**/controllers/**', '**/services/**', '**/handlers/**', '**/domain/**'],
        ignoredPaths: ['**/test/**', '**/*.test.*', '**/*.spec.*', '**/fixtures/**', '**/scripts/**', '**/cli/**'],
        check: (filePath, lineContent, lineNum) => {
          const consoleMatch = lineContent.match(/\bconsole\.(log|warn|error|info|debug)\s*\(/);
          if (consoleMatch) {
            return {
              matched: true,
              message: `Unstructured 'console.${consoleMatch[1]}()' detected in application core`,
              suggestion: 'Use a structured logging utility (e.g. logger.info({ ... })) for production tracing.'
            };
          }
          return { matched: false };
        }
      }
    ];

    // Merge custom user configuration
    const userRulesConfig = this.config || {};
    const rules = [];

    for (const rule of defaultRules) {
      const userRuleConfig = userRulesConfig[rule.id];
      if (userRuleConfig && userRuleConfig.severity === 'off') {
        continue; // Rule disabled
      }
      if (userRuleConfig) {
        if (userRuleConfig.severity) rule.severity = userRuleConfig.severity;
        if (userRuleConfig.allowed_paths) rule.allowedPaths = userRuleConfig.allowed_paths;
        if (userRuleConfig.target_paths) rule.targetPaths = userRuleConfig.target_paths;
        if (userRuleConfig.ignored_paths) rule.ignoredPaths = userRuleConfig.ignored_paths;
      }
      rules.push(rule);
    }

    // Add user custom rules
    if (Array.isArray(userRulesConfig.custom_rules)) {
      for (const custom of userRulesConfig.custom_rules) {
        if (!custom.id || !custom.pattern) continue;
        const regex = new RegExp(custom.pattern, custom.flags || '');
        rules.push({
          id: custom.id,
          name: custom.name || custom.id,
          description: custom.description || '',
          severity: custom.severity || 'warning',
          targetPaths: custom.target_paths || ['**/*'],
          ignoredPaths: custom.ignored_paths || ['**/node_modules/**', '**/test/**'],
          check: (filePath, lineContent, lineNum) => {
            if (regex.test(lineContent)) {
              return {
                matched: true,
                message: custom.message || `Custom rule '${custom.id}' violation`,
                suggestion: custom.suggestion || 'Refactor code to satisfy architecture guidelines.'
              };
            }
            return { matched: false };
          }
        });
      }
    }

    // Dynamically load automated rules from modular standards
    try {
      const standards = StandardsRegistry.loadAll(this.projectDir);
      for (const std of standards) {
        if (!Array.isArray(std.automatedRules)) continue;
        for (const autoRule of std.automatedRules) {
          if (!autoRule || !autoRule.pattern) continue;
          try {
            const regex = new RegExp(autoRule.pattern, autoRule.flags || '');
            rules.push({
              id: autoRule.ruleId || `${std.id}-${rules.length + 1}`,
              standardId: std.id,
              name: autoRule.name || autoRule.ruleId,
              description: autoRule.message || std.title,
              severity: autoRule.severity || std.severity || 'error',
              targetPaths: autoRule.targetPaths || ['**/*'],
              allowedPaths: autoRule.allowedPaths || null,
              ignoredPaths: autoRule.ignoredPaths || ['**/node_modules/**', '**/test/**'],
              check: (filePath, lineContent, lineNum) => {
                if (regex.test(lineContent)) {
                  return {
                    matched: true,
                    standardId: std.id,
                    message: autoRule.message || `Standard [${std.id}] rule violation: ${autoRule.name || autoRule.ruleId}`,
                    suggestion: `Satisfy standard ${std.id} (${std.title}) guidelines.`
                  };
                }
                return { matched: false };
              }
            });
          } catch (_) {
            // Skip invalid regex pattern safely
          }
        }
      }
    } catch (_) {
      // In environments where standards aren't initialized yet, proceed safely
    }

    return rules;
  }

  /**
   * Check if a path matches a glob-like pattern list
   * @param {string} normPath - Normalized relative path with forward slashes
   * @param {string[]} patterns
   * @returns {boolean}
   */
  matchesPatternList(normPath, patterns) {
    if (!patterns || patterns.length === 0) return false;
    for (const pattern of patterns) {
      if (this.matchGlob(normPath, pattern)) return true;
    }
    return false;
  }

  /**
   * Minimal glob matching for path filtering
   * @param {string} str 
   * @param {string} pattern 
   * @returns {boolean}
   */
  matchGlob(str, pattern) {
    const cleanPattern = pattern.replace(/\\/g, '/');
    const regexPattern = cleanPattern
      .replace(/\./g, '\\.')
      .replace(/\*\*\//g, '(.+/)?')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${regexPattern}$`).test(str) ||
           new RegExp(regexPattern).test(str);
  }

  /**
   * Analyze a single file for semantic rule violations
   * @param {string} filePath - Absolute or project-relative file path
   * @param {string} [fileContent] - Optional pre-read content
   * @returns {Array<Object>}
   */
  checkFile(filePath, fileContent = null) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectDir, filePath);
    const relPath = path.relative(this.projectDir, fullPath).replace(/\\/g, '/');

    if (!fileContent) {
      if (!fs.existsSync(fullPath)) return [];
      try {
        fileContent = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        return [];
      }
    }

    const violations = [];
    const lines = fileContent.split(/\r?\n/);

    for (const rule of this.rules) {
      // Check ignored paths
      if (rule.ignoredPaths && this.matchesPatternList(relPath, rule.ignoredPaths)) {
        continue;
      }

      // Check allowed paths
      if (rule.allowedPaths && this.matchesPatternList(relPath, rule.allowedPaths)) {
        continue;
      }

      // Check target paths
      if (rule.targetPaths && !this.matchesPatternList(relPath, rule.targetPaths)) {
        continue;
      }

      // Check file line by line
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Handle block comments (C-style)
        if (inBlockComment) {
          if (trimmed.includes('*/')) inBlockComment = false;
          continue;
        }
        if (trimmed.startsWith('/*')) {
          if (!trimmed.includes('*/')) inBlockComment = true;
          continue;
        }

        // Ignore single-line comments
        if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
          continue;
        }

        const result = rule.check(relPath, line, i + 1);
        if (result && result.matched) {
          violations.push({
            ruleId: rule.id,
            standardId: rule.standardId || result.standardId || null,
            ruleName: rule.name,
            severity: rule.severity,
            file: relPath,
            line: i + 1,
            snippet: trimmed,
            message: result.message,
            suggestion: result.suggestion
          });
        }
      }
    }

    return violations;
  }

  /**
   * Run semantic rule engine against all or specified files
   * @param {string[]} [fileList] 
   * @returns {Object} Report containing violations, health score deduction, and stats
   */
  async run(fileList = null) {
    const filesToScan = fileList || this.discoverSourceFiles(this.projectDir);
    const allViolations = [];
    let criticalsCount = 0;
    let errorsCount = 0;
    let warningsCount = 0;

    for (const file of filesToScan) {
      const violations = this.checkFile(file);
      for (const v of violations) {
        allViolations.push(v);
        if (v.severity === 'critical') criticalsCount++;
        else if (v.severity === 'error') errorsCount++;
        else warningsCount++;
      }
    }

    return {
      violations: allViolations,
      totalChecked: filesToScan.length,
      criticalsCount,
      errorsCount,
      warningsCount,
      pass: criticalsCount === 0 && errorsCount === 0
    };
  }

  /**
   * Verify all active engineering standards across project files
   * Exits with code 1 on critical and error violations; logs warnings non-blockingly.
   * @param {string[]} [fileList]
   * @returns {Promise<Object>}
   */
  async verifyStandards(fileList = null) {
    const report = await this.run(fileList);
    const standardViolations = report.violations.filter(v => v.standardId);
    const critical = report.violations.filter(v => v.severity === 'critical').length;
    const error = report.violations.filter(v => v.severity === 'error').length;
    const warning = report.violations.filter(v => v.severity === 'warning').length;
    const advisory = report.violations.filter(v => v.severity === 'advisory' || v.severity === 'info').length;

    const pass = critical === 0 && error === 0;
    return {
      pass,
      exitCode: pass ? 0 : 1,
      totalChecked: report.totalChecked,
      summary: {
        critical,
        error,
        warning,
        advisory,
        total: report.violations.length
      },
      violations: report.violations,
      standardViolations
    };
  }

  /**
   * Scan project directory for source files
   * @param {string} dir 
   * @returns {string[]}
   */
  discoverSourceFiles(dir) {
    const results = [];
    const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java']);
    const ignoreDirs = new Set(['node_modules', '.git', '.skyhook', 'dist', 'build', 'coverage', '.gemini']);

    const walk = (current) => {
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (ignoreDirs.has(entry.name)) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (exts.has(ext)) {
            results.push(path.relative(this.projectDir, full).replace(/\\/g, '/'));
          }
        }
      }
    };

    walk(dir);
    return results;
  }
}
