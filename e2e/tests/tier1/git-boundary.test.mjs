import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { WORKSPACE_ROOT, TOOLS_DIR, getAllRepoDirs } from '../../lib/workspace.mjs';

function git(repoPath, args) {
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8' }).trimEnd();
}

test('git-boundary: discovers the module catalog and all three platform repositories', () => {
  const repos = getAllRepoDirs();
  const names = repos.map((r) => r.name).sort();
  const expectedNames = ['openskill-galaxy.github.io', 'openskill-galaxy-tools', 'module-template',
    ...discoverPortalFixtures().modules.map(({ slug }) => slug)].sort();
  assert.deepEqual(names, expectedNames);
});

test('git-boundary: all 63 repos are 0 ahead and 0 behind upstream @{u}', () => {
  const repos = getAllRepoDirs();
  const nonZero = [];
  for (const repo of repos) {
    const counts = git(repo.path, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    if (counts !== '0\t0') {
      nonZero.push({ repo: repo.name, counts });
    }
  }
  assert.deepEqual(nonZero, [], `Ahead/behind non-zero: ${JSON.stringify(nonZero)}`);
});

test('git-boundary: no leftover temp artifacts (tmp-*) or tracked/unignored tsbuildinfo/vite.config.js/d.ts in repos', () => {
  const repos = getAllRepoDirs();
  const forbiddenStatus = new Set(['vite.config.js', 'vite.config.d.ts', 'tsconfig.tsbuildinfo']);
  const found = [];

  for (const repo of repos) {
    for (const entry of readdirSync(repo.path, { withFileTypes: true })) {
      if (entry.name.startsWith('tmp-') || entry.name.endsWith('.tmp')) {
        found.push(join(repo.name, entry.name));
      }
    }
    const tracked = git(repo.path, ['ls-files', 'vite.config.js', 'vite.config.d.ts', '*.tsbuildinfo']);
    for (const path of tracked.split('\n').filter(Boolean)) {
      if (existsSync(join(repo.path, path))) found.push(`${repo.name}/${path}`);
    }
    const statusOut = git(repo.path, ['status', '--short']);
    for (const line of statusOut ? statusOut.split('\n') : []) {
      const code = line.slice(0, 2);
      const pathPart = line.slice(3).trim();
      // Ignore intentional deletion (" D tsconfig.tsbuildinfo") of legacy tracked tsbuildinfo
      if (code.trim() === 'D') continue;
      if (
        forbiddenStatus.has(pathPart) ||
        pathPart.endsWith('.tsbuildinfo') ||
        pathPart.startsWith('tmp-')
      ) {
        found.push(`${repo.name} (${line.trim()})`);
      }
    }
  }
  assert.deepEqual(found, [], `Found leftover temp/build artifacts: ${JSON.stringify(found)}`);
});

test('git-boundary: openskill-galaxy-tools working tree has no stray temp files outside e2e/scripts', () => {
  const statusOut = git(TOOLS_DIR, ['status', '--short']);
  const lines = statusOut ? statusOut.split('\n') : [];
  const stray = lines.filter((line) => {
    const pathPart = line.slice(3).trim();
    return (
      pathPart.startsWith('tmp') ||
      pathPart.endsWith('.log') ||
      pathPart === 'test-results' ||
      pathPart === 'playwright-report'
    );
  });
  assert.deepEqual(stray, [], `Stray temp entries in openskill-galaxy-tools: ${JSON.stringify(stray)}`);
  assert.ok(existsSync(WORKSPACE_ROOT));
});
