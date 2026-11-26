#!/usr/bin/env node
import { isPublished } from './utils/editorial.mjs';
import fs from 'fs/promises';
import { resolve } from 'path';
import { readModuleData } from './utils/read-json.mjs';
import { getDataDir, getReportsDir } from './utils/path-utils.mjs';
import { checkModuleDuplicates } from './check-duplicates.mjs';
import { checkModuleReferences } from './check-references.mjs';
import { auditModuleQuestions } from './audit-questions.mjs';
import { hasFlag, getPositionalArgs } from './utils/cli-utils.mjs';

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const positional = getPositionalArgs(argv);
  const modulePath = positional[0];
  if (!modulePath) {
    console.error('Usage: node src/report-module.mjs <module-path> [--dry-run]');
    process.exit(1);
  }

  const absPath = resolve(modulePath);
  console.log(`\n=== Generate Quality Report: ${absPath}${dryRun ? ' [DRY RUN]' : ''} ===\n`);

  const load = async (f) => {
    try {
      const data = await readModuleData(absPath, f);
      return Array.isArray(data) ? data.filter(isPublished) : [];
    } catch {
      return [];
    }
  };

  const courses = await load('courses');
  const lessons = await load('lessons');
  const kps = await load('knowledge-points');
  const questions = await load('questions');
  const exams = await load('exams');
  const cases = await load('cases');
  const routes = await load('routes');
  const glossary = await load('glossary');
  const faqs = await load('faqs');
  const tags = await load('tags');

  const counts = {
    courses: courses.length,
    lessons: lessons.length,
    'knowledge-points': kps.length,
    questions: questions.length,
    exams: exams.length,
    cases: cases.length,
    routes: routes.length,
    glossary: glossary.length,
    faqs: faqs.length,
    tags: tags.length,
  };

  const qTypes = {};
  const qDiffs = {};
  for (const q of questions) {
    qTypes[q.type] = (qTypes[q.type] || 0) + 1;
    qDiffs[q.difficulty] = (qDiffs[q.difficulty] || 0) + 1;
  }

  const dupRes = await checkModuleDuplicates(absPath);
  const refRes = await checkModuleReferences(absPath);
  const qAudit = auditModuleQuestions(absPath);

  const dataDir = getDataDir(absPath);
  const fileSizes = {};
  for (const f of Object.keys(counts)) {
    try {
      const stat = await fs.stat(resolve(dataDir, `${f}.json`));
      fileSizes[f] = stat.size;
    } catch {}
  }
  let searchIndexSize = 0;
  try {
    searchIndexSize = (await fs.stat(resolve(dataDir, 'search-index.json'))).size;
  } catch {}

  const lines = [];
  const add = (s) => lines.push(s);

  add('# Module Quality Report');
  add(`\nGenerated: ${new Date().toISOString()}`);
  add(`Module path: ${absPath}\n`);

  add('## 1. Data Scale\n');
  add('| Data Type | Count |');
  add('|-----------|------|');
  for (const [name, count] of Object.entries(counts)) {
    add(`| ${name} | ${count} |`);
  }

  add('\n## 2. Question Type Distribution\n');
  add('| Type | Count |');
  add('|------|------|');
  if (Object.keys(qTypes).length === 0) {
    add('| (none) | 0 |');
  } else {
    for (const [type, count] of Object.entries(qTypes).sort((a, b) => b[1] - a[1])) {
      add(`| ${type} | ${count} |`);
    }
  }

  add('\n## 3. Difficulty Distribution\n');
  add('| Difficulty | Count | Percentage |');
  add('|------------|------|------------|');
  if (questions.length === 0) {
    add('| (none) | 0 | 0.0% |');
  } else {
    for (const [diff, count] of Object.entries(qDiffs)) {
      add(`| ${diff} | ${count} | ${((count / questions.length) * 100).toFixed(1)}% |`);
    }
  }

  add('\n## 4. Duplicate IDs & Slugs\n');
  if (!dupRes.hasErrors && dupRes.tagSlugWarningCount === 0) {
    add('✅ No duplicate IDs or slugs found.\n');
  } else {
    for (const [name, info] of Object.entries(dupRes.files)) {
      if (info.duplicateIds.length > 0) {
        add(
          `❌ **${name}.json**: ${info.duplicateIds.length} duplicate ID(s): ${info.duplicateIds
            .slice(0, 5)
            .map((d) => d.id)
            .join(', ')}\n`
        );
      }
      if (info.duplicateSlugs.length > 0) {
        const prefix = info.isTagWarningOnly ? '⚠️' : '❌';
        add(
          `${prefix} **${name}.json**: ${info.duplicateSlugs.length} duplicate slug(s): ${info.duplicateSlugs
            .slice(0, 5)
            .map((d) => d.slug)
            .join(', ')}\n`
        );
      }
      if (info.emptySlugs.length > 0) {
        add(`❌ **${name}.json**: ${info.emptySlugs.length} empty slug(s)\n`);
      }
    }
  }

  add('## 5. Reference Integrity\n');
  if (refRes.missingRefCount === 0) {
    add('✅ All cross-file references are valid.\n');
  } else {
    add(`❌ ${refRes.missingRefCount} missing reference(s) found:\n`);
    for (const [key, count] of Object.entries(refRes.byTarget)) {
      add(`- ${key}: ${count}`);
    }
    add('');
  }

  add('## 6. Question & Exam Integrity\n');
  if (qAudit.problems.length === 0) {
    add(`✅ All ${qAudit.questionCount} questions and ${qAudit.examCount} exams passed integrity checks.\n`);
  } else {
    add(`❌ ${qAudit.problems.length} question/exam issue(s) found.\n`);
  }

  add('## 7. File Sizes\n');
  add('| File | Size (KB) |');
  add('|------|-----------|');
  for (const [name, size] of Object.entries(fileSizes).sort((a, b) => b[1] - a[1])) {
    add(`| ${name}.json | ${(size / 1024).toFixed(1)} |`);
  }
  if (searchIndexSize > 0) {
    add(`| search-index.json | ${(searchIndexSize / 1024).toFixed(1)} |`);
  }

  add('\n## 8. Search Index\n');
  if (searchIndexSize > 0) {
    add(`✅ search-index.json exists (${(searchIndexSize / 1024).toFixed(1)} KB)\n`);
  } else {
    add('⚠️ search-index.json not found. Run build-search-index.mjs to generate.\n');
  }

  add('## 9. Optimization Suggestions\n');
  const suggestions = [];
  const largestFile = Object.entries(fileSizes).sort((a, b) => b[1] - a[1])[0];
  if (largestFile && largestFile[1] > 500 * 1024) {
    suggestions.push(
      `- **${largestFile[0]}.json** is large (${(largestFile[1] / 1024).toFixed(0)} KB). Consider splitting or lazy-loading.`
    );
  }
  if (questions.length > 0 && qDiffs.easy && qDiffs.easy / questions.length < 0.35) {
    suggestions.push('- Easy questions are below 35%. Consider adding more entry-level questions.');
  }
  if (questions.length > 0 && qDiffs.hard && qDiffs.hard / questions.length < 0.15) {
    suggestions.push('- Hard questions are below 15%. Consider adding more challenging questions.');
  }
  if (refRes.missingRefCount > 0) {
    suggestions.push(
      `- ${refRes.missingRefCount} missing references need fixing (inspect with check-references.mjs and map to valid target IDs).`
    );
  }
  if (dupRes.duplicateSlugCount > 0) {
    suggestions.push(`- ${dupRes.duplicateSlugCount} duplicate routable slug(s) should be disambiguated.`);
  }
  if (suggestions.length === 0) suggestions.push('- No critical issues found. Data quality looks good!');
  for (const s of suggestions) add(s);

  add('\n## 10. Next Steps\n');
  add('- Run `node src/validate-module.mjs <module-path>` after any data changes');
  add('- Run `node src/build-search-index.mjs <module-path>` after content updates');

  const content = lines.join('\n') + '\n';
  if (dryRun) {
    console.log(content);
    return;
  }

  const reportsDir = getReportsDir(absPath);
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = resolve(reportsDir, 'module-quality-report.md');
  await fs.writeFile(reportPath, content, 'utf8');

  console.log('✅ Report generated');
  console.log(`   → ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
