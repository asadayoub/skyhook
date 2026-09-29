/**
 * DriftAutoFixer - Bidirectional Architectural Auto-Remediation & 1-Click ADR Drafting
 * Provides automatic adoption of inferred technologies into tech-stack.yaml,
 * triggers automated ADR drafting for newly introduced dependencies, and
 * generates step-by-step refactoring guides for AI agents and developers.
 */

import fs from 'fs';
import path from 'path';
import { readYaml, writeYaml } from '../utils.js';
import { ADRSynthesizer } from '../adr/ADRSynthesizer.js';

export class DriftAutoFixer {
  /**
   * Adopt detected architectural technologies into tech-stack.yaml
   * @param {Object} ctx - Skyhook project context
   * @param {Array<Object|string>} itemsToAdopt - Array of items to adopt
   * @returns {Object} { success: boolean, adopted: Array<string> }
   */
  static adoptDrift(ctx, itemsToAdopt = []) {
    const skyhookDir = ctx.skyhookDir || path.join(ctx.projectDir || process.cwd(), '.skyhook');
    const techStackPath = path.join(skyhookDir, 'tech-stack.yaml');

    const techStack = (ctx.readTechStack ? ctx.readTechStack() : readYaml(techStackPath)) || {
      technologies: [],
      patterns: [],
      constraints: []
    };

    if (!Array.isArray(techStack.technologies)) {
      techStack.technologies = [];
    }

    const existingNames = new Set(
      techStack.technologies.map(t => (typeof t === 'string' ? t.toLowerCase() : (t.name || '').toLowerCase()))
    );

    const newlyAdopted = [];

    for (const item of itemsToAdopt) {
      const name = typeof item === 'string' ? item : (item.name || item.technology || item.target || '');
      const category = typeof item === 'object' && item.category ? item.category : 'technology';

      if (!name || existingNames.has(name.toLowerCase())) continue;

      const techEntry = {
        name,
        category,
        status: 'adopted',
        addedAt: new Date().toISOString()
      };

      techStack.technologies.push(techEntry);
      existingNames.add(name.toLowerCase());
      newlyAdopted.push(name);
    }

    if (newlyAdopted.length > 0) {
      if (typeof ctx.writeYaml === 'function') {
        ctx.writeYaml(techStackPath, techStack);
      } else {
        writeYaml(techStackPath, techStack);
      }
    }

    return {
      success: true,
      adoptedCount: newlyAdopted.length,
      adopted: newlyAdopted
    };
  }

  /**
   * Draft a formal ADR from a detected drift item or violation
   * @param {Object} ctx - Skyhook context
   * @param {Object} driftItem - Shift or drift item details
   * @returns {Object} Result of ADR synthesis
   */
  static draftADRFromDrift(ctx, driftItem) {
    const synthesizer = new ADRSynthesizer(ctx);

    const name = driftItem.name || driftItem.technology || driftItem.package || 'Architectural Component';
    const category = driftItem.category || (driftItem.type ? driftItem.type.toLowerCase().replace(/_/g, ' ') : 'architecture');

    const shift = {
      name,
      category,
      title: driftItem.title || `Adopt ${name} for ${category}`,
      decision: driftItem.decision || `Formally adopt ${name} into the system architecture to satisfy project requirements.`,
      context: driftItem.context || driftItem.reason || `Automated boundary analysis detected introduction of ${name} into active codebase.`,
      reason: driftItem.message || `Architecture drift analyzer detected adoption of ${name}.`
    };

    return synthesizer.draftForShift(shift);
  }

  /**
   * Generate step-by-step refactoring guides for boundary violations and circular loops
   * @param {Array<Object>} violations
   * @returns {Object} Structured guide with markdown and actionable tasks
   */
  static generateRemediationGuide(violations = []) {
    const tasks = [];
    const markdownLines = [
      '# Architectural Drift Remediation Guide',
      '',
      '> This guide outlines recommended refactoring steps to restore clean architectural boundaries.',
      ''
    ];

    for (let i = 0; i < violations.length; i++) {
      const v = violations[i];
      markdownLines.push(`### Violation ${i + 1}: ${v.type || v.ruleId || 'Architecture Breach'}`);
      markdownLines.push(`- **Location**: \`${v.file || v.from || 'unknown'}\``);
      markdownLines.push(`- **Issue**: ${v.message || v.reason || 'Boundary rule violated'}`);
      markdownLines.push('');

      if (v.type === 'LAYER_VIOLATION') {
        markdownLines.push('#### Suggested Refactoring (Layer Decoupling):');
        markdownLines.push('1. **Abstract with Interface**: Define a repository or service interface in `domain/` or `application/`.');
        markdownLines.push('2. **Implement in Infrastructure**: Move direct database/driver calls to `infrastructure/persistence/`.');
        markdownLines.push('3. **Inject Dependency**: Pass the repository into your application service rather than importing it directly into presentation.');
        markdownLines.push('');

        tasks.push({
          id: `refactor-${i + 1}`,
          title: `Decouple ${path.basename(v.file || v.from)} from ${path.basename(v.to || 'infrastructure')}`,
          type: 'layer-decoupling',
          targetFile: v.file || v.from
        });
      } else if (v.type === 'CIRCULAR_DEPENDENCY') {
        markdownLines.push('#### Suggested Refactoring (Break Dependency Loop):');
        markdownLines.push(`- **Cycle Path**: \`${(v.cycle || []).join(' ➔ ')}\``);
        markdownLines.push('1. **Extract Shared Primitives**: Move common types, constants, or utility functions into a separate shared module.');
        markdownLines.push('2. **Invert Dependency**: Use callbacks, events, or higher-order functions to prevent mutual imports.');
        markdownLines.push('');

        tasks.push({
          id: `break-cycle-${i + 1}`,
          title: `Break circular dependency cycle: ${(v.cycle || []).slice(0, 2).join(' <-> ')}`,
          type: 'cycle-break',
          cycle: v.cycle
        });
      } else if (v.ruleId === 'no-direct-env-access') {
        markdownLines.push('#### Suggested Refactoring:');
        markdownLines.push('1. Add the environment variable to your centralized `config/` module with default values.');
        markdownLines.push('2. Import the typed configuration object instead of invoking `process.env`.');
        markdownLines.push('');

        tasks.push({
          id: `env-fix-${i + 1}`,
          title: `Move process.env access in ${path.basename(v.file)} to config module`,
          type: 'config-centralization',
          targetFile: v.file
        });
      } else {
        markdownLines.push('#### Suggested Refactoring:');
        markdownLines.push(`- ${v.suggestion || 'Refactor code to conform to declared boundaries and conventions.'}`);
        markdownLines.push('');

        tasks.push({
          id: `fix-${i + 1}`,
          title: `Resolve ${v.type || v.ruleId} in ${path.basename(v.file || 'source')}`,
          type: 'general-remediation',
          targetFile: v.file
        });
      }
    }

    return {
      markdown: markdownLines.join('\n'),
      tasksCount: tasks.length,
      tasks
    };
  }
}
