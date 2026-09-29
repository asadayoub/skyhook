/**
 * Backwards compatibility wrapper for parseJavascript
 */

import { JavaScriptParser } from './JavaScriptParser.js';

const defaultInstance = new JavaScriptParser();

export async function parseJavascript(fullPath, projectDir) {
  return await defaultInstance.parse(fullPath, projectDir);
}
