import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PORTAL_DIR, SCRIPTS_DIR } from '../../lib/workspace.mjs';

const exec = promisify(execFile);
const tool = join(SCRIPTS_DIR, 'src/verify-catalog.mjs');
const guard = join(PORTAL_DIR, 'scripts/check-release-data.mjs');
const portal = 'openskill-galaxy.github.io';
const slugs = ['module-a', 'module-b'];

function makeFiles() {
  const files = new Map();
  const catalog = slugs.map((slug) => ({ slug, id: 'id-' + slug, lessonMinutes: 12 }));
  const counts = { courses: 0, lessons: 1, knowledgePoints: 0, questions: 1, exams: 0, cases: 0, routes: 0,
    tags: 0, glossary: 0, faqs: 0, searchIndexEntries: 1 };
  const stats = { moduleCount: 2, totalCourses: 0, totalLessons: 2, totalKnowledgePoints: 0, totalQuestions: 2,
    totalExams: 0, totalCases: 0, totalRoutes: 0, totalTags: 0, totalGlossary: 0, totalFaqs: 0, totalSearchIndexEntries: 2 };
  const global = [];
  for (const entry of catalog) {
    const set = (file, data) => files.set(entry.slug + '/data/' + file + '.json', data);
    for (const f of ['courses', 'knowledge-points', 'exams', 'cases', 'routes', 'tags', 'glossary', 'faqs']) set(f, []);
    const { searchIndexEntries, ...metaStats } = counts;
    set('module', { ...entry, stats: metaStats });
    set('lessons', [{ id: 'l', slug: 'intro', estimatedMinutes: 12 }, { id: 'archive', slug: 'old', editorialStatus: 'draft', estimatedMinutes: 55 }]);
    set('questions', [{ id: 'q', slug: 'first' }]);
    set('search-index', [{ id: 'q', type: 'question' }]);
    global.push({ type: 'lesson', id: 'l', slug: 'intro', estimatedMinutes: 12, moduleSlug: entry.slug },
      { type: 'question', id: 'q', slug: 'first', moduleSlug: entry.slug });
  }
  files.set('data/modules.json', catalog);
  files.set('data/platform-stats.json', stats);
  files.set('data/global-search-index.json', global);
  files.set('data/site-health-report.json', { moduleCount: 2, totals: { ...stats },
    modules: slugs.map((slug) => ({ slug, counts: { ...counts } })) });
  return files;
}

async function fixture(t) {
  const files = makeFiles();
  const root = await mkdtemp(join(tmpdir(), 'osg-release-test-'));
  const write = async (key, data, layer) => {
    const [repo, ...parts] = key.startsWith('data/') ? [portal, ...key.split('/')] : key.split('/');
    const dest = join(root, repo, layer, ...parts.slice(0, -1));
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, parts.at(-1)), JSON.stringify(data));
  };
  for (const [key, value] of files) {
    await write(key, value, 'public');
    await write(key, value, 'dist');
  }
  let slow;
  const server = createServer((req, res) => {
    const key = req.url.slice(1);
    if (key === slow) return;
    if (!files.has(key)) res.writeHead(404);
    res.end(JSON.stringify(files.get(key)));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const run = async (mode, ...args) => {
    const argv = [tool, mode, '--json', ...args];
    if (mode !== 'local') argv.push('--origin', url);
    try {
      const { stdout } = await exec(process.execPath, argv, { env: { ...process.env, OSG_ROOT: root } });
      return { code: 0, ...JSON.parse(stdout) };
    } catch (err) {
      return { code: err.code, ...JSON.parse(err.stdout) };
    }
  };
  return { files, run, write, root, withhold: (key) => { slow = key; } };
}

test('Release audit separates module search-index rows from the global index and handles legacy records and drafts', async (t) => {
  const { files, run, root } = await fixture(t);
  await exec(process.execPath, [guard, join(root, portal, 'dist/data')]);
  for (const mode of ['local', 'staged', 'live']) {
    const r = await run(mode);
    assert.equal(r.code, 0, JSON.stringify(r));
    assert.deepEqual(r.totals.totalSearchIndexEntries, { declared: 2, actual: 2, measuredModules: 2 });
    assert.equal(r.totals.totalLessons.actual, 2);
  }
  // Legacy Pages releases predate the optional lessonMinutes and health.totals fields.
  delete files.get('data/modules.json')[0].lessonMinutes;
  delete files.get('data/global-search-index.json')[0].estimatedMinutes;
  delete files.get('data/site-health-report.json').totals;
  assert.equal((await run('live')).code, 0);
});

test('Equal totals cannot hide swapped per-module counts or a stale search link', async (t) => {
  const { files, run, root, write } = await fixture(t);
  const health = files.get('data/site-health-report.json');
  health.modules[0].counts.questions = 0;
  health.modules[1].counts.questions = 2;
  files.get('data/global-search-index.json')[1].slug = 'stale';
  files.get('data/global-search-index.json')[0].estimatedMinutes = 3;
  const r = await run('live');
  assert.equal(r.code, 1);
  assert.equal(r.totals.totalQuestions.actual, 2);
  assert.deepEqual(r.differences.map((row) => row.key).sort(), [
    'global-index/module-a/question', 'module-a.health.questions', 'module-a/lesson/l.estimatedMinutes', 'module-b.health.questions',
  ]);
  await write('data/site-health-report.json', health, 'dist');
  await assert.rejects(exec(process.execPath, [guard, join(root, portal, 'dist/data')]), /索引与健康报告/);
});

test('Missing or timed-out files keep affected totals unknown while complete metrics are still compared', async (t) => {
  const { files, run, withhold } = await fixture(t);
  files.delete('module-a/data/questions.json');
  withhold('module-b/data/lessons.json');
  files.get('data/platform-stats.json').totalCases = 9;
  const r = await run('live', '--timeout-ms', '300');
  assert.equal(r.code, 2);
  assert.equal(r.errors.length, 2);
  assert.equal(r.totals.totalQuestions.actual, null);
  assert.equal(r.totals.totalLessons.measuredModules, 1);
  assert.equal(r.totals.totalCases.actual, 0);
  assert.deepEqual(r.differences.map((d) => d.key), ['platform.totalCases']);
});

test('The candidate and exact release checks detect stale builds even when counts and IDs are unchanged', async (t) => {
  const { files, run, write } = await fixture(t);
  const key = 'module-b/data/questions.json';
  files.get(key)[0].stem = 'revised text';
  assert.equal((await run('live')).code, 0);
  assert.equal((await run('staged', '--expect-dist')).code, 1);
  assert.deepEqual((await run('live', '--expect-dist')).differences.map((d) => d.key), [key]);
  await write(key, files.get(key), 'public');
  assert.deepEqual((await run('local')).differences.map((d) => d.key), [key]);
  await write(key, files.get(key), 'dist');
  assert.equal((await run('live', '--expect-dist')).code, 0);
});

test('Malformed or duplicated catalog entries cannot become a successful empty audit', async (t) => {
  const { files, run } = await fixture(t);
  files.get('data/modules.json').push(files.get('data/modules.json')[0]);
  assert.equal((await run('live')).code, 2);
  files.set('data/modules.json', []);
  assert.equal((await run('live')).code, 2);
  files.set('data/modules.json', [{ id: 'test', slug: '../outside' }]);
  assert.equal((await run('live')).code, 2);
});
