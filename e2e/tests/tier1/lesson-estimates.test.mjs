import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { createIsolatedWorkspace, WORKSPACE_ROOT } from '../../lib/workspace.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('Every portal module publishes exactly the total of its listed lesson estimates', () => {
  for (const module of discoverPortalFixtures().modules) {
    const lessons = read(join(WORKSPACE_ROOT, module.slug, 'public/data/lessons.json'))
      .filter((lesson) => lesson.editorialStatus !== 'draft');
    const complete = lessons.length > 0 && lessons.every((lesson) =>
      Number.isFinite(lesson.estimatedMinutes) && lesson.estimatedMinutes > 0
    );
    const expected = complete ? lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0) : undefined;
    assert.equal(module.lessonMinutes, expected, module.slug);
  }
});

test('Fixing estimates drops stale partial totals and excludes draft lessons', () => {
  const slug = 'module-python-basic';
  const iso = createIsolatedWorkspace([slug]);
  try {
    const catalog = join(iso.portalDir, 'public/data/modules.json');
    const source = join(iso.moduleDirs[slug], 'public/data/lessons.json');
    const lessons = read(source);
    const run = () => execFileSync(process.execPath, [join(iso.scriptsDir, 'src/fix-stats.mjs')], {
      env: { ...process.env, OSG_ROOT: iso.root },
    });
    const entry = () => read(catalog).find((item) => item.slug === slug);
    const legacyHours = entry().estimatedHours;
    delete lessons[0].estimatedMinutes;
    writeFileSync(source, JSON.stringify(lessons));
    run();
    assert.equal(entry().lessonMinutes, undefined);
    assert.equal(entry().estimatedHours, legacyHours);

    lessons[0].editorialStatus = 'draft';
    writeFileSync(source, JSON.stringify(lessons));
    run();
    assert.equal(entry().lessonMinutes, lessons.slice(1).reduce((n, item) => n + item.estimatedMinutes, 0));
  } finally {
    iso.cleanup();
  }
});
