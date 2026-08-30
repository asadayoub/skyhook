/**
 * Skyhook Traceability Commands - Requirement→Code traceability
 */

const fs = require('fs');
const path = require('path');
const { parseYaml } = require('./simple-yaml.js');

// ==================== TRACE COMMAND ====================

/**
 * Find all code references to a requirement ID
 * @param {string} projectDir - Project root
 * @param {string} requirementId - Requirement ID to trace
 * @returns {Object} Trace results
 */
function traceRequirement(projectDir, requirementId) {
  const results = {
    requirementId,
    requirement: null,
    stories: [],
    decisions: [],
    codeReferences: [],
    files: []
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

  // 3. Find linked decisions
  const decisions = readYaml(path.join(skyhookDir, 'decisions', 'index.yaml')) || { decisions: [] };
  if (decisions.decisions) {
    results.decisions = decisions.decisions.filter(d => 
      d.relatedRequirements?.includes(requirementId)
    );
  }

  // 4. Search codebase for @skyhook-implements annotations
  results.codeReferences = searchCodeForRequirement(projectDir, requirementId);

  // 5. Collect unique files
  results.files = [...new Set(results.codeReferences.map(r => r.file))];

  return results;
}

/**
 * Search codebase for @skyhook-implements annotations
 */
function searchCodeForRequirement(projectDir, requirementId) {
  const references = [];
  const annotationPatterns = [
    new RegExp(`@skyhook-implements\\s+${requirementId}`, 'g'),
    new RegExp(`@skyhook-implements\\s+\\[${requirementId}\\]`, 'g'),
    new RegExp(`skyhook-implements:\\s*${requirementId}`, 'g'),
    new RegExp(`implements:\\s*${requirementId}`, 'g')
  ];

  function searchDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip node_modules, .git, dist, build, .next, .skyhook
        if (entry.name === 'node_modules' || entry.name === '.git' || 
            entry.name === 'dist' || entry.name === 'build' || 
            entry.name === '.next' || entry.name === '.skyhook' ||
            entry.name === 'coverage') {
          continue;
        }

        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (isCodeFile(entry.name)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            for (const pattern of annotationPatterns) {
              const matches = content.matchAll(pattern);
              for (const match of matches) {
                // Find line number
                const beforeMatch = content.substring(0, match.index);
                const lineNumber = beforeMatch.split('\n').length;
                
                // Get context (3 lines before and after)
                const lines = content.split('\n');
                const start = Math.max(0, lineNumber - 4);
                const end = Math.min(lines.length, lineNumber + 3);
                const context = lines.slice(start, end).join('\n');
                
                references.push({
                  file: path.relative(projectDir, fullPath),
                  line: lineNumber,
                  match: match[0],
                  context: context.trim()
                });
              }
            }
          } catch (e) {
            // Ignore read errors
          }
        }
      }
    } catch (e) {
      // Ignore directory read errors
    }
  }

  searchDir(projectDir);
  return references;
}

/**
 * Check if file is a code file we should search
 */
function isCodeFile(filename) {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt', '.swift',
    '.cs', '.php', '.rb', '.vue', '.svelte',
    '.json', '.yml', '.yaml', '.toml'
  ];
  return codeExtensions.some(ext => filename.endsWith(ext));
}

/**
 * Get impact analysis for a requirement
 */
function analyzeImpact(projectDir, requirementId) {
  const trace = traceRequirement(projectDir, requirementId);
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
function findUntracedRequirements(projectDir) {
  const skyhookDir = findSkyhookDir(projectDir);
  if (!skyhookDir) return { error: 'No .skyhook directory found' };

  const functionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'functional.yaml')) || { requirements: [] };
  const nonFunctionalReqs = readYaml(path.join(skyhookDir, 'requirements', 'non-functional.yaml')) || { requirements: [] };
  const allReqs = [...functionalReqs.requirements, ...nonFunctionalReqs.requirements];

  const untraced = [];
  
  for (const req of allReqs) {
    if (req.status === 'implemented' || req.status === 'in-progress' || req.status === 'confirmed') {
      const trace = traceRequirement(projectDir, req.id);
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
  let dir = projectDir;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.skyhook'))) {
      return path.join(dir, '.skyhook');
    }
    dir = path.dirname(dir);
  }
  return null;
}

function readYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

module.exports = { 
  traceRequirement, 
  analyzeImpact, 
  findUntracedRequirements,
  searchCodeForRequirement
};
