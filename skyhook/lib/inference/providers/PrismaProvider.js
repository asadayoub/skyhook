import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class PrismaProvider extends Provider {
  async infer(projectDir, facts) {
    const prismaPaths = [
      path.join(projectDir, 'prisma', 'schema.prisma'),
      path.join(projectDir, 'schema.prisma')
    ];

    for (const p of prismaPaths) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf-8');
          facts.orm = 'Prisma';
          facts.confidence.orm = 0.95;

          // Extract provider
          const providerMatch = content.match(/provider\s*=\s*["']?(\w+)["']?/);
          if (providerMatch) {
            const provider = providerMatch[1].toLowerCase();
            if (provider.includes('postgres') || provider.includes('pg')) facts.database = 'PostgreSQL';
            else if (provider.includes('mysql')) facts.database = 'MySQL';
            else if (provider.includes('sqlite')) facts.database = 'SQLite';
            else if (provider.includes('mongo')) facts.database = 'MongoDB';
            else if (provider.includes('sqlserver')) facts.database = 'SQL Server';
            facts.confidence.database = 0.95;
          }

          // Extract models for features
          const models = content.match(/model\s+(\w+)\s*{/g);
          if (models) {
            const modelNames = models.map(m => m.replace(/model\s+(\w+)\s*{/, '$1'));
            facts.features.push(...modelNames.map(m => `model:${m.toLowerCase()}`));
          }
        } catch (e) { /* ignore */ }
        break;
      }
    }
  }
}
