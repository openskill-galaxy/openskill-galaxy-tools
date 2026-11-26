#!/usr/bin/env node
import fs from 'fs/promises';
import { isPublished } from './utils/editorial.mjs';
import { resolve, join } from 'path';
import { getPortalDir, getModuleDirs } from './utils/workspace.mjs';
import { hasFlag, getArgValue } from './utils/cli-utils.mjs';

async function readActivityCatalog(moduleDir, lessons) {
  const path = join(moduleDir, 'activities/catalog.json');
  let source;
  try {
    source = await fs.readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
  const catalog = JSON.parse(source);
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) throw new Error(path + ': expected an object');
  const titles = new Map(Object.entries(catalog));
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  for (const [id, title] of titles) {
    if (!lessonIds.has(id) || typeof title !== 'string' || !title.trim()) throw new Error(path + ': invalid activity for ' + id);
  }
  return titles;
}

async function main() {
  const argv = process.argv.slice(2);
  const pretty = hasFlag(argv, '--pretty');
  const dryRun = hasFlag(argv, '--dry-run');
  const outputPath = getArgValue(argv, '--output');
  const portalIndexDest = outputPath
    ? resolve(outputPath)
    : join(getPortalDir(), 'public/data/global-search-index.json');

  const moduleDirs = getModuleDirs();
  console.log(
    `Scanning content for ${moduleDirs.length} modules to build global search index${dryRun ? ' [DRY RUN]' : ''}...\n`
  );

  const globalIndex = [];

  for (const m of moduleDirs) {
    const dataDir = join(m.path, 'public/data');
    async function read(name) {
      const path = join(dataDir, name + '.json');
      try {
        return JSON.parse(await fs.readFile(path, 'utf8'));
      } catch (error) {
        throw new Error(path + ': ' + error.message);
      }
    }

    const [meta, lessons, questions] = await Promise.all([read('module'), read('lessons'), read('questions')]);
    const activityTitles = await readActivityCatalog(m.path, lessons);
    const moduleInfo = { moduleTitle: meta.title || m.name, moduleSlug: meta.slug || m.name };
    for (const lesson of lessons.filter(isPublished)) {
      globalIndex.push({
        id: lesson.id, slug: lesson.slug, title: lesson.title, summary: lesson.summary,
        type: 'lesson', estimatedMinutes: lesson.estimatedMinutes, activityTitle: activityTitles.get(lesson.id), ...moduleInfo,
      });
    }
    for (const question of questions.filter(isPublished)) {
      globalIndex.push({
        id: question.id, slug: question.slug,
        title: question.stem.length > 80 ? question.stem.slice(0, 80) + '...' : question.stem,
        summary: (question.explanation || '').slice(0, 120), type: 'question', ...moduleInfo,
      });
    }
  }

  const serialized = pretty ? JSON.stringify(globalIndex, null, 2) + '\n' : JSON.stringify(globalIndex);
  const bytes = Buffer.byteLength(serialized, 'utf-8');

  if (!dryRun) {
    await fs.mkdir(resolve(portalIndexDest, '..'), { recursive: true });
    await fs.writeFile(portalIndexDest, serialized, 'utf-8');
  }

  console.log(
    `\n✅ Global search index ${dryRun ? 'previewed' : 'updated'} with ${globalIndex.length} items (${(bytes / 1024).toFixed(1)} KB, ${pretty ? 'pretty' : 'minified'})!`
  );
  console.log(`${dryRun ? 'Target' : 'Saved to'}: ${portalIndexDest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
