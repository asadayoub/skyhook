/**
 * StandardsResolver - Semantic reference resolver and contextual LLM briefing compiler.
 * Resolves standard citations from Stories, Epics, Tasks, and ADRs by:
 * - Direct ID: 'STD-SEC-001'
 * - Semantic Tag: 'security/jwt', 'auth', 'keyboard'
 * - Category/Domain: 'accessibility', 'architecture'
 * Compiles ultra-concise, high-impact guardrail briefings for AI coding agents.
 */

import { StandardsRegistry } from './StandardsRegistry.js';

export class StandardsResolver {
  /**
   * Resolve a list of semantic standard references into full standard definitions
   * @param {Array<string>} references - Array of IDs or semantic tags
   * @param {string} [projectDir=process.cwd()]
   * @returns {Array<Object>} Resolved, deduplicated standards
   */
  static resolveReferences(references = [], projectDir = process.cwd()) {
    if (!Array.isArray(references) || references.length === 0) {
      return [];
    }

    const allStandards = StandardsRegistry.loadAll(projectDir);
    const matched = new Map();

    for (const rawRef of references) {
      if (!rawRef || typeof rawRef !== 'string') continue;
      const ref = rawRef.trim().toLowerCase();

      // 1. Direct ID match (case-insensitive)
      const direct = allStandards.find(s => s.id.toLowerCase() === ref);
      if (direct) {
        matched.set(direct.id, direct);
        continue;
      }

      // 2. Tag match (e.g. 'jwt' or 'security/jwt')
      const tagParts = ref.split(/[/:]/).map(p => p.trim());
      for (const std of allStandards) {
        const stdTags = (std.tags || []).map(t => t.toLowerCase());
        const stdCategory = (std.category || '').toLowerCase();
        const stdDomain = (std.domain || '').toLowerCase();

        const matchesAllParts = tagParts.every(part => 
          stdTags.includes(part) || stdCategory === part || stdDomain === part
        );

        if (matchesAllParts) {
          matched.set(std.id, std);
        }
      }
    }

    return Array.from(matched.values());
  }

  /**
   * Resolve all applicable standards for a given User Story or Task
   * @param {Object} workItem - Story or Task object
   * @param {string} [projectDir=process.cwd()]
   * @returns {Array<Object>}
   */
  static resolveForWorkItem(workItem, projectDir = process.cwd()) {
    if (!workItem) return [];

    const refs = new Set();

    // Direct standards declared on work item
    if (Array.isArray(workItem.standards)) {
      workItem.standards.forEach(s => refs.add(s));
    }

    // Infer from tags if present
    if (Array.isArray(workItem.tags)) {
      workItem.tags.forEach(t => refs.add(t));
    }

    return this.resolveReferences(Array.from(refs), projectDir);
  }

  /**
   * Compile a concise, token-efficient Agent Guardrail Briefing for LLMs
   * Injected directly into task lease responses (e.g. skyhook_get_next_task)
   * @param {Array<Object>} standards - Array of resolved standard definitions
   * @returns {Array<Object>}
   */
  static compileAgentBriefing(standards = []) {
    return standards.map(std => ({
      id: std.id,
      title: std.title,
      severity: std.severity || 'error',
      summary: std.summary || '',
      criticalRules: (std.guidelines || []).slice(0, 5),
      acceptanceCriteria: (std.acceptanceCriteria || []).slice(0, 3),
      automatedRuleIds: (std.automatedRules || []).map(r => r.ruleId)
    }));
  }

  /**
   * Resolve and compile full agent briefing for a story
   * @param {Object} story
   * @param {string} [projectDir=process.cwd()]
   * @returns {Object} { standardsCount, standardsBriefing }
   */
  static resolveBriefingForStory(story, projectDir = process.cwd()) {
    const standards = this.resolveForWorkItem(story, projectDir);
    const briefing = this.compileAgentBriefing(standards);

    return {
      standardsCount: briefing.length,
      governingStandards: briefing
    };
  }
}
