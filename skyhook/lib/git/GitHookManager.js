/**
 * Git Hook Manager
 * Installs, checks, and uninstalls automated Git lifecycle and policy enforcement hooks.
 */

import fs from 'fs';
import path from 'path';

export const PRE_COMMIT_MARKER = '# Skyhook Pre-Commit Architecture Guard';
export const HOOK_MARKER = PRE_COMMIT_MARKER; // backward compatibility
export const POST_CHECKOUT_MARKER = '# Skyhook Post-Checkout Lifecycle Guard';
export const POST_COMMIT_MARKER = '# Skyhook Post-Commit Lifecycle Guard';

export const HOOK_SCRIPT_BODY = `
${HOOK_MARKER}
if command -v skyhook >/dev/null 2>&1; then
  skyhook adr verify && skyhook drift --ci-check
elif [ -f "./node_modules/.bin/skyhook" ]; then
  ./node_modules/.bin/skyhook adr verify && ./node_modules/.bin/skyhook drift --ci-check
fi
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Commit rejected: Codebase violates architectural boundaries or accepted ADRs."
  echo "👉 Run 'skyhook drift --boundaries' or 'skyhook adr verify' to see details, or commit with '--no-verify' to bypass."
  echo ""
  exit 1
fi
`;

export const POST_CHECKOUT_SCRIPT_BODY = `
${POST_CHECKOUT_MARKER}
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if command -v skyhook >/dev/null 2>&1; then
  skyhook sync --branch "$BRANCH" --quiet
elif [ -f "./node_modules/.bin/skyhook" ]; then
  ./node_modules/.bin/skyhook sync --branch "$BRANCH" --quiet
fi
`;

export const POST_COMMIT_SCRIPT_BODY = `
${POST_COMMIT_MARKER}
LAST_MSG=$(git log -1 --pretty=%B 2>/dev/null)
COMMIT_HASH=$(git log -1 --pretty=%H 2>/dev/null)
if command -v skyhook >/dev/null 2>&1; then
  skyhook sync --commit-message "$LAST_MSG" --commit-hash "$COMMIT_HASH" --quiet
elif [ -f "./node_modules/.bin/skyhook" ]; then
  ./node_modules/.bin/skyhook sync --commit-message "$LAST_MSG" --commit-hash "$COMMIT_HASH" --quiet
fi
`;

export class GitHookManager {
  constructor(projectDir = process.cwd()) {
    this.projectDir = projectDir;
    this.gitDir = path.join(projectDir, '.git');
    this.hooksDir = path.join(this.gitDir, 'hooks');
    this.preCommitPath = path.join(this.hooksDir, 'pre-commit');
    this.postCheckoutPath = path.join(this.hooksDir, 'post-checkout');
    this.postCommitPath = path.join(this.hooksDir, 'post-commit');
    this.gitattributesPath = path.join(projectDir, '.gitattributes');
    this.gitConfigPath = path.join(this.gitDir, 'config');
  }

  isGitRepo() {
    return fs.existsSync(this.gitDir);
  }

  _isHookInstalled(filePath, marker) {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes(marker);
  }

  getStatus() {
    if (!this.isGitRepo()) {
      return {
        isGitRepo: false,
        hookInstalled: false,
        mergeDriverInstalled: false,
        hooks: { preCommit: false, postCheckout: false, postCommit: false }
      };
    }

    const preCommit = this._isHookInstalled(this.preCommitPath, PRE_COMMIT_MARKER);
    const postCheckout = this._isHookInstalled(this.postCheckoutPath, POST_CHECKOUT_MARKER);
    const postCommit = this._isHookInstalled(this.postCommitPath, POST_COMMIT_MARKER);
    const mergeDriver = fs.existsSync(this.gitattributesPath) &&
      fs.readFileSync(this.gitattributesPath, 'utf-8').includes('merge=skyhook');

    return {
      isGitRepo: true,
      hookInstalled: preCommit && postCheckout && postCommit,
      mergeDriverInstalled: mergeDriver,
      hooks: {
        preCommit,
        postCheckout,
        postCommit
      },
      hookPath: this.preCommitPath
    };
  }

