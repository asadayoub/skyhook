import fs from 'fs';
import path from 'path';

export function parseFallback(fullPath, projectDir) {
  const content = fs.readFileSync(fullPath, 'utf-8');
  const symbols = [];
  
  const annotationPatterns = [
    /(@skyhook-implements|implements:)\s+([A-Z0-9-]+)/gi
  ];
  
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of annotationPatterns) {
      pattern.lastIndex = 0; // reset regex
      const match = pattern.exec(line);
      if (match) {
        const reqId = match[2];
        const lineNumber = i + 1;
        
        // Find nearest "name-like" thing below the comment
        let symbolName = 'UnknownSymbol';
        let symbolType = 'unknown';
        
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.match(/\bclass\s+([A-Za-z0-9_]+)/)) {
            symbolName = nextLine.match(/\bclass\s+([A-Za-z0-9_]+)/)[1];
            symbolType = 'class';
            break;
          } else if (nextLine.match(/\bdef\s+([A-Za-z0-9_]+)/)) {
            symbolName = nextLine.match(/\bdef\s+([A-Za-z0-9_]+)/)[1];
            symbolType = 'function';
            break;
          } else if (nextLine.match(/\bfunc\s+([A-Za-z0-9_]+)/)) {
            symbolName = nextLine.match(/\bfunc\s+([A-Za-z0-9_]+)/)[1];
            symbolType = 'function';
            break;
          } else if (nextLine.match(/\bfunction\s+([A-Za-z0-9_]+)/)) {
            symbolName = nextLine.match(/\bfunction\s+([A-Za-z0-9_]+)/)[1];
            symbolType = 'function';
            break;
          }
        }
        
        const start = Math.max(0, lineNumber - 2);
        const end = Math.min(lines.length, lineNumber + 3);
        const context = lines.slice(start, end).join('\n');
        
        symbols.push({
          file: path.relative(projectDir, fullPath),
          symbolName,
          symbolType,
          line: lineNumber,
          endLine: lineNumber,
          context: context.trim(),
          traced: true,
          requirementId: reqId
        });
      }
    }
  }
  
  return symbols;
}
