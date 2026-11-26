#!/usr/bin/env node
import { existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { WORKSPACE_ROOT, getPortalDir, getTemplateDir, getModuleDirs } from './utils/workspace.mjs';
import { hasFlag, getArgValue } from './utils/cli-utils.mjs';

function main() {
  const argv = process.argv.slice(2);
  const includePlatform = hasFlag(argv, '--include-platform');
  const dryRun = hasFlag(argv, '--dry-run');
  const filterSubstr = getArgValue(argv, '--filter');
  const concRaw = Number(getArgValue(argv, '--concurrency') || 6);
  const conc = Number.isFinite(concRaw) && concRaw >= 1 ? Math.floor(concRaw) : 6;

  const candidates = [];
  if (includePlatform) {
    candidates.push(getPortalDir(), getTemplateDir());
  }
  for (const m of getModuleDirs()) {
    candidates.push(m.path);
  }

  let dirs = candidates.filter(
    (dir) => existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'vite.config.ts'))
  );

  if (filterSubstr) {
    dirs = dirs.filter((dir) => dir.toLowerCase().includes(filterSubstr.toLowerCase()));
  }

  console.log(`building ${dirs.length} projects (concurrency=${conc})${dryRun ? ' [DRY RUN]' : ''}`);
  if (dryRun) {
    for (const dir of dirs) {
      const rel = dir.replace(WORKSPACE_ROOT + '/', '').replace(WORKSPACE_ROOT + '\\', '');
      console.log(`  would build: ${rel}`);
    }
    return;
  }

  if (dirs.length === 0) {
    console.error('No Vite projects matched.');
    process.exit(1);
  }

  let idx = 0;
  const failures = [];

  async function worker() {
    while (idx < dirs.length) {
      const dir = dirs[idx++];
      await new Promise((res) => {
        exec('npm run build', { cwd: dir, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          const rel = dir.replace(WORKSPACE_ROOT + '/', '').replace(WORKSPACE_ROOT + '\\', '');
          if (err) {
            const exitCode = typeof err.code === 'number' ? err.code : 1;
            failures.push({ rel, exitCode });
            const lines = (stdout + '\n' + stderr)
              .split(/\r?\n/)
              .map((l) => l.trimEnd())
              .filter(Boolean);
            const output =
              lines.length <= 150
                ? lines.join('\n')
                : [
                    ...lines.slice(0, 50),
                    `... (${lines.length - 150} lines omitted) ...`,
                    ...lines.slice(-100),
                  ].join('\n');
            console.log(`FAIL ${rel} (exit ${exitCode})\n${output}\n`);
          } else {
            console.log(`ok   ${rel}`);
          }
          res();
        });
      });
    }
  }

  Promise.all(Array.from({ length: Math.min(conc, dirs.length) }, worker)).then(() => {
    console.log(`\ndone: ${dirs.length - failures.length}/${dirs.length} ok, ${failures.length} failed`);
    failures.forEach((f) => console.log(`FAILED: ${f.rel} (exit ${f.exitCode})`));
    process.exit(failures.length ? 1 : 0);
  });
}

main();
