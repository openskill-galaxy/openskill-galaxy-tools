import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function git(repoPath, args) {
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8' }).trimEnd();
}

function initSyntheticRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test User']);
  writeFileSync(join(dir, 'vite.config.js'), 'export default {};\n', 'utf8');
  writeFileSync(join(dir, 'tsconfig.tsbuildinfo'), '{"version":"1"}\n', 'utf8');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'init']);
  return git(dir, ['rev-parse', 'HEAD']);
}

function scanForbiddenStatus(repoPath) {
  const forbiddenStatus = new Set(['vite.config.js', 'vite.config.d.ts', 'tsconfig.tsbuildinfo']);
  const found = [];
  const statusOut = git(repoPath, ['status', '--short']);
  for (const line of statusOut ? statusOut.split('\n') : []) {
    const code = line.slice(0, 2);
    const pathPart = line.slice(3).trim();
    if (code.trim() === 'D') continue;
    if (
      forbiddenStatus.has(pathPart) ||
      pathPart.endsWith('.tsbuildinfo') ||
      pathPart.startsWith('tmp-')
    ) {
      found.push(pathPart);
    }
  }
  return found;
}

test('git-boundaries: simulated extra commit causes HEAD !== baseline failure', () => {
  const tmpDir = join('/tmp', `osg-e2e-git-1-${randomUUID()}`);
  try {
    const baselineHead = initSyntheticRepo(tmpDir);
    writeFileSync(join(tmpDir, 'extra.txt'), 'new commit\n', 'utf8');
    git(tmpDir, ['add', 'extra.txt']);
    git(tmpDir, ['commit', '-m', 'unintended commit']);
    const actualHead = git(tmpDir, ['rev-parse', 'HEAD']);
    assert.notEqual(actualHead, baselineHead);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('git-boundaries: first-line " M vite.config.js" modification is caught without .trim() truncation', () => {
  const tmpDir = join('/tmp', `osg-e2e-git-2-${randomUUID()}`);
  try {
    initSyntheticRepo(tmpDir);
    writeFileSync(join(tmpDir, 'vite.config.js'), 'export default { modified: true };\n', 'utf8');
    const rawStatus = git(tmpDir, ['status', '--short']);
    assert.ok(rawStatus.startsWith(' M vite.config.js'), `Unexpected status: ${JSON.stringify(rawStatus)}`);
    const found = scanForbiddenStatus(tmpDir);
    assert.deepEqual(found, ['vite.config.js']);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('git-boundaries: stray tmp-* and *.tsbuildinfo artifacts are detected', () => {
  const tmpDir = join('/tmp', `osg-e2e-git-3-${randomUUID()}`);
  try {
    initSyntheticRepo(tmpDir);
    writeFileSync(join(tmpDir, 'tmp-stray.txt'), 'stray\n', 'utf8');
    writeFileSync(join(tmpDir, 'foo.tsbuildinfo'), 'buildinfo\n', 'utf8');
    const found = scanForbiddenStatus(tmpDir).sort();
    assert.deepEqual(found, ['foo.tsbuildinfo', 'tmp-stray.txt']);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('git-boundaries: intentional " D tsconfig.tsbuildinfo" deletion is allowed cleanly', () => {
  const tmpDir = join('/tmp', `osg-e2e-git-4-${randomUUID()}`);
  try {
    initSyntheticRepo(tmpDir);
    rmSync(join(tmpDir, 'tsconfig.tsbuildinfo'));
    const rawStatus = git(tmpDir, ['status', '--short']);
    assert.ok(rawStatus.startsWith(' D tsconfig.tsbuildinfo'), `Unexpected status: ${JSON.stringify(rawStatus)}`);
    const found = scanForbiddenStatus(tmpDir);
    assert.deepEqual(found, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
