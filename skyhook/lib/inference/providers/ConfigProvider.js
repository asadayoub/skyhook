import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class ConfigProvider extends Provider {
  async infer(projectDir, facts) {
    const configs = [
      { file: 'tsconfig.json', fact: 'typescript', confidence: 0.9 },
      { file: 'tailwind.config.ts', fact: 'tailwind', confidence: 0.9 },
      { file: 'tailwind.config.js', fact: 'tailwind', confidence: 0.9 },
      { file: 'vite.config.ts', fact: 'vite', confidence: 0.9 },
      { file: 'next.config.js', fact: 'next', confidence: 0.9 },
      { file: 'next.config.ts', fact: 'next', confidence: 0.9 },
      { file: 'remix.config.js', fact: 'remix', confidence: 0.9 },
      { file: 'astro.config.mjs', fact: 'astro', confidence: 0.9 }
    ];

    for (const { file, fact, confidence } of configs) {
      if (fs.existsSync(path.join(projectDir, file))) {
        if (fact === 'tailwind') { facts.styling = 'Tailwind CSS'; facts.confidence.styling = confidence; }
        else if (fact === 'vite') { facts.buildTool = 'Vite'; facts.confidence.buildTool = confidence; }
        else if (fact === 'next') { facts.framework = 'Next.js'; facts.confidence.framework = confidence; }
        else if (fact === 'remix') { facts.framework = 'Remix'; facts.confidence.framework = confidence; }
        else if (fact === 'astro') { facts.framework = 'Astro'; facts.confidence.framework = confidence; }
      }
    }

    // Monorepo checks
    const monorepoIndicators = [
      'pnpm-workspace.yaml',
      'turbo.json',
      'nx.json',
      'lerna.json',
      'rush.json'
    ];

    for (const indicator of monorepoIndicators) {
      if (fs.existsSync(path.join(projectDir, indicator))) {
        facts.monorepo = true;
        facts.confidence.monorepo = 0.95;
        break;
      }
    }
  }
}
