#!/usr/bin/env node

/**
 * Skyhook CLI - Universal Project Intelligence for AI Agents
 * 
 * Usage:
 *   skyhook init                 # Initialize .skyhook in current project
 *   skyhook discover             # Run discovery workflow
 *   skyhook question             # Generate contextual questions
 *   skyhook plan                 # Generate/update project plan
 *   skyhook standards            # Show applicable standards
 *   skyhook decide               # Record a decision
 *   skyhook sync                 # Sync code with documentation
 *   skyhook version              # Show version info
 *   skyhook install              # Install Skyhook skill
 *   skyhook profile <name>       # Show profile details
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKYHOOK_ROOT = path.resolve(__dirname, '..');
const SKYHOOK_VERSION = '1.0.0';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(level, message) {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    debug: `${colors.gray}⋯${colors.reset}`,
  }[level] || '';
  console.log(`${prefix} ${message}`);
}

function readYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseSimpleYaml(content);
  } catch (e) {
    return null;
  }
}

function parseSimpleYaml(content) {
  const result = {};
  let currentKey = null;
  let inArray = false;
  let arrayKey = null;
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const indent = line.length - line.trimStart().length;
    
    if (trimmed.startsWith('- ')) {
      if (arrayKey) {
        if (!result[arrayKey]) result[arrayKey] = [];
        result[arrayKey].push(trimmed.slice(2).trim());
      }
      inArray = true;
    } else if (trimmed.includes(':')) {
      inArray = false;
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      currentKey = key.trim();
      arrayKey = null;
      
      if (value === '' || value === '[]') {
      } else if (value.startsWith('"') && value.endsWith('"')) {
        result[currentKey] = value.slice(1, -1);
      } else if (value === 'true') {
        result[currentKey] = true;
      } else if (value === 'false') {
        result[currentKey] = false;
      } else if (!isNaN(value) && value !== '') {
        result[currentKey] = Number(value);
      } else {
        result[currentKey] = value;
      }
    }
  }
  return result;
}

function writeYaml(filePath, data) {
  const yaml = stringifyYaml(data);
  fs.writeFileSync(filePath, yaml, 'utf-8');
}

function stringifyYaml(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      result += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object') {
          result += `${spaces}  -\n`;
          result += stringifyYaml(item, indent + 2).replace(/^/gm, '    ');
        } else {
          result += `${spaces}  - ${item}\n`;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      result += `${spaces}${key}:\n`;
      result += stringifyYaml(value, indent + 1);
    } else {
      let valStr = String(value);
      if (valStr.includes(':') || valStr.includes('#') || valStr.startsWith(' ')) {
        valStr = `"${valStr}"`;
      }
      result += `${spaces}${key}: ${valStr}\n`;
    }
  }
  return result;
}

function generateULID() {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let id = '';
  for (let i = 0; i < 26; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function getTimestamp() {
  return new Date().toISOString();
}

function findSkyhookRoot() {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.skyhook'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function ensureSkyhookDir() {
  const skyhookDir = path.join(process.cwd(), '.skyhook');
  if (!fs.existsSync(skyhookDir)) {
    fs.mkdirSync(skyhookDir, { recursive: true });
  }
  return skyhookDir;
}

function loadProfile(profileName) {
  const profilePath = path.join(SKYHOOK_ROOT, 'profiles', `${profileName}.yaml`);
  if (fs.existsSync(profilePath)) {
    return readYaml(profilePath);
  }
  return null;
}

function detectProjectType() {
  const cwd = process.cwd();
  const profiles = ['web-app', 'api-service', 'cli-tool', 'library', 'saas', 'ai-agent', 'marketing-site', 'ecommerce', 'mobile-app', 'desktop-app'];
  
  let bestMatch = { profile: 'web-app', score: 0 };
  
  for (const profileName of profiles) {
    const profile = loadProfile(profileName);
    if (!profile) continue;
    
    let score = 0;
    
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (profile.detection?.packagePatterns) {
        for (const pattern of profile.detection.packagePatterns) {
          if (Object.keys(allDeps).some(dep => dep.includes(pattern))) {
            score += 10;
          }
        }
      }
    }
    
    if (profile.detection?.filePatterns) {
      for (const pattern of profile.detection.filePatterns) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        const files = fs.readdirSync(cwd, { recursive: true });
        if (files.some(f => regex.test(f))) {
          score += 5;
        }
      }
    }
    
    if (score > bestMatch.score) {
      bestMatch = { profile: profileName, score };
    }
  }
  
  return bestMatch;
}

// ==================== COMMANDS ====================

async function cmdInit(args) {
  const skyhookDir = ensureSkyhookDir();
  const projectYamlPath = path.join(skyhookDir, 'project.yaml');
  
  if (fs.existsSync(projectYamlPath)) {
    log('warn', '.skyhook already exists. Use --force to reinitialize.');
    return;
  }
  
  log('info', 'Initializing Skyhook...');
  
  const detection = detectProjectType();
  log('info', `Detected project type: ${detection.profile} (confidence: ${detection.score})`);
  
  const profile = loadProfile(detection.profile);
  
  const projectId = generateULID();
  const projectName = path.basename(process.cwd());
  
  const projectConfig = {
    schemaVersion: "1.0.0",
    id: projectId,
    name: projectName,
    description: "",
    type: detection.profile,
    profile: detection.profile,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
    version: "0.1.0",
    repository: {
      url: "",
      branch: "main",
      provider: "none"
    },
    skyhookVersion: SKYHOOK_VERSION,
    configuration: {
      questionThreshold: "contextual",
      autoPlan: true,
      standardsLevel: "advisory",
      trackDecisions: true,
      syncOnCommit: false
    },
    metadata: {}
  };
  
  writeYaml(projectYamlPath, projectConfig);
  log('success', 'Created .skyhook/project.yaml');
  
  const dirs = ['requirements', 'decisions', 'backlog', 'ux', 'standards', 'plan', 'extensions'];
  for (const dir of dirs) {
    fs.mkdirSync(path.join(skyhookDir, dir), { recursive: true });
  }
  
  const emptyFiles = {
    'requirements/functional.yaml': { schemaVersion: "1.0.0", requirements: [] },
    'requirements/non-functional.yaml': { schemaVersion: "1.0.0", requirements: [] },
    'requirements/constraints.yaml': { schemaVersion: "1.0.0", constraints: [] },
    'decisions/index.yaml': { schemaVersion: "1.0.0", decisions: [] },
    'backlog/epics.yaml': { schemaVersion: "1.0.0", metadata: { createdAt: getTimestamp(), updatedAt: getTimestamp(), version: "0.1.0" }, epics: [], stories: [], tasks: [], prioritization: { method: "wsjf", criteria: {} } },
    'tech-stack.yaml': { schemaVersion: "1.0.0", metadata: { createdAt: getTimestamp(), updatedAt: getTimestamp(), version: "0.1.0" }, technologies: [], patterns: [], constraints: [] },
    'changelog.md': `# Changelog\n\n## [Unreleased]\n\n### Added\n- Initial Skyhook initialization\n\n---\n\n*Generated by Skyhook on ${getTimestamp()}*\n`
  };
  
  for (const [file, content] of Object.entries(emptyFiles)) {
    const filePath = path.join(skyhookDir, file);
    if (file.endsWith('.yaml')) {
      writeYaml(filePath, content);
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
  
  fs.writeFileSync(path.join(skyhookDir, 'context.md'), `# Project Context\n\n## Problem Statement\n\n\n## Solution Overview\n\n\n## Target Users\n\n\n## Value Proposition\n\n\n*Generated by Skyhook on ${getTimestamp()}*\n`, 'utf-8');
  
  fs.writeFileSync(path.join(skyhookDir, 'vision.md'), `# Product Vision\n\n## Vision Statement\n\n\n## Success Metrics (KPIs)\n\n| Metric | Target | Timeline | Measurement |\n|--------|--------|----------|-------------|\n\n## Non-Goals\n\n## Target Personas\n\n## High-Level User Journeys\n\n*Generated by Skyhook on ${getTimestamp()}*\n`, 'utf-8');
  
  fs.writeFileSync(path.join(skyhookDir, 'ux', 'styleguide.md'), `# Design System Style Guide\n\n## Metadata\n\n- **Name**: ${projectName} Design System\n- **Version**: 0.1.0\n- **Created**: ${getTimestamp()}\n- **Updated**: ${getTimestamp()}\n\n---\n\n*Generated by Skyhook on ${getTimestamp()}*\n`, 'utf-8');
  
  fs.writeFileSync(path.join(skyhookDir, '.gitignore'), `# Skyhook project state - commit everything except:\n*.tmp\n*.bak\n.DS_Store\n`, 'utf-8');
  
  log('success', 'Skyhook initialized successfully!');
  log('info', 'Next steps:');
  log('info', '  1. Edit .skyhook/context.md with your project context');
  log('info', '  2. Edit .skyhook/vision.md with your product vision');
  log('info', '  3. Run "skyhook discover" to start requirements gathering');
  log('info', '  4. Commit .skyhook/ to version control');
}

async function cmdDiscover(args) {
  const skyhookDir = findSkyhookRoot();
  if (!skyhookDir) {
    log('error', 'No Skyhook project found. Run "skyhook init" first.');
    return;
  }
  
  log('info', 'Running discovery workflow...');
  
  const project = readYaml(path.join(skyhookDir, '.skyhook', 'project.yaml'));
  const profile = loadProfile(project?.profile || 'web-app');
  
  if (!profile) {
    log('warn', 'Profile not found, using defaults');
  }
  
  log('info', `Project: ${project?.name} (${project?.type})`);
  log('info', `Profile: ${project?.profile}`);
  
  const reqFiles = [
    'requirements/functional.yaml',
    'requirements/non-functional.yaml',
    'requirements/constraints.yaml',
  ];
  
  for (const file of reqFiles) {
    const data = readYaml(path.join(skyhookDir, '.skyhook', file));
    const count = data?.requirements?.length || data?.constraints?.length || 0;
    log('info', `  ${file}: ${count} items`);
  }
  
  if (profile?.questions?.requirements) {
    log('info', '\nContextual questions for requirements phase:');
    for (const q of profile.questions.requirements) {
      const priorityColor = { critical: colors.red, high: colors.yellow, medium: colors.blue, low: colors.gray }[q.priority] || colors.reset;
      console.log(`  ${priorityColor}[${q.priority.toUpperCase()}]${colors.reset} ${q.question}`);
      if (q.default) console.log(`    ${colors.gray}Default: ${q.default}${colors.reset}`);
      if (q.options) console.log(`    ${colors.gray}Options: ${q.options.join(', ')}${colors.reset}`);
    }
  }
  
  log('success', 'Discovery complete. Answer questions to populate requirements.');
}

async function cmdQuestion(args) {
  const skyhookDir = findSkyhookRoot();
  if (!skyhookDir) {
    log('error', 'No Skyhook project found. Run "skyhook init" first.');
    return;
  }
  
  const project = readYaml(path.join(skyhookDir, '.skyhook', 'project.yaml'));
  const profile = loadProfile(project?.profile || 'web-app');
  
  const category = args.category || 'requirements';
  const questions = profile?.questions?.[category] || [];
  
  if (questions.length === 0) {
    log('info', `No questions for category: ${category}`);
    return;
  }
  
  log('info', `Questions for ${category} phase:`);
  for (const q of questions) {
    const priorityColor = { critical: colors.red, high: colors.yellow, medium: colors.blue, low: colors.gray }[q.priority] || colors.reset;
    console.log(`\n${colors.bold}${q.id}${colors.reset} ${priorityColor}[${q.priority}]${colors.reset}`);
    console.log(`  Q: ${q.question}`);
    console.log(`  Context: ${q.context}`);
    if (q.default) console.log(`  Default: ${colors.gray}${q.default}${colors.reset}`);
    if (q.options) console.log(`  Options: ${q.options.join(' | ')}`);
    if (q.tags) console.log(`  Tags: ${q.tags.join(', ')}`);
  }
}

async function cmdPlan(args) {
  const skyhookDir = findSkyhookRoot();
  if (!skyhookDir) {
    log('error', 'No Skyhook project found. Run "skyhook init" first.');
    return;
  }
  
  log('info', 'Generating project plan...');
  
  const project = readYaml(path.join(skyhookDir, '.skyhook', 'project.yaml'));
  const context = fs.readFileSync(path.join(skyhookDir, '.skyhook', 'context.md'), 'utf-8');
  const vision = fs.readFileSync(path.join(skyhookDir, '.skyhook', 'vision.md'), 'utf-8');
  const functionalReqs = readYaml(path.join(skyhookDir, '.skyhook', 'requirements', 'functional.yaml'));
  const nonFunctionalReqs = readYaml(path.join(skyhookDir, '.skyhook', 'requirements', 'non-functional.yaml'));
  const constraints = readYaml(path.join(skyhookDir, '.skyhook', 'requirements', 'constraints.yaml'));
  const decisions = readYaml(path.join(skyhookDir, '.skyhook', 'decisions', 'index.yaml'));
  const techStack = readYaml(path.join(skyhookDir, '.skyhook', 'tech-stack.yaml'));
  const backlog = readYaml(path.join(skyhookDir, '.skyhook', 'backlog', 'epics.yaml'));
  
  const planPath = path.join(skyhookDir, '.skyhook', 'plan', 'PROJECT_PLAN.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  
  const plan = `# Project Plan: ${project?.name || 'Untitled'}

**Generated**: ${getTimestamp()}
**Skyhook Version**: ${SKYHOOK_VERSION}
**Project Type**: ${project?.type || 'unknown'}

---

## 1. Project Overview

${context.split('## Problem Statement')[1]?.split('## Solution Overview')[0]?.trim() || 'See context.md'}

## 2. Vision & Goals

${vision.split('## Vision Statement')[1]?.split('## Success Metrics')[0]?.trim() || 'See vision.md'}

## 3. Requirements Summary

### Functional Requirements (${functionalReqs?.requirements?.length || 0})
${functionalReqs?.requirements?.map(r => `- **${r.title}** (${r.priority}): ${r.description}`).join('\n') || 'None defined'}

### Non-Functional Requirements (${nonFunctionalReqs?.requirements?.length || 0})
${nonFunctionalReqs?.requirements?.map(r => `- **${r.title}** (${r.priority}): ${r.metric} ${r.target}`).join('\n') || 'None defined'}

### Constraints (${constraints?.constraints?.length || 0})
${constraints?.constraints?.map(c => `- **${c.title}**: ${c.constraint}`).join('\n') || 'None defined'}

## 4. Technical Architecture

### Technology Stack
${techStack?.technologies?.map(t => `- **${t.category}**: ${t.name} ${t.version} - ${t.rationale}`).join('\n') || 'Not defined'}

### Architectural Decisions (${decisions?.decisions?.length || 0})
${decisions?.decisions?.map(d => `- **${d.title}** (${d.status}): ${d.decision}`).join('\n') || 'None recorded'}

## 5. Backlog

### Epics (${backlog?.epics?.length || 0})
${backlog?.epics?.map(e => `- **${e.name}**: ${e.goal}`).join('\n') || 'None defined'}

### Stories (${backlog?.stories?.length || 0})
${backlog?.stories?.map(s => `- **${s.title}** (${s.priority}pts): ${s.userStory}`).join('\n') || 'None defined'}

## 6. UX & Design

See \`.skyhook/ux/styleguide.md\` for design system.

## 7. Standards

- Software: \`.skyhook/standards/software.md\`
- Security: \`.skyhook/standards/security.md\`
- Testing: \`.skyhook/standards/testing.md\`
- Architecture: \`.skyhook/standards/architecture.md\`
- Accessibility: \`.skyhook/standards/accessibility.md\`

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

## 9. Timeline & Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Project Init | ${project?.createdAt?.split('T')[0] || 'Today'} | ✓ Done |
| Requirements Baselined | | ⬜ Pending |
| Tech Stack Finalized | | ⬜ Pending |
| Scaffold Complete | | ⬜ Pending |
| MVP Release | | ⬜ Pending |

---

*Generated by Skyhook on ${getTimestamp()}*
`;
  
  fs.writeFileSync(planPath, plan, 'utf-8');
  log('success', `Project plan generated at ${planPath}`);
}

async function cmdStandards(args) {
  const skyhookDir = findSkyhookRoot();
  const project = skyhookDir ? readYaml(path.join(skyhookDir, '.skyhook', 'project.yaml')) : null;
  const profile = project ? loadProfile(project.profile || 'web-app') : null;
  
  log('info', 'Applicable Standards:');
  console.log();
  
  const standards = [
    { name: 'Software', file: 'software.md', desc: 'Code quality, architecture, TypeScript patterns' },
    { name: 'UX/UI', file: 'ux.md', desc: 'Design tokens, components, responsive patterns' },
    { name: 'Accessibility', file: 'accessibility.md', desc: 'WCAG 2.1 AA compliance requirements' },
    { name: 'Architecture', file: 'architecture.md', desc: 'System architecture, DDD, API design' },
    { name: 'Security', file: 'security.md', desc: 'OWASP Top 10, cryptography, secure defaults' },
    { name: 'Testing', file: 'testing.md', desc: 'Test pyramid, patterns, coverage targets' },
  ];
  
  for (const std of standards) {
    const projectStdPath = skyhookDir ? path.join(skyhookDir, '.skyhook', 'standards', std.file) : null;
    const globalStdPath = path.join(SKYHOOK_ROOT, 'standards', std.file);
    const hasProjectOverride = projectStdPath && fs.existsSync(projectStdPath);
    const hasGlobal = fs.existsSync(globalStdPath);
    
    const status = hasProjectOverride ? `${colors.green}✓ Project override${colors.reset}` 
      : hasGlobal ? `${colors.blue}● Built-in default${colors.reset}` 
      : `${colors.gray}○ Not available${colors.reset}`;
    
    console.log(`  ${colors.bold}${std.name}${colors.reset} ${status}`);
    console.log(`    ${colors.gray}${std.desc}${colors.reset}`);
  }
  
  if (profile?.standards) {
    console.log();
    log('info', 'Profile emphasis:');
    for (const [std, level] of Object.entries(profile.standards)) {
      console.log(`  ${std}: ${level}`);
    }
  }
}

async function cmdDecide(args) {
  const skyhookDir = findSkyhookRoot();
  if (!skyhookDir) {
    log('error', 'No Skyhook project found. Run "skyhook init" first.');
    return;
  }
  
  const title = args.title || args._?.[0];
  if (!title) {
    log('error', 'Decision title required: skyhook decide "Use PostgreSQL for primary database"');
    return;
  }
  
  const decisionsPath = path.join(skyhookDir, '.skyhook', 'decisions');
  fs.mkdirSync(decisionsPath, { recursive: true });
  
  const decisionId = generateULID();
  const decisionFile = path.join(decisionsPath, `${decisionId}.md`);
  
  const decision = `# Decision: ${title}

**ID**: ${decisionId}
**Status**: proposed
**Date**: ${getTimestamp()}

## Context

<!-- Describe the situation and forces at play -->

## Decision

<!-- State the decision clearly -->

## Consequences

### Positive
- 

### Negative
- 

### Neutral
- 

## Alternatives Considered

| Alternative | Pros | Cons |
|-------------|------|------|
|  |  |  |

## Related Requirements

<!-- Link to requirement IDs -->

---

*Created by Skyhook on ${getTimestamp()}*
`;
  
  fs.writeFileSync(decisionFile, decision, 'utf-8');
  
  const indexPath = path.join(decisionsPath, 'index.yaml');
  const index = readYaml(indexPath) || { schemaVersion: "1.0.0", decisions: [] };
  
  index.decisions.push({
    id: decisionId,
    title,
    status: "proposed",
    category: "architecture",
    createdAt: getTimestamp(),
  });
  
  writeYaml(indexPath, index);
  
  log('success', `Decision recorded: ${decisionFile}`);
  log('info', 'Edit the file to complete the ADR, then update status to "accepted"');
}

async function cmdSync(args) {
  const skyhookDir = findSkyhookRoot();
  if (!skyhookDir) {
    log('error', 'No Skyhook project found. Run "skyhook init" first.');
    return;
  }
  
  log('info', 'Syncing code with documentation...');
  
  const checks = [
    'Requirements vs implemented features',
    'Decisions vs actual architecture',
    'Tech stack vs package.json/imports',
    'UX specs vs component implementations',
    'Standards compliance (lint, test, types)',
  ];
  
  for (const check of checks) {
    console.log(`  ${colors.gray}⋯${colors.reset} ${check}`);
  }
  
  log('success', 'Sync check complete (placeholder - implement drift detection)');
}

async function cmdVersion(args) {
  console.log(`Skyhook CLI v${SKYHOOK_VERSION}`);
  console.log(`Skill root: ${SKYHOOK_ROOT}`);
  
  const skyhookDir = findSkyhookRoot();
  if (skyhookDir) {
    const project = readYaml(path.join(skyhookDir, '.skyhook', 'project.yaml'));
    console.log(`Project: ${project?.name} (${project?.type})`);
    console.log(`Project Skyhook version: ${project?.skyhookVersion}`);
  }
}

async function cmdInstall(args) {
  const global = args.global || args.g;
  const targetDir = global 
    ? path.join(process.env.HOME, '.skyhook', 'skill')
    : path.join(process.cwd(), '.skyhook', 'skill');
  
  if (fs.existsSync(targetDir) && !args.force) {
    log('warn', `Skyhook already installed at ${targetDir}. Use --force to overwrite.`);
    return;
  }
  
  log('info', `Installing Skyhook skill to ${targetDir}...`);
  
  function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  
  copyRecursive(SKYHOOK_ROOT, targetDir);
  
  log('success', `Skyhook skill installed to ${targetDir}`);
  log('info', 'Add to your agent configuration:');
  if (global) {
    log('info', '  Codex: Add to ~/.codex/instructions.md or use skill system');
    log('info', '  Claude Code: Reference in CLAUDE.md');
    log('info', '  Gemini CLI: Load via @skyhook reference');
  } else {
    log('info', '  Project-local: Agent will auto-detect .skyhook/skill/');
  }
}

async function cmdProfile(args) {
  const profileName = args.profile || args._?.[0];
  if (!profileName) {
    log('error', 'Profile name required: skyhook profile web-app');
    return;
  }
  
  const profile = loadProfile(profileName);
  if (!profile) {
    log('error', `Profile not found: ${profileName}`);
    log('info', 'Available profiles: web-app, api-service, cli-tool, library, saas, ai-agent, marketing-site, ecommerce, mobile-app, desktop-app');
    return;
  }
  
  console.log(`${colors.bold}${profile.name}${colors.reset} (${profile.id})`);
  console.log(`${profile.description}`);
  console.log();
  console.log(`${colors.bold}Tech Stack Defaults:${colors.reset}`);
  for (const [category, config] of Object.entries(profile.techStack || {})) {
    if (typeof config === 'object' && config.default) {
      console.log(`  ${category}: ${config.default}`);
    }
  }
  console.log();
  console.log(`${colors.bold}Key Questions:${colors.reset}`);
  for (const [phase, questions] of Object.entries(profile.questions || {})) {
    console.log(`  ${phase}: ${questions.length} questions`);
  }
}

async function cmdHelp(args) {
  console.log(`
${colors.bold}Skyhook CLI${colors.reset} - Universal Project Intelligence for AI Agents

${colors.bold}USAGE${colors.reset}
  skyhook <command> [options]

${colors.bold}COMMANDS${colors.reset}
  ${colors.cyan}init${colors.reset}              Initialize .skyhook in current project
  ${colors.cyan}discover${colors.reset}          Run discovery workflow
  ${colors.cyan}question${colors.reset} [category]  Generate contextual questions
  ${colors.cyan}plan${colors.reset}              Generate/update PROJECT_PLAN.md
  ${colors.cyan}standards${colors.reset}         Show applicable standards
  ${colors.cyan}decide${colors.reset} <title>    Record an architectural decision
  ${colors.cyan}sync${colors.reset}              Sync code with documentation
  ${colors.cyan}version${colors.reset}           Show version info
  ${colors.cyan}install${colors.reset} [--global] Install Skyhook skill
  ${colors.cyan}profile${colors.reset} <name>    Show profile details
  ${colors.cyan}help${colors.reset}              Show this help

${colors.bold}OPTIONS${colors.reset}
  --global, -g     Install globally (for install command)
  --force, -f      Force overwrite (for init/install)
  --category, -c   Question category (for question command)

${colors.bold}EXAMPLES${colors.reset}
  skyhook init
  skyhook discover
  skyhook question requirements
  skyhook plan
  skyhook decide "Use PostgreSQL with Prisma"
  skyhook install --global
  skyhook profile web-app

${colors.bold}PROJECT STRUCTURE${colors.reset}
  .skyhook/
  ├── project.yaml           # Project metadata
  ├── context.md             # Project context & background
  ├── vision.md              # Product vision & goals
  ├── requirements/          # Structured requirements
  │   ├── functional.yaml
  │   ├── non-functional.yaml
  │   └── constraints.yaml
  ├── decisions/             # Architectural decisions (ADRs)
  │   ├── index.yaml
  │   └── *.md
  ├── backlog/               # Prioritized work items
  ├── tech-stack.yaml        # Technology choices
  ├── ux/                    # Design system
  ├── standards/             # Project-specific overrides
  ├── plan/                  # Generated project plans
  └── changelog.md           # History of changes

${colors.bold}MORE INFO${colors.reset}
  Documentation: https://github.com/skyhook/skyhook
  Issues: https://github.com/skyhook/skyhook/issues
`);
}

// ==================== MAIN ====================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const parsedArgs = { _: [] };
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        parsedArgs[key] = nextArg;
        i++;
      } else {
        parsedArgs[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      parsedArgs[key] = true;
    } else {
      parsedArgs._.push(arg);
    }
  }
  
  const commands = {
    init: cmdInit,
    discover: cmdDiscover,
    question: cmdQuestion,
    plan: cmdPlan,
    standards: cmdStandards,
    decide: cmdDecide,
    sync: cmdSync,
    version: cmdVersion,
    install: cmdInstall,
    profile: cmdProfile,
    help: cmdHelp,
  };
  
  const handler = commands[command];
  if (!handler) {
    log('error', `Unknown command: ${command}`);
    await cmdHelp({});
    process.exit(1);
  }
  
  try {
    await handler(parsedArgs);
  } catch (error) {
    log('error', error.message);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  }
}

main();
