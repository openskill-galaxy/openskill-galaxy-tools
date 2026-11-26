#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { WORKSPACE_ROOT, getPortalDir, getTemplateDir, getToolsDir, getModuleDirs } from './utils/workspace.mjs';
import { hasFlag, getArgValue } from './utils/cli-utils.mjs';

function isNodeModulesComplete(dir) {
  const nmDir = join(dir, 'node_modules');
  const lockMarker = join(nmDir, '.package-lock.json');
  if (!existsSync(nmDir) || !existsSync(lockMarker)) return false;

  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    for (const dep of Object.keys(allDeps)) {
      if (!existsSync(join(nmDir, dep))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function runNpmInstall(dir) {
  return new Promise((resolvePromise) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCmd, ['install', '--no-audit', '--no-fund'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', (err) => {
      resolvePromise({ ok: false, code: 1, output: err.message });
    });
    child.on('close', (code) => {
      resolvePromise({ ok: code === 0, code: code ?? 1, output });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const includePlatform = hasFlag(argv, '--include-platform') || hasFlag(argv, '--all');
  const only = getArgValue(argv, '--only');
  const force = hasFlag(argv, '--force');
  const dryRun = hasFlag(argv, '--dry-run');
  const concRaw = Number(getArgValue(argv, '--concurrency') || 4);
  const concurrency = Number.isFinite(concRaw) && concRaw >= 1 ? Math.floor(concRaw) : 4;

  const validOnly = new Set(['modules', 'portal', 'template', 'tools']);
  if (only && !validOnly.has(only)) {
    console.error(`Invalid --only value '${only}'. Expected one of: modules, portal, template, tools`);
    process.exit(1);
  }

  const targets = [];
  if (!only || only === 'modules') {
    for (const m of getModuleDirs()) {
      targets.push({ name: m.name, path: m.path });
    }
  }
  if (only === 'portal' || (!only && includePlatform)) {
    targets.push({ name: 'openskill-galaxy.github.io', path: getPortalDir() });
  }
  if (only === 'template' || (!only && includePlatform)) {
    targets.push({ name: 'module-template', path: getTemplateDir() });
  }
  if (only === 'tools' || (!only && includePlatform)) {
    targets.push({ name: 'openskill-galaxy-tools/scripts', path: join(getToolsDir(), 'scripts') });
  }

  const pending = [];
  let skipped = 0;

  for (const t of targets) {
    if (!existsSync(join(t.path, 'package.json'))) continue;
    if (!force && isNodeModulesComplete(t.path)) {
      skipped++;
    } else {
      pending.push(t);
    }
  }

  console.log(
    `Targets: ${targets.length} | Complete/skipped: ${skipped} | Need install: ${pending.length}${dryRun ? ' [DRY RUN]' : ''}`
  );

  if (dryRun) {
    for (const p of pending) {
      const rel = p.path.replace(WORKSPACE_ROOT + '/', '').replace(WORKSPACE_ROOT + '\\', '');
      console.log(`  would install: ${rel}`);
    }
    return;
  }

  let idx = 0;
  let installed = 0;
  const failures = [];

  async function worker() {
    while (idx < pending.length) {
      const t = pending[idx++];
      const rel = t.path.replace(WORKSPACE_ROOT + '/', '').replace(WORKSPACE_ROOT + '\\', '');
      console.log(`Installing in ${rel}...`);
      const res = await runNpmInstall(t.path);
      if (res.ok) {
        installed++;
        console.log(`  ✅ ${rel}`);
      } else {
        failures.push({ rel, code: res.code, output: res.output });
        console.error(`  ❌ ${rel} (exit ${res.code})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, worker));

  console.log(`\n=== Dependency Install Completed (${installed} installed, ${skipped} skipped, ${failures.length} failed) ===`);
  if (failures.length > 0) {
    for (const f of failures) {
      const tail = f.output.trim().split('\n').slice(-10).join('\n');
      console.error(`\n--- ${f.rel} ---\n${tail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
