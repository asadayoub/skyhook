import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';

export class MiddlewareProvider extends Provider {
  async infer(projectDir, facts) {
    const middlewarePaths = [
      'src/middleware.ts',
      'src/middleware.js',
      'middleware.ts',
      'middleware.js',
      'src/auth.ts',
      'src/auth.js',
      'src/lib/auth.ts',
      'src/lib/auth.js'
    ];

    for (const p of middlewarePaths) {
      const fullPath = path.join(projectDir, p);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          
          // Check for NextAuth
          if (content.includes('next-auth') || content.includes('@auth/core')) {
            facts.auth = 'NextAuth.js';
            facts.confidence.auth = 0.9;
          }
          
          // Check for session handling
          if (content.includes('getServerSession') || content.includes('getSession')) {
            facts.features.push('server-session');
          }
          
          // Check for JWT
          if (content.includes('jwt') || content.includes('JWT')) {
            facts.features.push('jwt');
          }
        } catch (e) { /* ignore */ }
      }
    }
  }
}
