/**
 * Skyhook Traceability Commands - Requirement→Code traceability
 */

import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml, loadProjectIgnoreRules } from './utils.js';
import { parseFile, getParserStatus } from './parsers/index.js';
import { SymbolLineageTracker } from './tracer/SymbolLineageTracker.js';
import { DarkMatterAnalyzer } from './tracer/DarkMatterAnalyzer.js';
import { parseADRMarkdown } from './adr/ADRMarkdownParser.js';

export { SymbolLineageTracker, DarkMatterAnalyzer };

// ==================== TRACE COMMAND ====================

/**
 * Find all code references to a requirement ID
 * @param {string} projectDir - Project root
 * @param {string} requirementId - Requirement ID to trace
 * @returns {Object} Trace results
 */
export async function traceRequirement(projectDir, requirementId, options = {}) {
  const results = {
    requirementId,
    requirement: null,
    stories: [],
    decisions: [],
    sourceSymbols: [],
    testSymbols: [],
    contractSymbols: [],
    codeReferences: [],
    files: [],
    lineage: []
  };

  // 1. Load requirement from .skyhook/
  const skyhookDir = findSkyhookDir(projectDir);
  if (!skyhookDir) {
    return { error: 'No .skyhook directory found' };
  }

  // Load requirement
  const functionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  const nonFunctionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  const allReqs = [...functionalReqs.requirements, ...nonFunctionalReqs.requirements];
  
  const requirement = allReqs.find(r => r.id === requirementId);
  if (!requirement) {
    return { error: `Requirement ${requirementId} not found` };
  }
  results.requirement = requirement;

  // 2. Find linked stories
  const backlog = readYaml(path.join(skyhookDir, 'backlog', 'epics.yaml')) || { epics: [], stories: [] };
  if (backlog.stories) {
    results.stories = backlog.stories.filter(s => 
      s.relatedRequirements?.includes(requirementId)
    );
  }

  // 3. Find linked decisions (check decisions/index.yaml + defensive markdown fallback)
  const decisionsIndexPath = path.join(skyhookDir, 'decisions', 'index.yaml');
  const decisionsData = readYaml(decisionsIndexPath) || { decisions: [] };
  const allDecisions = Array.isArray(decisionsData.decisions) ? decisionsData.decisions : [];
  const matchedDecisionsMap = new Map();

  for (const d of allDecisions) {
    const reqs = Array.isArray(d.relatedRequirements) ? d.relatedRequirements : [];
    if (reqs.includes(requirementId) || (d.title && d.title.includes(requirementId))) {
      matchedDecisionsMap.set(d.id, {
        id: d.id,
        title: d.title || d.id,
        status: d.status || 'accepted',
        category: d.category || 'architecture',
        standards: d.standards || [],
        file: d.file || `decisions/records/${d.id}.md`,
        relatedRequirements: reqs
      });
    }
  }

  // Defensive fallback: inspect decisions/records/*.md for requirement references written in the ADR
  const recordsDir = path.join(skyhookDir, 'decisions', 'records');
  if (fs.existsSync(recordsDir)) {
    try {
      const recordFiles = fs.readdirSync(recordsDir).filter(f => f.endsWith('.md'));
      let indexRepaired = false;

      for (const file of recordFiles) {
        const fullPath = path.join(recordsDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = parseADRMarkdown(content);
        if (!parsed || !parsed.id) continue;

        const reqs = Array.isArray(parsed.relatedRequirements) ? parsed.relatedRequirements : [];
        if (reqs.includes(requirementId)) {
          if (!matchedDecisionsMap.has(parsed.id)) {
            matchedDecisionsMap.set(parsed.id, {
              id: parsed.id,
              title: parsed.title || file.replace('.md', ''),
              status: parsed.status || 'accepted',
              category: parsed.category || 'architecture',
              standards: parsed.standards || [],
              file: path.relative(skyhookDir, fullPath),
              relatedRequirements: reqs
            });
          }

          // Auto-repair index.yaml if missing
          const indexEntry = allDecisions.find(d => d.id === parsed.id);
          if (indexEntry) {
            const currentReqs = Array.isArray(indexEntry.relatedRequirements) ? indexEntry.relatedRequirements : [];
            if (!currentReqs.includes(requirementId)) {
              indexEntry.relatedRequirements = [...new Set([...currentReqs, ...reqs])];
              indexRepaired = true;
            }
          }
        }
      }

      if (indexRepaired) {
        writeYaml(decisionsIndexPath, decisionsData);
      }
    } catch {
      // Ignore record directory read errors
    }
  }

  results.decisions = Array.from(matchedDecisionsMap.values());

  // 4. Search codebase for annotations using the AST Parser
  results.codeReferences = await searchCodeForRequirement(projectDir, requirementId);

  // 4b. Segment code references into semantic buckets (source, test, spec contracts)
  const partitioned = partitionSymbols(results.codeReferences);
  results.sourceSymbols = partitioned.sourceSymbols;
  results.testSymbols = partitioned.testSymbols;
  results.contractSymbols = partitioned.contractSymbols;

  // 5. Collect unique files
  results.files = [...new Set(results.codeReferences.map(r => r.file))];

  // 6. Detect possible refactored symbols if lineage requested or untraced
  if (options.lineage || results.codeReferences.length === 0) {
    try {
      const allSymbols = await indexCodebase(projectDir);
      const broken = SymbolLineageTracker.detectBrokenLineage(allSymbols, [requirement]);
      results.lineage = broken.length > 0 ? broken[0].suggestedSymbols : [];
    } catch {
      results.lineage = [];
    }
  }

  return results;
}

/**
 * Search codebase for a specific requirement ID using AST
 */
export async function searchCodeForRequirement(projectDir, requirementId) {
  const allSymbols = await indexCodebase(projectDir);
  return allSymbols.filter(s => s.traced && s.requirementId === requirementId);
}

/**
 * Classify whether a symbol represents an API specification or contract
 */
export function isContractSymbol(symbol) {
  if (!symbol) return false;
  if (symbol.metadata?.artifactKind === 'derived-contract') return true;
  if (typeof symbol.symbolType === 'string' && symbol.symbolType.startsWith('contract-')) return true;
  if (symbol.metadata?.language === 'spec' || Boolean(symbol.metadata?.specType)) return true;
  const file = symbol.file || '';
  const ext = path.extname(file).toLowerCase();
  if (['.proto', '.graphql', '.gql'].includes(ext)) return true;
  return false;
}

/**
 * Classify whether a symbol represents a test verification
 */
export function isTestSymbol(symbol) {
  if (!symbol) return false;
  if (isContractSymbol(symbol)) return false;
  if (symbol.metadata?.artifactKind === 'test' || symbol.symbolType === 'test' || symbol.metadata?.isTest === true) {
    return true;
  }
  const file = symbol.file || '';
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  if (/(?:^|\/)(?:tests?|__tests__|spec)\//i.test(normalized)) {
    return true;
  }
  const filename = normalized.split('/').pop() || '';
  if (/(?:[._-](?:test|spec)\.[a-z0-9]+$)|(?:^test_[a-z0-9_]+\.py$)/i.test(filename)) {
    return true;
  }
  return false;
}

/**
 * Partition code references into source, test, and contract buckets
 */
export function partitionSymbols(symbols = []) {
  const sourceSymbols = [];
  const testSymbols = [];
  const contractSymbols = [];

  for (const sym of symbols) {
    if (isContractSymbol(sym)) {
      contractSymbols.push(sym);
    } else if (isTestSymbol(sym)) {
      testSymbols.push(sym);
    } else {
      sourceSymbols.push(sym);
    }
  }

  return { sourceSymbols, testSymbols, contractSymbols };
}

/**
 * Index the entire codebase to find all significant symbols (Classes, Functions)
 * This powers both Traceability and Brownfield Legacy Mapping
 */
export async function indexCodebase(projectDir) {
  const allSymbols = [];
  const ignoreFilter = loadProjectIgnoreRules(projectDir);
  
  async function searchDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');
        
        if (ignoreFilter.shouldIgnore(entry.name, relPath, entry.isDirectory())) {
          continue;
        }

        if (entry.isDirectory()) {
          await searchDir(fullPath);
        } else if (isCodeFile(entry.name)) {
          try {
            const symbols = await parseFile(fullPath, projectDir);
            allSymbols.push(...symbols);
          } catch (e) {
            // Ignore individual file parse errors
          }
        }
      }
    } catch (e) {
      // Ignore directory read errors
    }
  }

  await searchDir(projectDir);
  return allSymbols;
}

