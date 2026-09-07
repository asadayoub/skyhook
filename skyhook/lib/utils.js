import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYaml, stringifyYaml } from './yaml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT = path.resolve(__dirname, '..');
export const SKYHOOK_ROOT = path.resolve(__dirname, '..', '..');

let version = '1.4.1';
try {
  let pkgPath = path.join(CLI_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    pkgPath = path.join(CLI_ROOT, '..', 'package.json');
  }
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.version) version = pkg.version;
  }
} catch (e) { /* fallback to hardcoded */ }

export const SKYHOOK_VERSION = version;
export const DASHBOARD_PORT = 31415;
export const dashboardServer = `http://localhost:${DASHBOARD_PORT}`;
export let projectsCache = [];
export let projectsCacheTime = 0;

export function findSkyhookDir() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.skyhook'))) {
      return path.join(dir, '.skyhook');
    }
    dir = path.dirname(dir);
  }
  return null;
}

export function readYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

export function writeYaml(filePath, data) {
  fs.writeFileSync(filePath, stringifyYaml(data), 'utf-8');
}

export function generateULID() {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let id = '';
  for (let i = 0; i < 26; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function getTimestamp() {
  return new Date().toISOString();
}

export function appendChangelog(skyhookDir, entry) {
  const changelogPath = path.join(skyhookDir, 'changelog.md');
  let content = fs.readFileSync(changelogPath, 'utf-8');
  const lines = content.split('\n');
  const insertIdx = lines.findIndex(l => l.includes('## [Unreleased]')) + 1;
  lines.splice(insertIdx, 0, entry);
  fs.writeFileSync(changelogPath, lines.join('\n'), 'utf-8');
}

export function loadProfile(profileName) {
  const profilePath = path.join(CLI_ROOT, 'profiles', profileName + '.yaml');
  if (fs.existsSync(profilePath)) {
    return readYaml(profilePath);
  }
  return null;
}
