/**
 * HarnessUtils - Shared utility functions for agent harness injection and removal
 * 100% offline, atomic filesystem operations, safe non-destructive merging.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

export const MARKER_START = '<!-- SKYHOOK_RULES_START -->';
export const MARKER_END = '<!-- SKYHOOK_RULES_END -->';

/**
 * Resolve absolute path to skyhook-mcp executable CLI
 * @param {string} [workspaceDir]
 * @returns {string}
 */
export function resolveSkyhookMcpBin(workspaceDir = process.cwd()) {
  // Check relative to current module first
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const localCli = path.resolve(currentDir, '../../cli/skyhook-mcp.js');
  if (fs.existsSync(localCli)) {
    return localCli;
  }

  // Check workspace
  const wsCli = path.join(workspaceDir, 'skyhook/cli/skyhook-mcp.js');
  if (fs.existsSync(wsCli)) {
    return wsCli;
  }

  const wsNodeModulesCli = path.join(workspaceDir, 'node_modules/.bin/skyhook-mcp');
  if (fs.existsSync(wsNodeModulesCli)) {
    return wsNodeModulesCli;
  }

  return 'skyhook-mcp';
}

/**
 * Standard Skyhook Governance instructions for AI Agent rules files
 * @param {string} workspaceDir
 * @returns {string}
 */
export function generateGovernanceRules(workspaceDir) {
  return `${MARKER_START}
# Skyhook Project Intelligence & Governance Rules

This repository is governed by Skyhook. As an AI Agent working in this codebase, you MUST adhere to the following rules:

1. **Backlog & Task Leases**:
   - Query 'skyhook_get_next_task' or inspect 'skyhook://backlog' before starting any feature work.
   - Acquire an advisory lease for your assigned story to avoid stepping on concurrent agent tasks.
   - Transition tasks using 'skyhook_update_status' (e.g. backlog -> ready -> in-progress -> in-review -> done).

2. **Architectural Governance & Boundary Policies**:
   - Never bypass Domain-Driven Design (DDD) module boundaries or introduce circular dependencies.
   - Call 'skyhook_verify_policies' before modifying code across modules.
   - If an architectural decision is made, record it via 'skyhook_record_decision'.

3. **Traceability Annotations**:
   - Tag exported symbols (classes, functions, interfaces) with JSDoc/docstring comments linking to story or requirement IDs:
     \`@skyhook-implements REQ-XXX\` or \`@skyhook-story STORY-YYY\`
   - Verify traceability using 'skyhook_trace_requirement' or the 'skyhook trace' CLI.
${MARKER_END}`;
}

/**
 * Atomically write content to target file (writes to tmp and renames)
 * @param {string} filePath
 * @param {string} content
 */
export function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Deep merge two objects non-destructively
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
export function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Read JSON file safely, returning empty object if not found or invalid
 * @param {string} filePath
 * @returns {Object}
 */
export function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Safely merge JSON configuration into target file
 * @param {string} filePath
 * @param {Function} updaterFn - (existingJson) => updatedJson
 */
export function mergeJsonFile(filePath, updaterFn) {
  const existing = readJsonSafe(filePath);
  const updated = updaterFn(existing);
  atomicWriteFile(filePath, JSON.stringify(updated, null, 2) + '\n');
}

/**
 * Inject or replace a marked rule block in a markdown / text file
 * @param {string} filePath
 * @param {string} markerContent
 */
export function injectMarkerBlock(filePath, markerContent) {
  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf-8');
  }

  let newContent = '';
  const startIndex = existing.indexOf(MARKER_START);
  const endIndex = existing.indexOf(MARKER_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    const before = existing.slice(0, startIndex);
    const after = existing.slice(endIndex + MARKER_END.length);
    newContent = before + markerContent + after;
  } else if (existing.trim().length > 0) {
    newContent = existing.trimEnd() + '\n\n' + markerContent + '\n';
  } else {
    newContent = markerContent + '\n';
  }

  atomicWriteFile(filePath, newContent);
}

/**
 * Safely remove a marked rule block from a markdown / text file
 * If the resulting file is empty or only whitespace, optionally deletes it.
 * @param {string} filePath
 * @param {boolean} [deleteIfEmpty=true]
 * @returns {boolean} Whether file was modified
 */
export function removeMarkerBlock(filePath, deleteIfEmpty = true) {
  if (!fs.existsSync(filePath)) return false;

  const existing = fs.readFileSync(filePath, 'utf-8');
  const startIndex = existing.indexOf(MARKER_START);
  const endIndex = existing.indexOf(MARKER_END);

  if (startIndex === -1 || endIndex === -1) return false;

  const before = existing.slice(0, startIndex);
  const after = existing.slice(endIndex + MARKER_END.length);
  const remaining = (before + after).trim();

  if (!remaining && deleteIfEmpty) {
    fs.unlinkSync(filePath);
  } else {
    atomicWriteFile(filePath, remaining ? remaining + '\n' : '');
  }
  return true;
}