/**
 * Generate a coverage heatmap of traced vs untraced code
 */
export async function generateCoverageHeatmap(projectDir) {
  const allSymbols = await indexCodebase(projectDir);
  const analysis = DarkMatterAnalyzer.analyze(allSymbols);
  
  const darkMatter = analysis.files
    .filter(f => f.untraced > 0)
    .map(f => ({
      file: f.file,
      coveragePercentage: f.coverage,
      untracedCount: f.untraced,
      risk: f.risk
    }));

  return {
    summary: {
      totalSymbols: analysis.summary.totalSymbols,
      tracedSymbols: analysis.summary.tracedSymbols,
      untracedSymbols: analysis.summary.untracedSymbols,
      overallCoverage: analysis.summary.overallCoverage
    },
    darkMatter,
    parserStatus: getParserStatus(),
    analysis
  };
}

/**
 * Check if file is a code file we should search
 */
function isCodeFile(filename) {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt', '.swift',
    '.cs', '.php', '.rb', '.vue', '.svelte',
    '.json', '.yml', '.yaml', '.toml',
    '.proto', '.graphql', '.gql'
  ];
  return codeExtensions.some(ext => filename.endsWith(ext));
}

/**
 * Get impact analysis for a requirement
 */
export async function analyzeImpact(projectDir, requirementId) {
  const trace = await traceRequirement(projectDir, requirementId);
  if (trace.error) return trace;

  const impact = {
    requirementId,
    requirement: trace.requirement.title,
    directImpact: {
      stories: trace.stories.length,
      decisions: trace.decisions.length,
      codeFiles: trace.files.length,
      codeReferences: trace.codeReferences.length
    },
    stories: trace.stories.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      epicId: s.epicId
    })),
    decisions: trace.decisions.map(d => ({
      id: d.id,
      title: d.title,
      status: d.status
    })),
    codeFiles: trace.files,
    riskLevel: calculateRiskLevel(trace),
    recommendations: generateRecommendations(trace)
  };

  return impact;
}

