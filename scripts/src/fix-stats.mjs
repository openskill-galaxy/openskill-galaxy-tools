#!/usr/bin/env node
// 1) Recompute module.json "stats" from actual data file counts (all modules incl. template).
// 2) Update portal reading-time estimates and strip fabricated volume claims.
import { isPublished } from './utils/editorial.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getModuleDirs, getPortalDir } from './utils/workspace.mjs';
import { hasFlag } from './utils/cli-utils.mjs';

const FILES = ['courses', 'lessons', 'knowledge-points', 'questions', 'cases', 'exams', 'routes', 'glossary', 'faqs', 'tags'];
const KEY = { 'knowledge-points': 'knowledgePoints' };

function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');

  const targets = getModuleDirs(undefined, { includeTemplate: true });
  let statsUpdated = 0;
  const lessonMinutesBySlug = new Map();

  for (const { path: modDir } of targets) {
    const dataDir = join(modDir, 'public', 'data');
    const mjPath = join(dataDir, 'module.json');
    if (!existsSync(mjPath)) continue;
    const mj = JSON.parse(readFileSync(mjPath, 'utf8'));
    const stats = {};
    for (const f of FILES) {
      const p = join(dataDir, `${f}.json`);
      const records = JSON.parse(readFileSync(p, 'utf8'));
      if (!Array.isArray(records)) throw new Error(`Expected an array in ${p}`);
      const published = records.filter(isPublished);
      stats[KEY[f] || f] = published.length;
      if (f === 'lessons') {
        const complete = published.length > 0 && published.every((lesson) =>
          Number.isFinite(lesson.estimatedMinutes) && lesson.estimatedMinutes > 0
        );
        lessonMinutesBySlug.set(mj.slug, complete
          ? published.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0)
          : undefined);
      }
    }
    const prev = JSON.stringify(mj.stats || {});
    const next = JSON.stringify(stats);
    if (prev !== next) {
      statsUpdated++;
      mj.stats = stats;
      if (!dryRun) {
        writeFileSync(mjPath, JSON.stringify(mj, null, 2) + '\n', 'utf8');
      }
    }
  }
  console.log(`module.json stats checked for ${targets.length} modules (${statsUpdated} ${dryRun ? 'would update' : 'updated'})`);

  const portalModules = join(getPortalDir(), 'public', 'data', 'modules.json');
  const mods = JSON.parse(readFileSync(portalModules, 'utf8'));
  let stripped = 0;
  let durationsUpdated = 0;
  for (const m of mods) {
    if (lessonMinutesBySlug.has(m.slug)) {
      const minutes = lessonMinutesBySlug.get(m.slug);
      if (m.lessonMinutes !== minutes) {
        if (minutes === undefined) delete m.lessonMinutes;
        else m.lessonMinutes = minutes;
        durationsUpdated++;
      }
    }
    if (typeof m.summary !== 'string') continue;
    const next = m.summary.replace(/\s*\d+\s*(?:门课程|课时)[^。]*。/gu, '').trim();
    if (next !== m.summary) {
      m.summary = next;
      stripped++;
    }
  }
  if ((stripped > 0 || durationsUpdated > 0) && !dryRun) {
    writeFileSync(portalModules, JSON.stringify(mods, null, 2) + '\n', 'utf8');
  }
  console.log(`portal lesson estimates: ${durationsUpdated} ${dryRun ? 'would update' : 'updated'}`);
  console.log(`portal summaries stripped: ${stripped}${dryRun ? ' [DRY RUN]' : ''}`);
}

main();
