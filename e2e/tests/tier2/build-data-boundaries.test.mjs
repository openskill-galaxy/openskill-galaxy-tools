import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { createIsolatedWorkspace } from '../../lib/workspace.mjs';

const TARGET_MODULE = 'module-ai-learning-assistant';

function validateUpdatesRoutes(portalDir) {
  const { modules, updates } = discoverPortalFixtures(portalDir);
  const validSlugs = new Set(modules.map((m) => m.slug));
  for (const u of updates) {
    if (!u.url) continue;
    const modMatch = u.url.match(/\/modules\/([^/?#]+)/);
    if (modMatch) {
      assert.ok(validSlugs.has(modMatch[1]), `updates.json dead module URL: ${u.url}`);
    }
  }
}

function validatePlatformStatsParity(portalDir, moduleDir) {
  const { platformStats } = discoverPortalFixtures(portalDir);
  const courses = JSON.parse(readFileSync(join(moduleDir, 'public/data/courses.json'), 'utf8'));
  assert.equal(platformStats.totalCourses, courses.length, 'platform-stats.totalCourses mismatch');
}

function validateCapabilityAndCareerSlugs(portalDir) {
  const { modules, capabilityMap, careerPaths } = discoverPortalFixtures(portalDir);
  const validSlugs = new Set(modules.map((m) => m.slug));
  for (const cap of capabilityMap || []) {
    const slugs = [
      ...(cap.beginnerModules || []),
      ...(cap.intermediateModules || []),
      ...(cap.advancedModules || []),
    ];
    for (const slug of slugs) {
      assert.ok(validSlugs.has(slug), `capability-map invalid slug: ${slug}`);
    }
  }
  for (const cp of careerPaths || []) {
    const slugs = [
      ...(cp.requiredModules || []),
      ...(cp.recommendedModules || []),
      ...(cp.projectModules || []),
      ...(cp.interviewModules || []),
    ];
    for (const slug of slugs) {
      assert.ok(validSlugs.has(slug), `career-paths invalid slug: ${slug}`);
    }
  }
}

function validateModuleBuildConfigParity(slug, modDir) {
  const expectedBase = `/${slug}/`;
  const viteRaw = readFileSync(join(modDir, 'vite.config.ts'), 'utf8');
  const baseMatch = viteRaw.match(/base\s*:\s*["']([^"']+)["']/);
  assert.equal(baseMatch?.[1], expectedBase, `${slug}: vite.config.ts base mismatch`);

  const manifest = JSON.parse(readFileSync(join(modDir, 'public/manifest.json'), 'utf8'));
  assert.equal(manifest.start_url, expectedBase, `${slug}: manifest start_url mismatch`);
  assert.equal(manifest.scope, expectedBase, `${slug}: manifest scope mismatch`);
}

test('build-data-boundaries: startPreviewServer rejects missing dist/ and missing dist/index.html loudly', async () => {
  const tmpDir = join('/tmp', `osg-e2e-build-b1-${randomUUID()}`);
  try {
    await assert.rejects(
      () => startPreviewServer({ portalDistDir: join(tmpDir, 'no-dist'), requirePortal: true }),
      /Missing dist\/ directory/
    );

    const emptyDist = join(tmpDir, 'empty-dist');
    mkdirSync(emptyDist, { recursive: true });
    await assert.rejects(
      () => startPreviewServer({ portalDistDir: emptyDist, requirePortal: true }),
      /Missing index\.html in dist\//
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('build-data-boundaries: dead module URL in isolated updates.json fails route consistency check', () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const updatesPath = join(iso.portalDir, 'public/data/updates.json');
    const updates = JSON.parse(readFileSync(updatesPath, 'utf8'));
    updates.push({
      id: 'upd-dead',
      date: '2026-11-22',
      title: 'Dead module ref',
      summary: 'Invalid route',
      url: '/modules/module-nonexistent-xyz',
    });
    writeFileSync(updatesPath, JSON.stringify(updates, null, 2) + '\n', 'utf8');

    assert.throws(() => validateUpdatesRoutes(iso.portalDir), /updates\.json dead module URL/);
  } finally {
    iso.cleanup();
  }
});

test('build-data-boundaries: mismatched platform-stats totalCourses fails parity check', () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const statsPath = join(iso.portalDir, 'public/data/platform-stats.json');
    const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
    stats.totalCourses = 999999;
    writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');

    assert.throws(
      () => validatePlatformStatsParity(iso.portalDir, iso.moduleDirs[TARGET_MODULE]),
      /platform-stats\.totalCourses mismatch/
    );
  } finally {
    iso.cleanup();
  }
});

test('build-data-boundaries: invalid slug in capability-map or career-paths fails slug validation', () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const capPath = join(iso.portalDir, 'public/data/capability-map.json');
    const capMap = JSON.parse(readFileSync(capPath, 'utf8'));
    capMap[0].beginnerModules = ['module-nonexistent-cap-slug'];
    writeFileSync(capPath, JSON.stringify(capMap, null, 2) + '\n', 'utf8');

    assert.throws(
      () => validateCapabilityAndCareerSlugs(iso.portalDir),
      /capability-map invalid slug: module-nonexistent-cap-slug/
    );

    // Fix capability-map and inject invalid slug in career-paths
    capMap[0].beginnerModules = [TARGET_MODULE];
    writeFileSync(capPath, JSON.stringify(capMap, null, 2) + '\n', 'utf8');

    const cpPath = join(iso.portalDir, 'public/data/career-paths.json');
    const careerPaths = JSON.parse(readFileSync(cpPath, 'utf8'));
    careerPaths[0].requiredModules = ['module-nonexistent-career-slug'];
    writeFileSync(cpPath, JSON.stringify(careerPaths, null, 2) + '\n', 'utf8');

    assert.throws(
      () => validateCapabilityAndCareerSlugs(iso.portalDir),
      /career-paths invalid slug: module-nonexistent-career-slug/
    );
  } finally {
    iso.cleanup();
  }
});

test('build-data-boundaries: mismatched vite.config.ts base or manifest scope is caught by artifact parity check', () => {
  const iso = createIsolatedWorkspace([TARGET_MODULE]);
  try {
    const modDir = iso.moduleDirs[TARGET_MODULE];
    // Baseline passes
    validateModuleBuildConfigParity(TARGET_MODULE, modDir);

    // Wrong vite base
    writeFileSync(join(modDir, 'vite.config.ts'), 'export default { base: "/wrong-base/" };\n', 'utf8');
    assert.throws(
      () => validateModuleBuildConfigParity(TARGET_MODULE, modDir),
      /vite\.config\.ts base mismatch/
    );

    // Restore vite base, corrupt manifest scope
    writeFileSync(join(modDir, 'vite.config.ts'), `export default { base: "/${TARGET_MODULE}/" };\n`, 'utf8');
    const manifestPath = join(modDir, 'public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.scope = '/bad-scope/';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    assert.throws(
      () => validateModuleBuildConfigParity(TARGET_MODULE, modDir),
      /manifest scope mismatch/
    );
  } finally {
    iso.cleanup();
  }
});
