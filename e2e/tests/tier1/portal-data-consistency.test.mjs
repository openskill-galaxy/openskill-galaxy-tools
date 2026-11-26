import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_ROOT, getModuleDirs } from '../../lib/workspace.mjs';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';

test('portal-data: modules.json has 60 unique modules with valid categories, URLs, and workspace dirs', () => {
  const { modules, categories } = discoverPortalFixtures();
  assert.equal(modules.length, 60);

  const ids = new Set();
  const slugs = new Set();
  const catIds = new Set(categories.map((c) => c.id));

  for (const m of modules) {
    assert.ok(m.id && !ids.has(m.id), `Duplicate or empty module id: ${m.id}`);
    ids.add(m.id);

    assert.ok(m.slug && !slugs.has(m.slug), `Duplicate or empty module slug: ${m.slug}`);
    slugs.add(m.slug);

    assert.ok(catIds.has(m.category), `${m.slug}: invalid category ${m.category}`);
    assert.equal(m.url, `https://openskill-galaxy.github.io/${m.slug}/`, `${m.slug}: url mismatch`);
    assert.equal(m.repoUrl, `https://github.com/openskill-galaxy/${m.slug}`, `${m.slug}: repoUrl mismatch`);
    assert.ok(existsSync(join(WORKSPACE_ROOT, m.slug)), `${m.slug}: missing repo directory`);
  }
});

test('portal-data: categories.json has 15 unique categories and zero empty categories', () => {
  const { modules, categories } = discoverPortalFixtures();
  assert.equal(categories.length, 15);
  const counts = new Map(categories.map((c) => [c.id, 0]));
  assert.equal(counts.size, 15);

  for (const m of modules) {
    counts.set(m.category, (counts.get(m.category) || 0) + 1);
  }
  const emptyCats = [...counts.entries()].filter(([, cnt]) => cnt === 0);
  assert.deepEqual(emptyCats, [], `Empty categories found: ${JSON.stringify(emptyCats)}`);
});

test('portal-data: learning-paths.json modules and stages resolve to valid modules', () => {
  const { modules, learningPaths } = discoverPortalFixtures();
  assert.ok(learningPaths.length > 0);
  const validIds = new Set(modules.map((m) => m.id));
  const validSlugs = new Set(modules.map((m) => m.slug));

  for (const lp of learningPaths) {
    assert.ok(lp.slug && lp.title);
    for (const ref of lp.modules || []) {
      assert.ok(validIds.has(ref) || validSlugs.has(ref), `${lp.slug}: invalid module ref ${ref}`);
    }
    assert.ok(Array.isArray(lp.stages) && lp.stages.length > 0, `${lp.slug}: missing stages`);
    for (const st of lp.stages) {
      for (const ref of st.modules || []) {
        assert.ok(validIds.has(ref) || validSlugs.has(ref), `${lp.slug} stage ${st.title}: invalid ref ${ref}`);
      }
    }
  }
});