  _installHook(filePath, marker, scriptBody) {
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(marker)) {
        return { installed: true, alreadyInstalled: true };
      }
      content += '\n' + scriptBody;
    } else {
      content = '#!/usr/bin/env sh\n' + scriptBody;
    }

    fs.writeFileSync(filePath, content.trim() + '\n', 'utf-8');

    try {
      fs.chmodSync(filePath, 0o755);
    } catch {
      // Best-effort on platforms that support chmod
    }

    return { installed: true, alreadyInstalled: false };
  }

  _installMergeDriver() {
    const attrLine = '.skyhook/backlog/epics.yaml merge=skyhook';
    let attrContent = '';
    if (fs.existsSync(this.gitattributesPath)) {
      attrContent = fs.readFileSync(this.gitattributesPath, 'utf-8');
      if (!attrContent.includes(attrLine)) {
        attrContent = attrContent.trim() + '\n' + attrLine + '\n';
        fs.writeFileSync(this.gitattributesPath, attrContent, 'utf-8');
      }
    } else {
      fs.writeFileSync(this.gitattributesPath, attrLine + '\n', 'utf-8');
    }

    if (fs.existsSync(this.gitConfigPath)) {
      let configContent = fs.readFileSync(this.gitConfigPath, 'utf-8');
      if (!configContent.includes('[merge "skyhook"]')) {
        const driverSection = `\n[merge "skyhook"]\n\tname = Skyhook Backlog Merge Driver\n\tdriver = node skyhook/cli/skyhook-merge-driver.js %O %A %B\n`;
        configContent += driverSection;
        fs.writeFileSync(this.gitConfigPath, configContent, 'utf-8');
      }
    }
  }

  _uninstallMergeDriver() {
    const attrLine = '.skyhook/backlog/epics.yaml merge=skyhook';
    if (fs.existsSync(this.gitattributesPath)) {
      const content = fs.readFileSync(this.gitattributesPath, 'utf-8');
      if (content.includes(attrLine)) {
        const remaining = content
          .split('\n')
          .filter(l => !l.includes(attrLine))
          .join('\n')
          .trim();
        if (!remaining) {
          try { fs.unlinkSync(this.gitattributesPath); } catch {}
        } else {
          fs.writeFileSync(this.gitattributesPath, remaining + '\n', 'utf-8');
        }
      }
    }

    if (fs.existsSync(this.gitConfigPath)) {
      let configContent = fs.readFileSync(this.gitConfigPath, 'utf-8');
      if (configContent.includes('[merge "skyhook"]')) {
        configContent = configContent.replace(/\[merge "skyhook"\][\s\S]*?(?=\n\[|$)/, '').trim();
        fs.writeFileSync(this.gitConfigPath, configContent + '\n', 'utf-8');
      }
    }
  }

  install() {
    if (!this.isGitRepo()) {
      return { error: 'Not a git repository (missing .git directory)' };
    }

    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    const preRes = this._installHook(this.preCommitPath, PRE_COMMIT_MARKER, HOOK_SCRIPT_BODY);
    const checkoutRes = this._installHook(this.postCheckoutPath, POST_CHECKOUT_MARKER, POST_CHECKOUT_SCRIPT_BODY);
    const commitRes = this._installHook(this.postCommitPath, POST_COMMIT_MARKER, POST_COMMIT_SCRIPT_BODY);
    this._installMergeDriver();

    const allAlreadyInstalled = preRes.alreadyInstalled && checkoutRes.alreadyInstalled && commitRes.alreadyInstalled;

    return {
      success: true,
      message: allAlreadyInstalled
        ? 'Skyhook git hooks are already installed.'
        : 'Git lifecycle hooks (pre-commit, post-checkout, post-commit) and merge driver installed successfully.',
      installed: ['pre-commit', 'post-checkout', 'post-commit', 'merge-driver'],
      hookPath: this.preCommitPath
    };
  }

  _uninstallHook(filePath, marker) {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes(marker)) return false;

    const lines = content.split('\n');
    const filtered = [];
    let skipping = false;

    for (const line of lines) {
      if (line.includes(marker)) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (line.trim() === 'fi' || line.includes('exit 1')) {
          skipping = false;
          continue;
        }
        continue;
      }
      filtered.push(line);
    }

    const remaining = filtered.join('\n').trim();

    if (!remaining || remaining === '#!/usr/bin/env sh') {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Best-effort
      }
    } else {
      fs.writeFileSync(filePath, remaining + '\n', 'utf-8');
    }

    return true;
  }

  uninstall() {
    if (!this.isGitRepo()) {
      return { success: true, message: 'No git repository found.' };
    }

    const preRemoved = this._uninstallHook(this.preCommitPath, PRE_COMMIT_MARKER);
    const checkoutRemoved = this._uninstallHook(this.postCheckoutPath, POST_CHECKOUT_MARKER);
    const commitRemoved = this._uninstallHook(this.postCommitPath, POST_COMMIT_MARKER);
    this._uninstallMergeDriver();

    return {
      success: true,
      message: 'Skyhook git hooks and merge driver uninstalled successfully.',
      uninstalled: {
        preCommit: preRemoved,
        postCheckout: checkoutRemoved,
        postCommit: commitRemoved,
        mergeDriver: true
      }
    };
  }
}
