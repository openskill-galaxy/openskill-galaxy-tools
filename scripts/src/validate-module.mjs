#!/usr/bin/env node
import { isPublished } from './utils/editorial.mjs';
import { isDeepStrictEqual } from 'node:util';
import { buildModuleSearchIndex } from './utils/search-index.mjs';
import { existsSync, readFileSync } from 'fs';
import { resolve, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { Schemas, ModuleMetaSchema } from './schemas/module-schema.mjs';
import { readModuleData } from './utils/read-json.mjs';
import { checkModuleDuplicates } from './check-duplicates.mjs';
import { checkModuleReferences } from './check-references.mjs';
import { auditModuleQuestions } from './audit-questions.mjs';
import { hasFlag, resolveTargetModules } from './utils/cli-utils.mjs';

const DATA_FILES = [
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

const STATS_KEY_MAP = {
  'knowledge-points': 'knowledgePoints',
};

export async function validateModule(
  modulePath,
  { allowMissingSearchIndex = false, strictTags = false } = {}
) {
  const absPath = resolve(modulePath);
  const slugDir = basename(absPath);
  const issues = [];
  const warnings = [];
  const counts = {};

  // 1. Load & validate module.json
  let moduleMeta = null;
  let metaErrors = 0;
  try {
    moduleMeta = await readModuleData(absPath, 'module');
    const metaParse = ModuleMetaSchema.safeParse(moduleMeta);
    if (!metaParse.success) {
      metaErrors += metaParse.error.issues.length;
      for (const iss of metaParse.error.issues) {
        issues.push(`module.json.${iss.path.join('.') || '<root>'}: ${iss.message}`);
      }
    }
    if (moduleMeta?.slug && moduleMeta.slug !== slugDir) {
      metaErrors++;
      issues.push(`module.json.slug '${moduleMeta.slug}' does not match directory '${slugDir}'`);
    }
  } catch (e) {
    metaErrors++;
    issues.push(`Cannot load module.json: ${e.message}`);
  }

  const expectedSlug = moduleMeta?.slug || slugDir;

  // 2. Load 10 array data files & validate ALL items with Zod
  const data = {};
  const schemaErrorsByFile = {};
  let totalSchemaErrors = metaErrors;

  for (const f of DATA_FILES) {
    try {
      const parsed = await readModuleData(absPath, f);
      if (!Array.isArray(parsed)) {
        totalSchemaErrors++;
        schemaErrorsByFile[f] = { count: 1, samples: [`${f}.json must be a JSON array`] };
        issues.push(`${f}.json must be a JSON array`);
        data[f] = [];
        counts[f] = 0;
        continue;
      }
      data[f] = parsed;
      counts[f] = parsed.filter(isPublished).length;
    } catch (e) {
      totalSchemaErrors++;
      schemaErrorsByFile[f] = { count: 1, samples: [`Cannot load ${f}.json: ${e.message}`] };
      issues.push(`Cannot load ${f}.json: ${e.message}`);
      data[f] = [];
      counts[f] = 0;
      continue;
    }

    const schema = Schemas[f];
    if (!schema) continue;
    const fileSamples = [];
    let fileErrCount = 0;
    for (let i = 0; i < data[f].length; i++) {
      const item = data[f][i];
      const result = schema.safeParse(item);
      if (!result.success) {
        fileErrCount++;
        if (fileSamples.length < 5) {
          const detail = result.error.issues
            .map((iss) => `${iss.path.join('.') || '<root>'}: ${iss.message}`)
            .join('; ');
          fileSamples.push(`${f}[${item?.id || `index:${i}`}]: ${detail}`);
        }
      }
    }
    if (fileErrCount > 0) {
      totalSchemaErrors += fileErrCount;
      schemaErrorsByFile[f] = { count: fileErrCount, samples: fileSamples };
      issues.push(`${f}.json: ${fileErrCount} schema error(s) (${fileSamples[0]})`);
    }
  }

  // 3. Verify module.json.stats parity
  let statsMismatchCount = 0;
  if (moduleMeta?.stats && typeof moduleMeta.stats === 'object') {
    for (const f of DATA_FILES) {
      const statsKey = STATS_KEY_MAP[f] || f;
      const expectedCount = counts[f] ?? 0;
      const actualStat = moduleMeta.stats[statsKey];
      if (actualStat !== expectedCount) {
        statsMismatchCount++;
        issues.push(`module.json.stats.${statsKey}=${actualStat} !== ${f}.json length (${expectedCount})`);
      }
    }
  }

  // 4. Config checks: vite.config.ts base, public/manifest.json, public/data/search-index.json
  let configErrorCount = 0;
  const vitePath = join(absPath, 'vite.config.ts');
  if (!existsSync(vitePath)) {
    configErrorCount++;
    issues.push('Missing vite.config.ts');
  } else {
    const viteRaw = readFileSync(vitePath, 'utf8');
    const baseMatch = viteRaw.match(/base\s*:\s*["']([^"']+)["']/);
    const expectedBase = `/${expectedSlug}/`;
    if (!baseMatch) {
      configErrorCount++;
      issues.push(`vite.config.ts missing base config (expected "${expectedBase}")`);
    } else if (baseMatch[1] !== expectedBase) {
      configErrorCount++;
      issues.push(`vite.config.ts base="${baseMatch[1]}" !== expected "${expectedBase}"`);
    }
  }

  const manifestPath = join(absPath, 'public', 'manifest.json');
  if (!existsSync(manifestPath)) {
    configErrorCount++;
    issues.push('Missing public/manifest.json');
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const expectedScope = `/${expectedSlug}/`;
      if (manifest.start_url !== expectedScope) {
        configErrorCount++;
        issues.push(`public/manifest.json start_url="${manifest.start_url}" !== expected "${expectedScope}"`);
      }
      if (manifest.scope !== expectedScope) {
        configErrorCount++;
        issues.push(`public/manifest.json scope="${manifest.scope}" !== expected "${expectedScope}"`);
      }
    } catch (e) {
      configErrorCount++;
      issues.push(`Invalid public/manifest.json: ${e.message}`);
    }
  }

  const searchIndexPath = join(absPath, 'public', 'data', 'search-index.json');
  if (!existsSync(searchIndexPath)) {
    if (allowMissingSearchIndex) {
      warnings.push('Missing public/data/search-index.json');
    } else {
      configErrorCount++;
      issues.push('Missing public/data/search-index.json');
    }
  } else {
    try {
      const si = JSON.parse(readFileSync(searchIndexPath, 'utf8'));
      if (!Array.isArray(si) || si.length === 0) {
        configErrorCount++;
        issues.push('public/data/search-index.json must be a non-empty JSON array');
      } else if (!isDeepStrictEqual(si, buildModuleSearchIndex(join(absPath, 'public', 'data')))) {
        configErrorCount++;
        issues.push('public/data/search-index.json is stale: rebuild the module search index');
      }
    } catch (e) {
      configErrorCount++;
      issues.push(`Invalid public/data/search-index.json: ${e.message}`);
    }
  }

  // 5. Duplicate ID + slug checks
  const dupRes = await checkModuleDuplicates(absPath, { strictTags });
  if (dupRes.duplicateIdCount > 0) {
    issues.push(`${dupRes.duplicateIdCount} duplicate ID(s) across data files`);
  }
  if (dupRes.duplicateSlugCount > 0) {
    issues.push(`${dupRes.duplicateSlugCount} duplicate routable slug(s)`);
  }
  if (dupRes.emptySlugCount > 0) {
    issues.push(`${dupRes.emptySlugCount} empty/missing slug(s)`);
  }
  if (dupRes.tagSlugWarningCount > 0 && !strictTags) {
    warnings.push(`${dupRes.tagSlugWarningCount} duplicate slug(s) in tags.json`);
  }

  // 6. Full reference checks
  const refRes = await checkModuleReferences(absPath);
  if (refRes.missingRefCount > 0) {
    const breakdown = Object.entries(refRes.byTarget)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    issues.push(`${refRes.missingRefCount} missing cross-file reference(s) (${breakdown})`);
  }
  for (const w of refRes.warnings) {
    warnings.push(w.message);
  }

  // 7. Question/exam audit checks
  const qRes = auditModuleQuestions(absPath);
  if (qRes.problems.length > 0) {
    issues.push(`${qRes.problems.length} question/exam problem(s) (${qRes.problems[0]})`);
  }
  warnings.push(...qRes.warnings);

  const hasError = issues.length > 0;

  return {
    module: slugDir,
    path: absPath,
    valid: !hasError,
    counts,
    metaErrors,
    schemaErrors: totalSchemaErrors,
    schemaErrorsByFile,
    statsMismatchCount,
    configErrorCount,
    duplicateIds: dupRes.duplicateIdCount,
    duplicateSlugs: dupRes.duplicateSlugCount,
    emptySlugs: dupRes.emptySlugCount,
    tagSlugWarnings: dupRes.tagSlugWarningCount,
    missingRefs: refRes.missingRefCount,
    questionProblems: qRes.problems.length,
    issues,
    warnings,
    details: { dupRes, refRes, qRes },
  };
}

function printValidationResult(res) {
  console.log(`\n=== Module Validation: ${res.path} ===\n`);

  console.log('--- Data Counts ---');
  for (const f of DATA_FILES) {
    console.log(`  ${f.padEnd(22)} ${res.counts[f] ?? 0}`);
  }

  console.log('\n--- Schema & Metadata Check (all items) ---');
  if (res.schemaErrors === 0 && res.statsMismatchCount === 0) {
    console.log('  ✅ module.json + all 10 data files passed full schema & stats checks');
  } else {
    if (res.metaErrors > 0) {
      console.log(`  ❌ module.json: ${res.metaErrors} metadata/schema error(s)`);
    }
    if (res.statsMismatchCount > 0) {
      console.log(`  ❌ module.json.stats: ${res.statsMismatchCount} mismatch(es)`);
    }
    for (const [f, info] of Object.entries(res.schemaErrorsByFile)) {
      console.log(`  ❌ ${f}.json: ${info.count} schema error(s)`);
      for (const s of info.samples) console.log(`     - ${s}`);
    }
  }

  console.log('\n--- Config & PWA Check ---');
  if (res.configErrorCount === 0) {
    console.log('  ✅ vite.config.ts base, public/manifest.json, and search-index.json valid');
  }

  console.log('\n--- Duplicate, Reference & Question Checks ---');
  console.log(
    `  duplicateIds=${res.duplicateIds}, duplicateSlugs=${res.duplicateSlugs}, emptySlugs=${res.emptySlugs}, missingRefs=${res.missingRefs}, questionProblems=${res.questionProblems}`
  );

  if (res.warnings.length > 0) {
    console.log('\n--- Warnings ---');
    for (const w of res.warnings.slice(0, 10)) console.log(`  ⚠️  ${w}`);
  }

  if (res.issues.length > 0) {
    console.log('\n--- Issues ---');
    for (const iss of res.issues) console.log(`  ❌ ${iss}`);
  }

  console.log('\n' + '='.repeat(40));
  if (!res.valid) {
    console.log('VALIDATION FAILED');
  } else {
    console.log('VALIDATION PASSED');
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const allowMissingSearchIndex = hasFlag(argv, '--allow-missing-search-index');
  const strictTags = hasFlag(argv, '--strict-tags');
  const jsonOut = hasFlag(argv, '--json');

  const targets = resolveTargetModules(
    argv,
    'Usage: node src/validate-module.mjs <module-path> | --all [--include-template] [--strict-tags] [--allow-missing-search-index] [--json]'
  );
  if (!targets) process.exit(1);

  const results = [];
  let failedCount = 0;

  for (const t of targets) {
    const res = await validateModule(t.path, { allowMissingSearchIndex, strictTags });
    results.push(res);
    if (!res.valid) failedCount++;
    if (!jsonOut && targets.length === 1) {
      printValidationResult(res);
    }
  }

  if (jsonOut) {
    const slim = results.map(({ details, ...rest }) => rest);
    console.log(JSON.stringify(targets.length === 1 ? slim[0] : slim, null, 2));
  } else if (targets.length > 1) {
    console.log(`\n=== Validation Summary (${results.length} modules) ===\n`);
    for (const r of results) {
      if (r.valid) {
        const warnNote = r.warnings.length ? ` (${r.warnings.length} warning)` : '';
        console.log(`✅ ${r.module}${warnNote}`);
      } else {
        console.log(`❌ ${r.module}: ${r.issues.join(' | ')}`);
      }
    }
    console.log(`\nPassed: ${results.length - failedCount}/${results.length}, Failed: ${failedCount}`);
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
