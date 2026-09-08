/**
 * Hook CLI Handlers
 * Allows users and agents to install and manage Git pre-commit enforcement hooks.
 */

import { GitHookManager } from '../git/GitHookManager.js';

export async function cmdHookInstall(ctx, args = {}) {
  const manager = new GitHookManager(process.cwd());
  const result = manager.install();
  return result;
}

export async function cmdHookUninstall(ctx, args = {}) {
  const manager = new GitHookManager(process.cwd());
  const result = manager.uninstall();
  return result;
}

export async function cmdHookStatus(ctx, args = {}) {
  const manager = new GitHookManager(process.cwd());
  return manager.getStatus();
}