test('portal-data: updates.json contains valid routes with zero dead module slugs', () => {
  const { modules, updates } = discoverPortalFixtures();
  assert.ok(Array.isArray(updates) && updates.length > 0);
  const validSlugs = new Set(modules.map((m) => m.slug));

  for (const u of updates) {
    if (!u.url) continue;
    const modMatch = u.url.match(/\/modules\/([^/?#]+)/);
    if (modMatch) {
      assert.ok(validSlugs.has(modMatch[1]), `updates.json dead module URL: ${u.url}`);
    } else {
      assert.ok(
        u.url === '/' ||
          u.url === '/modules' ||
          u.url === '/paths' ||
          u.url === '/about' ||
          u.url.startsWith('https://openskill-galaxy.github.io/'),
        `updates.json unexpected URL: ${u.url}`
      );
    }
  }
});

test('portal-data: portal-search-index.json uses /modules/<slug> (never /module/)', () => {
  const { modules, portalSearchIndex } = discoverPortalFixtures();
  assert.ok(Array.isArray(portalSearchIndex) && portalSearchIndex.length > 0);
  const validSlugs = new Set(modules.map((m) => m.slug));

  for (const entry of portalSearchIndex) {
    assert.ok(!entry.url?.startsWith('/module/'), `Broken singular /module/ link: ${entry.url}`);
    if (entry.type === 'module') {
      const m = entry.url?.match(/^\/modules\/([^/?#]+)$/);
      assert.ok(m && validSlugs.has(m[1]), `Invalid module search index url: ${entry.url}`);
    }
  }
});

test('portal-data: global-search-index.json items match valid modules and ID prefixes', () => {
  const { modules, globalSearchIndex } = discoverPortalFixtures();
  assert.ok(Array.isArray(globalSearchIndex) && globalSearchIndex.length > 0);
  const modBySlug = new Map(modules.map((m) => [m.slug, m]));

  for (const item of globalSearchIndex) {
    assert.ok(item.type === 'lesson' || item.type === 'question', `Unexpected type: ${item.type}`);
    const mod = modBySlug.get(item.moduleSlug);
    assert.ok(mod, `Unknown moduleSlug in global-search-index: ${item.moduleSlug}`);
    assert.ok(item.slug, `Missing slug on global search item ${item.id}`);
    const expectedPrefix = `${mod.id}-${item.type === 'lesson' ? 'l-' : 'q-'}`;
    assert.ok(
      typeof item.id === 'string' && item.id.startsWith(expectedPrefix),
      `global-search-index item id "${item.id}" does not start with "${expectedPrefix}"`
    );
  }
});

test('portal-data: platform-stats.json equals site-health-report.json equals live 60-module JSON sums', () => {
  const { platformStats, siteHealthReport } = discoverPortalFixtures();
  const modDirs = getModuleDirs();
  assert.equal(modDirs.length, 60);

  const liveTotals = {
    moduleCount: modDirs.length,
    totalCourses: 0,
    totalLessons: 0,
    totalKnowledgePoints: 0,
    totalQuestions: 0,
    totalExams: 0,
    totalCases: 0,
    totalRoutes: 0,
    totalTags: 0,
    totalGlossary: 0,
    totalFaqs: 0,
    totalSearchIndexEntries: 0,
  };

  for (const m of modDirs) {
    const dd = join(m.path, 'public', 'data');
    const readLen = (f) => JSON.parse(readFileSync(join(dd, f), 'utf8'))
      .filter((entry) => entry.editorialStatus !== 'draft').length;
    liveTotals.totalCourses += readLen('courses.json');
    liveTotals.totalLessons += readLen('lessons.json');
    liveTotals.totalKnowledgePoints += readLen('knowledge-points.json');
    liveTotals.totalQuestions += readLen('questions.json');
    liveTotals.totalExams += readLen('exams.json');
    liveTotals.totalCases += readLen('cases.json');
    liveTotals.totalRoutes += readLen('routes.json');
    liveTotals.totalTags += readLen('tags.json');
    liveTotals.totalGlossary += readLen('glossary.json');
    liveTotals.totalFaqs += readLen('faqs.json');
    liveTotals.totalSearchIndexEntries += readLen('search-index.json');
  }

  for (const [key, expectedVal] of Object.entries(liveTotals)) {
    assert.equal(platformStats[key], expectedVal, `platform-stats.${key} mismatch`);
    assert.equal(siteHealthReport.totals[key], expectedVal, `site-health-report.totals.${key} mismatch`);
  }

  assert.equal(siteHealthReport.moduleCount, 60);
  assert.ok(
    siteHealthReport.summary && typeof siteHealthReport.summary === 'object',
    'site-health-report.json missing summary object (regenerate via build-health-report.mjs)'
  );
  assert.equal(siteHealthReport.summary.healthyModules, 60);
  assert.equal(siteHealthReport.summary.totalIssues, 0);
  assert.equal(siteHealthReport.modules.length, 60);
  assert.ok(siteHealthReport.modules.every((m) => m.contentHealthy && m.inPortal && m.searchIndexExists));
});

test('portal-data: capability-map, career-paths, module-dependencies, and v1-roadmap have valid module slugs', () => {
  const { modules, capabilityMap, careerPaths, moduleDependencies, v1Roadmap } = discoverPortalFixtures();
  const validSlugs = new Set(modules.map((m) => m.slug));

  assert.ok(Array.isArray(capabilityMap) && capabilityMap.length > 0);
  for (const cap of capabilityMap) {
    const slugs = [
      ...(cap.beginnerModules || []),
      ...(cap.intermediateModules || []),
      ...(cap.advancedModules || []),
    ];
    assert.ok(slugs.length > 0, `capability-map entry ${cap.id || cap.title} has no module slugs`);
    for (const slug of slugs) {
      assert.ok(validSlugs.has(slug), `capability-map invalid slug: ${slug}`);
    }
  }

  assert.ok(Array.isArray(careerPaths) && careerPaths.length > 0);
  for (const cp of careerPaths) {
    const slugs = [
      ...(cp.requiredModules || []),
      ...(cp.recommendedModules || []),
      ...(cp.projectModules || []),
      ...(cp.interviewModules || []),
    ];
    assert.ok(slugs.length > 0, `career-paths entry ${cp.id || cp.title} has no module slugs`);
    for (const slug of slugs) {
      assert.ok(validSlugs.has(slug), `career-paths invalid slug: ${slug}`);
    }
  }

  assert.ok(Array.isArray(moduleDependencies) && moduleDependencies.length > 0);
  for (const dep of moduleDependencies) {
    if (dep.module) assert.ok(validSlugs.has(dep.module), `module-dependencies invalid module: ${dep.module}`);
    if (dep.slug) assert.ok(validSlugs.has(dep.slug), `module-dependencies invalid slug: ${dep.slug}`);
    for (const req of dep.prerequisites || dep.requires || dep.dependsOn || []) {
      assert.ok(validSlugs.has(req), `module-dependencies invalid prereq: ${req}`);
    }
  }

  assert.ok(v1Roadmap && v1Roadmap.moduleCount === 60);
});

test('Every published course opens a nonempty chapter practice bank', () => {
  for (const { slug } of discoverPortalFixtures().modules) {
    const read = (name) => JSON.parse(readFileSync(join(WORKSPACE_ROOT, slug, 'public/data', name + '.json'), 'utf8'))
      .filter((item) => item.editorialStatus !== 'draft');
    const chapters = new Set(read('questions').map((q) => q.chapter));
    for (const course of read('courses')) {
      assert.ok(chapters.has(course.id) || course.lessons.some((id) => chapters.has(id)), slug + ' / ' + course.title);
    }
  }
});