function calculateRiskLevel(trace) {
  const codeRefs = trace.codeReferences.length;
  const stories = trace.stories.length;
  const inProgressStories = trace.stories.filter(s => s.status === 'in-progress').length;
  
  if (codeRefs > 20 || inProgressStories > 2) return 'high';
  if (codeRefs > 10 || stories > 3) return 'medium';
  return 'low';
}

function generateRecommendations(trace) {
  const recs = [];
  
  if (trace.codeReferences.length === 0) {
    recs.push('No code references found - requirement may not be implemented yet');
  }
  
  const blockedStories = trace.stories.filter(s => s.status === 'blocked');
  if (blockedStories.length > 0) {
    recs.push(`${blockedStories.length} blocked stories depend on this requirement`);
  }
  
  const inProgressStories = trace.stories.filter(s => s.status === 'in-progress');
  if (inProgressStories.length > 0) {
    recs.push(`${inProgressStories.length} stories in progress - changes may require rework`);
  }
  
  if (trace.decisions.length > 0) {
    recs.push(`${trace.decisions.length} architectural decisions reference this requirement - review before changing`);
  }
  
  return recs;
}

/**
 * Find all requirements that are not traced to code
 */
export async function findUntracedRequirements(projectDir) {
  const skyhookDir = findSkyhookDir(projectDir);
  if (!skyhookDir) return { error: 'No .skyhook directory found' };

  const functionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  const nonFunctionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  const allReqs = [...functionalReqs.requirements, ...nonFunctionalReqs.requirements];

  const untraced = [];
  
  for (const req of allReqs) {
    if (req.status === 'implemented' || req.status === 'in-progress' || req.status === 'confirmed') {
      const trace = await traceRequirement(projectDir, req.id);
      if (trace.codeReferences.length === 0) {
        untraced.push({
          id: req.id,
          title: req.title,
          status: req.status,
          category: req.category
        });
      }
    }
  }

  return { untraced, count: untraced.length };
}

// ==================== HELPERS ====================

function findSkyhookDir(projectDir) {
  let dir = path.resolve(projectDir);
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.skyhook'))) {
      return path.join(dir, '.skyhook');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
