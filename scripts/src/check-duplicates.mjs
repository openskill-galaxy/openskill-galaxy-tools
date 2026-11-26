#!/usr/bin/env node
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { readModuleData } from './utils/read-json.mjs';
import { hasFlag, resolveTargetModules } from './utils/cli-utils.mjs';

const FILES_TO_CHECK = [
  'courses',
  'lessons',
  'knowledge-points',
  'questions',
  'exams',
  'cases',
  'routes',
  'glossary',
  'faqs',
  'tags',
];

const ROUTABLE_SLUG_FILES = new Set([
  'courses',
  'lessons',
  'knowledge-points',
  'questions',
  'exams',
  'cases',
  'routes',
]);

const ALL_SLUG_FILES = new Set([...ROUTABLE_SLUG_FILES, 'tags']);

export async function checkModuleDuplicates(modulePath, { strictTags = false } = {}) {
  const absPath = resolve(modulePath);
  const name = basename(absPath);
  const fileResults = {};
  let duplicateIdCount = 0;
  let duplicateSlugCount = 0;
  let emptySlugCount = 0;
  let tagSlugWarningCount = 0;

  for (const f of FILES_TO_CHECK) {
    let arr;
    try {
      arr = await readModuleData(absPath, f);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;

    const seenIds = new Map();
    const duplicateIds = [];
    const seenSlugs = new Map();
    const duplicateSlugs = [];
    const emptySlugs = [];
    const checkSlug = ALL_SLUG_FILES.has(f);

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const id = item?.id;
      if (id) {
        if (seenIds.has(id)) {
          duplicateIds.push({ id, firstIndex: seenIds.get(id), secondIndex: i });
        } else {
          seenIds.set(id, i);
        }
      }

      if (checkSlug) {
        const slug = item?.slug;
        if (typeof slug !== 'string' || slug.trim() === '') {
          emptySlugs.push({ id: id || `index:${i}`, index: i });
        } else if (seenSlugs.has(slug)) {
          duplicateSlugs.push({ slug, firstIndex: seenSlugs.get(slug), secondIndex: i, id: id || `index:${i}` });
        } else {
          seenSlugs.set(slug, i);
        }
      }
    }

    duplicateIdCount += duplicateIds.length;
    emptySlugCount += emptySlugs.length;

    const isTagFile = f === 'tags';
    if (isTagFile) {
      tagSlugWarningCount += duplicateSlugs.length;
      if (strictTags) {
        duplicateSlugCount += duplicateSlugs.length;
      }
    } else {
      duplicateSlugCount += duplicateSlugs.length;
    }

    fileResults[f] = {
      count: arr.length,
      duplicateIds,
      duplicateSlugs,
      emptySlugs,
      isTagWarningOnly: isTagFile && !strictTags,
    };
  }

  const hasErrors = duplicateIdCount > 0 || duplicateSlugCount > 0 || emptySlugCount > 0;

  return {
    module: name,
    path: absPath,
    duplicateIdCount,
    duplicateSlugCount,
    emptySlugCount,
    tagSlugWarningCount,
    hasErrors,
    files: fileResults,
  };
}

function printModuleResult(res) {
  console.log(`\n=== Duplicate ID & Slug Check: ${res.path} ===\n`);

  for (const f of FILES_TO_CHECK) {
    const info = res.files[f];
    if (!info) continue;

    const hasFileErr =
      info.duplicateIds.length > 0 ||
      info.emptySlugs.length > 0 ||
      (!info.isTagWarningOnly && info.duplicateSlugs.length > 0);

    if (!hasFileErr && info.duplicateSlugs.length === 0) {
      console.log(`✅ ${f}.json: no duplicates (${info.count} items)`);
      continue;
    }

    if (info.duplicateIds.length > 0) {
      console.log(`❌ ${f}.json: ${info.duplicateIds.length} duplicate ID(s)`);
      for (const d of info.duplicateIds.slice(0, 20)) {
        console.log(`   id="${d.id}" (indices ${d.firstIndex}, ${d.secondIndex})`);
      }
    }
    if (info.emptySlugs.length > 0) {
      console.log(`❌ ${f}.json: ${info.emptySlugs.length} empty/missing slug(s)`);
      for (const e of info.emptySlugs.slice(0, 20)) {
        console.log(`   id="${e.id}" at index ${e.index}`);
      }
    }
    if (info.duplicateSlugs.length > 0) {
      const icon = info.isTagWarningOnly ? '⚠️ ' : '❌';
      const label = info.isTagWarningOnly ? 'duplicate tag slug warning(s)' : 'duplicate routable slug(s)';
      console.log(`${icon} ${f}.json: ${info.duplicateSlugs.length} ${label}`);
      for (const d of info.duplicateSlugs.slice(0, 20)) {
        console.log(`   slug="${d.slug}" (indices ${d.firstIndex}, ${d.secondIndex}, id="${d.id}")`);
      }
    }
  }

  console.log(
    `\nSummary (${res.module}): duplicateIds=${res.duplicateIdCount}, duplicateSlugs=${res.duplicateSlugCount}, emptySlugs=${res.emptySlugCount}, tagSlugWarnings=${res.tagSlugWarningCount}`
  );
  if (!res.hasErrors) {
    console.log('✅ No blocking duplicate IDs or routable slugs found');
  } else {
    console.log('❌ Blocking duplicates/empty slugs found — please fix before deployment');
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const strictTags = hasFlag(argv, '--strict-tags');
  const jsonOut = hasFlag(argv, '--json');
  const targets = resolveTargetModules(
    argv,
    'Usage: node src/check-duplicates.mjs <module-path> | --all [--include-template] [--strict-tags] [--json]'
  );
  if (!targets) process.exit(1);

  const results = [];
  let failedModules = 0;

  for (const t of targets) {
    const res = await checkModuleDuplicates(t.path, { strictTags });
    results.push(res);
    if (res.hasErrors) failedModules++;
    if (!jsonOut && targets.length === 1) {
      printModuleResult(res);
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify(targets.length === 1 ? results[0] : results, null, 2));
  } else if (targets.length > 1) {
    console.log(`\n=== Duplicate Check Summary (${results.length} modules) ===\n`);
    for (const r of results) {
      if (r.hasErrors) {
        console.log(
          `❌ ${r.module}: dupIds=${r.duplicateIdCount}, dupSlugs=${r.duplicateSlugCount}, emptySlugs=${r.emptySlugCount}, tagWarnings=${r.tagSlugWarningCount}`
        );
      } else {
        const warnNote = r.tagSlugWarningCount > 0 ? ` (tagWarnings=${r.tagSlugWarningCount})` : '';
        console.log(`✅ ${r.module}: ok${warnNote}`);
      }
    }
    console.log(`\nFailed modules: ${failedModules}/${results.length}`);
  }

  process.exit(failedModules > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
