/**
 * Analyzes drift between inferred project facts and declared tech stack.
 */
export class DriftAnalyzer {
  /**
   * Compares inferred facts against declared tech stack and profile.
   * @param {Object} inferredFacts The facts inferred by InferenceEngine
   * @param {Object} declaredTechStack The loaded tech-stack.yaml
   * @param {Object} profile The loaded profile (if any)
   * @returns {Object} { detected: boolean, violations: Array<{ type, message, recommendation }> }
   */
  analyze(inferredFacts, declaredTechStack = {}, profile = null) {
    const violations = [];

    // 1. Framework drift
    if (inferredFacts.framework && profile && profile.techStack?.frontend?.framework?.default) {
      const expectedFramework = profile.techStack.frontend.framework.default;
      if (inferredFacts.framework.toLowerCase() !== expectedFramework.toLowerCase()) {
        violations.push({
          type: 'FRAMEWORK_MISMATCH',
          message: `Profile expects framework '${expectedFramework}', but detected '${inferredFacts.framework}'.`,
          recommendation: `Run 'skyhook decide' to justify using ${inferredFacts.framework} or update your profile.`
        });
      }
    }

    // 2. ORM drift
    const declaredTechnologies = declaredTechStack.technologies || [];
    
    if (inferredFacts.orm) {
      const hasOrm = declaredTechnologies.some(t => t.name?.toLowerCase().includes(inferredFacts.orm.toLowerCase()));
      if (!hasOrm) {
        violations.push({
          type: 'UNAUTHORIZED_ORM',
          message: `ORM '${inferredFacts.orm}' detected in codebase but not declared in tech-stack.yaml.`,
          recommendation: `Add ${inferredFacts.orm} to tech-stack.yaml or remove it from your dependencies.`
        });
      }
    }

    // 3. Database drift
    if (inferredFacts.database) {
      const hasDb = declaredTechnologies.some(t => t.name?.toLowerCase().includes(inferredFacts.database.toLowerCase()));
      if (!hasDb) {
        violations.push({
          type: 'UNAUTHORIZED_DATABASE',
          message: `Database '${inferredFacts.database}' detected in codebase but not declared in tech-stack.yaml.`,
          recommendation: `Add ${inferredFacts.database} to tech-stack.yaml or remove it from your configuration.`
        });
      }
    }

    // 4. Styling drift
    if (inferredFacts.styling) {
      const hasStyling = declaredTechnologies.some(t => t.name?.toLowerCase().includes(inferredFacts.styling.toLowerCase()));
      if (!hasStyling) {
        violations.push({
          type: 'UNAUTHORIZED_STYLING',
          message: `Styling tool '${inferredFacts.styling}' detected but not declared in tech-stack.yaml.`,
          recommendation: `Add ${inferredFacts.styling} to tech-stack.yaml or remove it from your configuration.`
        });
      }
    }

    return {
      detected: violations.length > 0,
      violations
    };
  }
}

export function detectDrift(inferredFacts, declaredTechStack, profile) {
  const analyzer = new DriftAnalyzer();
  return analyzer.analyze(inferredFacts, declaredTechStack, profile);
}
