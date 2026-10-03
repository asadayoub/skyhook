import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseYaml, stringifyYaml } from './yaml.js';

export { parseYaml, stringifyYaml };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT = path.resolve(__dirname, '..');
export const SKYHOOK_ROOT = path.resolve(__dirname, '..', '..');

let version = '2.0.0';
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
  if (!skyhookDir) return;
  const changelogPath = path.join(skyhookDir, 'changelog.md');
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]\n\n', 'utf-8');
  }
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

export const DEFAULT_IGNORE_DIRS = [
  'node_modules', '.git', '.skyhook', 'dist', 'build', '.next', 'coverage',
  '__pycache__', 'target', 'bin', 'obj',
  '.venv', 'venv', 'env', '.env', '.tox', '.nox', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  'vendor', 'Pods', '.gemini', '.cursor', '.vscode', '.idea',
  '.uv-cache', '.turbo', '.nuxt', '.svelte-kit', '.pnpm-store'
];

/**
 * Load project ignore rules from configuration files, .gitignore, and built-in defaults
 * @param {string} [projectDir=process.cwd()]
 * @param {Array|Set} [extraIgnores=[]]
 * @returns {{ ignoredDirs: Set<string>, pathPatterns: string[], shouldIgnore: (name: string, relPath?: string, isDirectory?: boolean) => boolean }}
 */
export function loadProjectIgnoreRules(projectDir = process.cwd(), extraIgnores = []) {
  const resolvedDir = path.resolve(projectDir);
  const ignoredNames = new Set(DEFAULT_IGNORE_DIRS);
  const pathPatterns = [];

  const addRule = (raw) => {
    if (!raw || typeof raw !== 'string') return;
    const clean = raw.trim().replace(/^[/\\]+|[/\\]+$/g, '');
    if (!clean || clean.startsWith('#')) return;
    if (clean.includes('/') || clean.includes('\\') || clean.includes('*')) {
      pathPatterns.push(clean.replace(/\\/g, '/'));
    } else {
      ignoredNames.add(clean);
    }
  };

  // 1. Process extraIgnores passed programmatically
  if (Array.isArray(extraIgnores)) {
    for (const item of extraIgnores) addRule(item);
  } else if (extraIgnores instanceof Set) {
    for (const item of extraIgnores) addRule(item);
  }

  // 2. Read .gitignore in project root if present
  const gitignorePath = path.join(resolvedDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      for (const line of content.split('\n')) {
        addRule(line);
      }
    } catch (_) {}
  }

  // 3. Candidate project config files (.skyhook/project.yaml, project.yaml, etc.)
  const candidateFiles = [
    path.join(resolvedDir, '.skyhook', 'project.yaml'),
    path.join(resolvedDir, 'project.yaml'),
    path.join(resolvedDir, '.skyhook', 'architecture-boundaries.yaml'),
    path.join(resolvedDir, 'architecture-boundaries.yaml'),
    path.join(resolvedDir, '.skyhook', 'drift.yaml'),
    path.join(resolvedDir, 'drift.yaml')
  ];

  for (const confFile of candidateFiles) {
    if (fs.existsSync(confFile)) {
      try {
        const raw = fs.readFileSync(confFile, 'utf-8');
        const parsed = parseYaml(raw);
        if (parsed && typeof parsed === 'object') {
          const list = parsed.ignoreDirs || parsed.ignoredDirs || parsed.ignore ||
                       parsed.drift?.ignoreDirs || parsed.drift?.ignoredDirs ||
                       parsed.boundaries?.ignoreDirs || parsed.boundaries?.ignoredDirs || [];
          if (Array.isArray(list)) {
            for (const item of list) addRule(item);
          }
        }
      } catch (_) {}
    }
  }

  return {
    ignoredDirs: ignoredNames,
    pathPatterns,
    shouldIgnore(name, relPath = '', isDirectory = true) {
      if (name && ignoredNames.has(name)) return true;
      if (relPath) {
        const normalizedRel = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const segments = normalizedRel.split('/');
        for (const seg of segments) {
          if (ignoredNames.has(seg)) return true;
        }
        for (const pattern of pathPatterns) {
          if (pattern.includes('*')) {
            const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
            if (new RegExp(regexStr).test(normalizedRel) || (name && new RegExp(regexStr).test(name))) {
              return true;
            }
          } else {
            if (normalizedRel === pattern || normalizedRel.startsWith(pattern + '/')) {
              return true;
            }
          }
        }
      }
      return false;
    }
  };
}
