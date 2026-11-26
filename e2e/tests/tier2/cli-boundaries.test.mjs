import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SCRIPTS_DIR, WORKSPACE_ROOT, createIsolatedWorkspace } from '../../lib/workspace.mjs';

const execFileAsync = promisify(execFile);
const TARGET_MODULE = 'module-ai-learning-assistant';

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

function mutateJson(filePath, fn) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const next = fn(data);
  writeFileSync(filePath, JSON.stringify(next ?? data, null, 2) + '\n', 'utf8');
}

test('cli-boundaries: broken lessons[].knowledgePoints reference fails check-references non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/lessons.json'), (lessons) => {
      lessons[0].knowledgePoints = ['nonexistent-kp-999'];
    });
    const res = await runScript('check-references.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /Total missing references:\s*1\b/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: broken lessons[].courseId fails check-references non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/lessons.json'), (lessons) => {
      lessons[0].courseId = 'nonexistent-course-999';
    });
    const res = await runScript('check-references.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /lessons\.courseId/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: broken questions[].knowledge_points fails check-references non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/questions.json'), (qs) => {
      qs[0].knowledge_points = ['missing-kp-ref'];
    });
    const res = await runScript('check-references.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /questions\.knowledge_points/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: duplicate ID in courses.json fails check-duplicates non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/courses.json'), (courses) => {
      courses.push({ ...courses[0], slug: `${courses[0].slug}-copy` });
    });
    const res = await runScript('check-duplicates.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /duplicateIds=1\b/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: duplicate routable slug in lessons.json fails check-duplicates non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/lessons.json'), (lessons) => {
      lessons[1].slug = lessons[0].slug;
    });
    const res = await runScript('check-duplicates.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /duplicateSlugs=1\b/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: empty slug in knowledge-points.json fails check-duplicates non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/knowledge-points.json'), (kps) => {
      kps[0].slug = '';
    });
    const res = await runScript('check-duplicates.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /emptySlugs=1\b/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: invalid question answer not in options fails audit-questions non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/questions.json'), (qs) => {
      const idx = qs.findIndex((q) => q.type === 'single');
      qs[idx].answer = ['NONEXISTENT_KEY'];
    });
    const res = await runScript('audit-questions.mjs', [], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /problems=[1-9]/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: judge question with non-T/F answer fails audit-questions non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/questions.json'), (qs) => {
      const idx = qs.findIndex((q) => q.type === 'judge');
      qs[idx].answer = ['YES'];
    });
    const res = await runScript('audit-questions.mjs', [], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /must be 'T' or 'F'/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: single question with 2 answers fails audit-questions non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/questions.json'), (qs) => {
      const idx = qs.findIndex((q) => q.type === 'single' && q.options.length >= 2);
      qs[idx].answer = [qs[idx].options[0].key, qs[idx].options[1].key];
    });
    const res = await runScript('audit-questions.mjs', [], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /single with 2 answers/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: module.json stats mismatch fails validate-module non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/module.json'), (meta) => {
      meta.stats.courses = 9999;
    });
    const res = await runScript('validate-module.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /VALIDATION FAILED/);
    assert.match(res.stdout, /module\.json\.stats\.courses=9999/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: wrong vite.config.ts base fails validate-module non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    writeFileSync(join(modDir, 'vite.config.ts'), 'export default { base: "/wrong-slug/" };\n');
    const res = await runScript('validate-module.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /vite\.config\.ts base/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: wrong manifest.json scope fails validate-module non-zero', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/manifest.json'), (m) => {
      m.scope = '/wrong-scope/';
    });
    const res = await runScript('validate-module.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /manifest\.json scope/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: missing search-index.json fails validate-module unless --allow-missing-search-index', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    rmSync(join(modDir, 'public/data/search-index.json'));

    const resFail = await runScript('validate-module.mjs', [modDir], { env: { OSG_ROOT: iso.root } });
    assert.notEqual(resFail.exitCode, 0);
    assert.match(resFail.stdout, /Missing public\/data\/search-index\.json/);

    const resAllow = await runScript(
      'validate-module.mjs',
      [modDir, '--allow-missing-search-index'],
      { env: { OSG_ROOT: iso.root } }
    );
    assert.equal(resAllow.exitCode, 0, resAllow.stdout + resAllow.stderr);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: build-health-report --strict fails non-zero when an isolated module has a fault', async () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const baseline = await runScript('build-health-report.mjs', ['--dry-run', '--strict'], {
      env: { OSG_ROOT: iso.root },
    });
    assert.equal(baseline.exitCode, 0, `Baseline should be healthy first:\n${baseline.stdout}`);
    assert.match(baseline.stdout, /Content healthy:\s*1\/1/);

    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/lessons.json'), (lessons) => {
      lessons[0].knowledgePoints = ['broken-kp-id'];
    });
    const res = await runScript('build-health-report.mjs', ['--dry-run', '--strict'], {
      env: { OSG_ROOT: iso.root },
    });
    assert.notEqual(res.exitCode, 0);
    assert.match(res.stdout, /Content healthy:\s*0\/1/);
    assert.match(res.stdout, /lessons\.knowledgePoints/);
  } finally {
    iso.cleanup();
  }
});

test('cli-boundaries: dry-run scripts make zero mutations and validate-module without args exits 1', async () => {
  const noArgRes = await runScript('validate-module.mjs', []);
  assert.notEqual(noArgRes.exitCode, 0);

  const iso = createIsolatedWorkspace([TARGET_MODULE], { root: WORKSPACE_ROOT });
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    mutateJson(join(modDir, 'public/data/module.json'), (m) => {
      m.stats.courses = 999;
    });
    const before = readFileSync(join(modDir, 'public/data/module.json'), 'utf8');
    const fixDry = await runScript('fix-stats.mjs', ['--dry-run'], { env: { OSG_ROOT: iso.root } });
    assert.equal(fixDry.exitCode, 0);
    const after = readFileSync(join(modDir, 'public/data/module.json'), 'utf8');
    assert.equal(after, before);
  } finally {
    iso.cleanup();
  }
});
