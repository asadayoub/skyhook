import { PackageJsonProvider } from './providers/PackageJsonProvider.js';
import { PrismaProvider } from './providers/PrismaProvider.js';
import { ConfigProvider } from './providers/ConfigProvider.js';
import { DeploymentProvider } from './providers/DeploymentProvider.js';
import { MiddlewareProvider } from './providers/MiddlewareProvider.js';
import { ASTPatternProvider } from './providers/ASTPatternProvider.js';

export class InferenceEngine {
  constructor() {
    this.providers = [
      new PackageJsonProvider(),
      new PrismaProvider(),
      new ConfigProvider(),
      new DeploymentProvider(),
      new MiddlewareProvider(),
      new ASTPatternProvider()
    ];
  }

  async analyze(projectDir) {
    const facts = {
      language: null,
      framework: null,
      buildTool: null,
      styling: null,
      database: null,
      orm: null,
      auth: null,
      apiStyle: null,
      deployment: null,
      testing: null,
      ci: null,
      packageManager: null,
      monorepo: false,
      features: [],
      confidence: {}
    };

    for (const provider of this.providers) {
      try {
        await provider.infer(projectDir, facts);
      } catch (err) {
        // Ignore provider failures
      }
    }

    this.calculateConfidence(facts);
    return facts;
  }

  calculateConfidence(facts) {
    // Normalize confidence to 0-1
    for (const key of Object.keys(facts.confidence)) {
      const val = facts.confidence[key];
      if (typeof val === 'number') {
        facts.confidence[key] = Math.min(1, Math.max(0, val));
      }
    }
  }
}

// Export a convenience function for backward compatibility and easy usage
export async function inferFromRepo(projectDir) {
  const engine = new InferenceEngine();
  return await engine.analyze(projectDir);
}
