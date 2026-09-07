import fs from 'fs';
import path from 'path';
import { parseJavascript } from './javascript.js';
import { parseFallback } from './fallback.js';

const parserStatus = {
  javascript: { loaded: true, error: null },
  typescript: { loaded: true, error: null },
  python: { loaded: false, error: 'Parser not implemented yet' },
  go: { loaded: false, error: 'Parser not implemented yet' },
  rust: { loaded: false, error: 'Parser not implemented yet' }
};

export function getParserStatus() {
  return parserStatus;
}

export async function parseFile(filePath, projectDir) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    try {
      return await parseJavascript(filePath, projectDir);
    } catch (e) {
      console.error("JS PARSE ERROR:", e);
      parserStatus.javascript.loaded = false;
      parserStatus.javascript.error = e.message;
      return parseFallback(filePath, projectDir);
    }
  }
  
  // Fallback for languages without dedicated AST parsers yet
  return parseFallback(filePath, projectDir);
}
