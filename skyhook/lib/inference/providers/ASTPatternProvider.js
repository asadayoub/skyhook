import fs from 'fs';
import path from 'path';
import { Provider } from '../Provider.js';
import { parseFile } from '../../parsers/index.js';

export class ASTPatternProvider extends Provider {
  async infer(projectDir, facts) {
    // Check if there are TS/JS files to scan
    // For now we'll do a quick scan of src/ or root for some basic patterns
    
    // As a simple example, let's scan src/index.ts or app/layout.tsx for global patterns
    const filesToScan = [
      path.join(projectDir, 'src', 'index.ts'),
      path.join(projectDir, 'src', 'index.js'),
      path.join(projectDir, 'src', 'app', 'layout.tsx'),
      path.join(projectDir, 'app', 'layout.tsx'),
      path.join(projectDir, 'pages', '_app.tsx')
    ];

    for (const file of filesToScan) {
      if (fs.existsSync(file)) {
        try {
          const symbols = await parseFile(file, projectDir);
          if (symbols && symbols.length > 0) {
            // Check for specific imports that indicate patterns
            const hasRedux = symbols.some(s => s.symbolType === 'import' && s.symbolName.includes('react-redux'));
            const hasZustand = symbols.some(s => s.symbolType === 'import' && s.symbolName.includes('zustand'));
            
            if (hasRedux && !facts.features.includes('redux')) facts.features.push('redux');
            if (hasZustand && !facts.features.includes('zustand')) facts.features.push('zustand');
          }
        } catch (e) {
          // Ignore parsing errors for now
        }
      }
    }
  }
}
