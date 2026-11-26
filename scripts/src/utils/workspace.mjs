import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve OpenSkill Galaxy workspace root across macOS / Linux / Windows.
 * Priority: process.env.OSG_ROOT > auto-detect parent of openskill-galaxy-tools.
 */
export function getWorkspaceRoot() {
  if (process.env.OSG_ROOT) {
    return resolve(process.env.OSG_ROOT);
  }
  // scripts/src/utils/workspace.mjs -> ../../../../ (flat) or ../../../../../ (legacy 00-平台与协作/工具集)
  const flatCandidate = resolve(__dirname, '../../../..');
  if (
    existsSync(join(flatCandidate, 'openskill-galaxy.github.io')) ||
    existsSync(join(flatCandidate, 'module-template'))
  ) {
    return flatCandidate;
  }
  const nestedCandidate = resolve(__dirname, '../../../../..');
  if (existsSync(join(nestedCandidate, '00-平台与协作'))) {
    return nestedCandidate;
  }
  return flatCandidate;
}

export const WORKSPACE_ROOT = getWorkspaceRoot();

export function getPortalDir(root = WORKSPACE_ROOT) {
  const flat = join(root, 'openskill-galaxy.github.io');
  if (existsSync(flat)) return flat;
  const legacy = join(root, '00-平台与协作', '官网门户');
  if (existsSync(legacy)) return legacy;
  return flat;
}

export function getTemplateDir(root = WORKSPACE_ROOT) {
  const flat = join(root, 'module-template');
  if (existsSync(flat)) return flat;
  const legacy = join(root, '00-平台与协作', '模块模板');
  if (existsSync(legacy)) return legacy;
  return flat;
}

export function getToolsDir(root = WORKSPACE_ROOT) {
  const flat = join(root, 'openskill-galaxy-tools');
  if (existsSync(flat)) return flat;
  const legacy = join(root, '00-平台与协作', '工具集');
  if (existsSync(legacy)) return legacy;
  return flat;
}

/**
 * Discover all learning module directories (excluding module-template).
 * Supports both flat layout (root/module-*) and legacy categorized layout (root/<cat>/<mod>).
 */
export function getModuleDirs(root = WORKSPACE_ROOT, { includeTemplate = false } = {}) {
  const results = [];
  const seen = new Set();

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(root, entry.name);

    // Flat layout: module-* directly under root
    if (existsSync(join(full, 'public', 'data', 'module.json'))) {
      if (!includeTemplate && (entry.name === 'module-template' || entry.name === '模块模板')) continue;
      if (!seen.has(full)) {
        seen.add(full);
        results.push({ category: 'root', name: entry.name, path: full });
      }
      continue;
    }

    // Legacy nested layout: root/<category>/<module>
    let subs = [];
    try {
      subs = readdirSync(full, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sub of subs) {
      if (!sub.isDirectory() || sub.name.startsWith('.') || sub.name === 'node_modules') continue;
      const subFull = join(full, sub.name);
      if (existsSync(join(subFull, 'public', 'data', 'module.json'))) {
        if (!includeTemplate && (sub.name === 'module-template' || sub.name === '模块模板')) continue;
        if (!seen.has(subFull)) {
          seen.add(subFull);
          results.push({ category: entry.name, name: sub.name, path: subFull });
        }
      }
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover all git repositories in the workspace (platform repos + all modules).
 */
export function getAllRepoDirs(root = WORKSPACE_ROOT) {
  const repos = [];
  const seen = new Set();

  const platformDirs = [
    { category: 'Platform', name: 'openskill-galaxy-tools', path: getToolsDir(root) },
    { category: 'Platform', name: 'module-template', path: getTemplateDir(root) },
    { category: 'Platform', name: 'openskill-galaxy.github.io', path: getPortalDir(root) },
  ];
  for (const item of platformDirs) {
    if (existsSync(join(item.path, '.git')) && !seen.has(item.path)) {
      seen.add(item.path);
      repos.push(item);
    }
  }

  for (const mod of getModuleDirs(root, { includeTemplate: true })) {
    if (existsSync(join(mod.path, '.git')) && !seen.has(mod.path)) {
      seen.add(mod.path);
      repos.push(mod);
    }
  }

  return repos;
}
