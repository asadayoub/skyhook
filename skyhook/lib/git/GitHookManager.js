/**
 * Git Hook Manager
 * Installs, checks, and uninstalls automated pre-commit policy enforcement hooks.
 */

import fs from 'fs';
import path from 'path';

export const HOOK_MARKER = '# Skyhook Pre-Commit Architecture Guard';

export const HOOK_SCRIPT_BODY = `
${HOOK_MARKER}
if command -v skyhook >/dev/null 2>&1; then
  skyhook adr verify
elif [ -f "./node_modules/.bin/skyhook" ]; then
  ./node_modules/.bin/skyhook adr verify
fi
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Commit rejected: Codebase violates accepted Architectural Decision Records (ADRs)."
  echo "👉 Run 'skyhook adr verify' to see details, or commit with '--no-verify' to bypass."
  echo ""
  exit 1
fi
`;

export class GitHookManager {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.gitDir = path.join(projectDir, '.git');
    this.hooksDir = path.join(this.gitDir, 'hooks');
    this.preCommitPath = path.join(this.hooksDir, 'pre-commit');
  }

  isGitRepo() {
    return fs.existsSync(this.gitDir);
  }

  getStatus() {
    if (!this.isGitRepo()) {
      return { isGitRepo: false, hookInstalled: false };
    }
    if (!fs.existsSync(this.preCommitPath)) {
      return { isGitRepo: true, hookInstalled: false };
    }
    const content = fs.readFileSync(this.preCommitPath, 'utf-8');
    return {
      isGitRepo: true,
      hookInstalled: content.includes(HOOK_MARKER),
      hookPath: this.preCommitPath
    };
  }

  install() {
    if (!this.isGitRepo()) {
      return { error: 'Not a git repository (missing .git directory)' };
    }

    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    let content = '';
    if (fs.existsSync(this.preCommitPath)) {
      content = fs.readFileSync(this.preCommitPath, 'utf-8');
      if (content.includes(HOOK_MARKER)) {
        return {
          success: true,
          message: 'Skyhook pre-commit hook is already installed.',
          hookPath: this.preCommitPath
        };
      }
      content += '\n' + HOOK_SCRIPT_BODY;
    } else {
      content = '#!/usr/bin/env sh\n' + HOOK_SCRIPT_BODY;
    }

    fs.writeFileSync(this.preCommitPath, content.trim() + '\n', 'utf-8');

    // Make executable
    try {
      fs.chmodSync(this.preCommitPath, 0o755);
    } catch {
      // Best-effort on platforms that support chmod
    }

    return {
      success: true,
      message: 'Git pre-commit hook installed successfully.',
      hookPath: this.preCommitPath
    };
  }

  uninstall() {
    if (!this.isGitRepo() || !fs.existsSync(this.preCommitPath)) {
      return { success: true, message: 'No pre-commit hook found.' };
    }

    let content = fs.readFileSync(this.preCommitPath, 'utf-8');
    if (!content.includes(HOOK_MARKER)) {
      return { success: true, message: 'Skyhook hook was not installed in pre-commit.' };
    }

    // Remove the Skyhook block
    const lines = content.split('\n');
    const filtered = [];
    let skipping = false;

    for (const line of lines) {
      if (line.includes(HOOK_MARKER)) {
        skipping = true;
        continue;
      }
      if (skipping && line.includes('exit 1')) {
        skipping = false;
        continue;
      }
      if (!skipping) {
        filtered.push(line);
      }
    }

    const remaining = filtered.join('\n').trim();

    if (!remaining || remaining === '#!/usr/bin/env sh') {
      fs.unlinkSync(this.preCommitPath);
    } else {
      fs.writeFileSync(this.preCommitPath, remaining + '\n', 'utf-8');
    }

    return {
      success: true,
      message: 'Skyhook pre-commit hook uninstalled successfully.'
    };
  }
}
