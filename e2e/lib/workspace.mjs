import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function resolveWorkspaceRoot() {
  if (process.env.OSG_ROOT) {
    return resolve(process.env.OSG_ROOT);
  }
  // e2e/lib/workspace.mjs -> ../../.. = openskill-galaxy
  const candidate = resolve(__dirname, '../../..');
  if (
    existsSync(join(candidate, 'openskill-galaxy.github.io')) &&
    existsSync(join(candidate, 'openskill-galaxy-tools'))
  ) {
    return candidate;
  }
  return '/Users/claire/Wonderful/openskill-galaxy';
}

export const WORKSPACE_ROOT = resolveWorkspaceRoot();
export const PORTAL_DIR = join(WORKSPACE_ROOT, 'openskill-galaxy.github.io');
export const TEMPLATE_DIR = join(WORKSPACE_ROOT, 'module-template');
export const TOOLS_DIR = join(WORKSPACE_ROOT, 'openskill-galaxy-tools');
export const SCRIPTS_DIR = join(TOOLS_DIR, 'scripts');
export const E2E_DIR = join(TOOLS_DIR, 'e2e');

export const REPRESENTATIVE_MODULES = [
  'module-algorithm-interview',
  'module-python-basic',
  'module-llm-application',
  'module-digital-logic',
  'module-computer-network',
  'module-rust-basic',
];

export function getModuleDirs(root = WORKSPACE_ROOT, { includeTemplate = false } = {}) {
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    if (!includeTemplate && entry.name === 'module-template') continue;
    const full = join(root, entry.name);
    if (existsSync(join(full, 'public', 'data', 'module.json'))) {
      results.push({ name: entry.name, path: full });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function getAllRepoDirs(root = WORKSPACE_ROOT) {
  const repos = [];
  const fixed = ['openskill-galaxy.github.io', 'openskill-galaxy-tools', 'module-template'];
  for (const name of fixed) {
    const full = join(root, name);
    if (existsSync(join(full, '.git'))) {
      repos.push({ name, path: full });
    }
  }
  for (const mod of getModuleDirs(root, { includeTemplate: false })) {
    if (existsSync(join(mod.path, '.git'))) {
      repos.push(mod);
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

function copyDirClean(src, dest, excludeNames = new Set(['node_modules', 'dist', '.git'])) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (sourcePath) => {
      const rel = sourcePath.slice(src.length);
      if (!rel) return true;
      const parts = rel.split(/[\\/]/).filter(Boolean);
      return !parts.some((p) => excludeNames.has(p));
    },
  });
}

/**
 * Create an isolated temporary OSG_ROOT workspace in /tmp/osg-e2e-cli-<pid>-<uuid>
 * containing Portal, Template, Tools scripts (with symlinked node_modules),
 * and selected learning modules so mutating CLI scripts and fault injection
 * run safely without touching the real workspace.
 */
export function createIsolatedWorkspace(
  moduleSlugs = ['module-digital-logic', 'module-python-basic'],
  { root = WORKSPACE_ROOT } = {}
) {
  const tmpRoot = join('/tmp', `osg-e2e-cli-${process.pid}-${randomUUID()}`);
  mkdirSync(tmpRoot, { recursive: true });

  try {
    const srcPortal = join(root, 'openskill-galaxy.github.io');
    const srcTemplate = join(root, 'module-template');
    const srcTools = join(root, 'openskill-galaxy-tools');

    const dstPortal = join(tmpRoot, 'openskill-galaxy.github.io');
    const dstTemplate = join(tmpRoot, 'module-template');
    const dstTools = join(tmpRoot, 'openskill-galaxy-tools');

    // Copy Portal public/ + manifests/configs
    mkdirSync(dstPortal, { recursive: true });
    if (existsSync(join(srcPortal, 'public'))) {
      copyDirClean(join(srcPortal, 'public'), join(dstPortal, 'public'));
    }
    for (const f of ['package.json', 'vite.config.ts', 'index.html']) {
      if (existsSync(join(srcPortal, f))) {
        cpSync(join(srcPortal, f), join(dstPortal, f));
      }
    }

    // Copy Template without node_modules/dist/.git
    if (existsSync(srcTemplate)) {
      copyDirClean(srcTemplate, dstTemplate);
    }

    // Copy Tools scripts without node_modules/e2e/.git, symlink scripts/node_modules if available
    const dstScripts = join(dstTools, 'scripts');
    mkdirSync(dstScripts, { recursive: true });
    if (existsSync(join(srcTools, 'scripts', 'src'))) {
      copyDirClean(join(srcTools, 'scripts', 'src'), join(dstScripts, 'src'));
    }
    if (existsSync(join(srcTools, 'scripts', 'package.json'))) {
      cpSync(join(srcTools, 'scripts', 'package.json'), join(dstScripts, 'package.json'));
    }
    const realNodeModules = join(srcTools, 'scripts', 'node_modules');
    if (existsSync(realNodeModules)) {
      symlinkSync(realNodeModules, join(dstScripts, 'node_modules'), 'dir');
    }

    // Copy selected modules without node_modules/dist/.git
    const moduleDirs = {};
    for (const slug of moduleSlugs) {
      const srcMod = join(root, slug);
      if (!existsSync(srcMod)) {
        throw new Error(`createIsolatedWorkspace: module does not exist: ${srcMod}`);
      }
      const dstMod = join(tmpRoot, slug);
      copyDirClean(srcMod, dstMod);
      moduleDirs[slug] = dstMod;
    }

    return {
      root: tmpRoot,
      portalDir: dstPortal,
      templateDir: dstTemplate,
      toolsDir: dstTools,
      scriptsDir: dstScripts,
      moduleDirs,
      cleanup() {
        rmSync(tmpRoot, { recursive: true, force: true });
      },
    };
  } catch (err) {
    rmSync(tmpRoot, { recursive: true, force: true });
    throw err;
  }
}
