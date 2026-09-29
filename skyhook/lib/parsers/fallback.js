/**
 * Backwards compatibility wrapper for parseFallback
 */

import { RegexFallbackParser } from './RegexFallbackParser.js';

const defaultInstance = new RegexFallbackParser();

export async function parseFallback(fullPath, projectDir) {
  return await defaultInstance.parse(fullPath, projectDir);
}
