import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  SCRIPTS_DIR,
  WORKSPACE_ROOT,
  createIsolatedWorkspace,
} from '../../lib/workspace.mjs';

const execFileAsync = promisify(execFile);

async function runScript(scriptName, args = [], { env = {} } = {}) {
  const scriptPath = join(SCRIPTS_DIR, 'src', scriptName);
  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, ...args], {
      cwd: SCRIPTS_DIR,
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    return {
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

test('cli-contracts: scripts/node_modules installed and buildall --dry-run discovers 62 projects', async () => {
  assert.ok(existsSync(join(SCRIPTS_DIR, 'node_modules', 'zod')), 'scripts/node_modules/zod missing');
  const res = await runScript('buildall.mjs', ['--include-platform', '--dry-run']);
  assert.equal(res.exitCode, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /building 62 projects/);
});

test('cli-contracts: validate-module.mjs --all --include-template passes 61/61 with exitCode 0', async () => {
  const res = await runScript('validate-module.mjs', ['--all', '--include-template']);
  assert.equal(res.exitCode, 0, `validate-module failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /Passed:\s*61\/61,\s*Failed:\s*0/);
  assert.ok(!res.stdout.includes('VALIDATION FAILED'));
  assert.ok(!res.stdout.includes('❌'));
});

test('cli-contracts: check-references.mjs --all --include-template reports 0 failed modules', async () => {
  const res = await runScript('check-references.mjs', ['--all', '--include-template']);
  assert.equal(res.exitCode, 0, `check-references failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /Failed modules:\s*0\/61/);
  assert.ok(!res.stdout.includes('❌'));
});

test('cli-contracts: check-duplicates.mjs --all --include-template reports 0 failed modules', async () => {
  const res = await runScript('check-duplicates.mjs', ['--all', '--include-template']);
  assert.equal(res.exitCode, 0, `check-duplicates failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /Failed modules:\s*0\/61/);
  assert.ok(!res.stdout.includes('❌'));
});

test('cli-contracts: audit-questions.mjs audits all 60 modules with 0 problems', async () => {
  const res = await runScript('audit-questions.mjs');
  assert.equal(res.exitCode, 0, `audit-questions failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /modules=60\s+questions=\d+\s+exams=\d+\s+problems=0/);
  const qMatch = res.stdout.match(/questions=(\d+)/);
  const eMatch = res.stdout.match(/exams=(\d+)/);
  assert.ok(Number(qMatch?.[1]) > 0);
  assert.ok(Number(eMatch?.[1]) > 0);
});

test('cli-contracts: build-health-report.mjs --dry-run --strict passes 60/60 with 0 issues', async () => {
  const res = await runScript('build-health-report.mjs', ['--dry-run', '--strict']);
  assert.equal(res.exitCode, 0, `build-health-report failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /Modules scanned:\s*60/);
  assert.match(res.stdout, /Content healthy:\s*60\/60/);
  assert.match(res.stdout, /Issues found:\s*0/);
});

test('cli-contracts: dry-run mode of fix-stats, optimize-pwa-and-search, and build-global-index exits 0 cleanly', async () => {
  const fixRes = await runScript('fix-stats.mjs', ['--dry-run']);
  assert.equal(fixRes.exitCode, 0, fixRes.stderr);
  assert.match(fixRes.stdout, /module\.json stats checked for 61 modules \(0 would update\)/);
  assert.match(fixRes.stdout, /portal summaries stripped:\s*0/);

  const optRes = await runScript('optimize-pwa-and-search.mjs', ['--dry-run']);
  assert.equal(optRes.exitCode, 0, optRes.stderr);
  assert.match(optRes.stdout, /Previewed 60 module search-index\.json/);
  assert.match(optRes.stdout, /Previewed manifest\.json for 60\/60 modules/);

  const gsiRes = await runScript('build-global-index.mjs', ['--dry-run']);
  assert.equal(gsiRes.exitCode, 0, gsiRes.stderr);
  assert.match(gsiRes.stdout, /Global search index previewed with \d+ items/);
});

test('cli-contracts: mutating CLI pipeline succeeds in isolated /tmp OSG_ROOT without touching real workspace', async () => {
  const iso = createIsolatedWorkspace(['module-digital-logic', 'module-python-basic'], {
    root: WORKSPACE_ROOT,
  });
  try {
    // Filter portal modules.json in isolated root to the 2 copied modules so --strict passes
    const portalModulesPath = join(iso.portalDir, 'public', 'data', 'modules.json');
    const allPortalMods = JSON.parse(readFileSync(portalModulesPath, 'utf8'));
    const filtered = allPortalMods.filter((m) =>
      ['module-digital-logic', 'module-python-basic'].includes(m.slug)
    );
    const { writeFileSync } = await import('node:fs');
    writeFileSync(portalModulesPath, JSON.stringify(filtered, null, 2) + '\n', 'utf8');

    const env = { OSG_ROOT: iso.root };

    const fixRes = await runScript('fix-stats.mjs', [], { env });
    assert.equal(fixRes.exitCode, 0, fixRes.stdout + fixRes.stderr);
    assert.match(fixRes.stdout, /checked for 3 modules/);

    const optRes = await runScript('optimize-pwa-and-search.mjs', [], { env });
    assert.equal(optRes.exitCode, 0, optRes.stdout + optRes.stderr);
    assert.match(optRes.stdout, /Rebuilt 2 module search-index\.json/);

    const gsiRes = await runScript('build-global-index.mjs', [], { env });
    assert.equal(gsiRes.exitCode, 0, gsiRes.stdout + gsiRes.stderr);
    const generatedGlobalIndex = JSON.parse(
      readFileSync(join(iso.portalDir, 'public', 'data', 'global-search-index.json'), 'utf8')
    );
    assert.ok(Array.isArray(generatedGlobalIndex) && generatedGlobalIndex.length > 0);
    assert.ok(
      generatedGlobalIndex.every((item) =>
        ['module-digital-logic', 'module-python-basic'].includes(item.moduleSlug)
      )
    );

    const healthRes = await runScript('build-health-report.mjs', ['--strict'], { env });
    assert.equal(healthRes.exitCode, 0, healthRes.stdout + healthRes.stderr);
    assert.match(healthRes.stdout, /Content healthy:\s*2\/2/);
    const report = JSON.parse(
      readFileSync(join(iso.portalDir, 'public', 'data', 'site-health-report.json'), 'utf8')
    );
    assert.equal(report.moduleCount, 2);
    assert.equal(report.summary.healthyModules, 2);
    assert.equal(report.summary.totalIssues, 0);
  } finally {
    iso.cleanup();
  }
});
