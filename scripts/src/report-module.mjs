#!/usr/bin/env node
import { readModuleData } from './utils/read-json.mjs';
import { getDataDir, getReportsDir } from './utils/path-utils.mjs';
import fs from 'fs/promises';
import { resolve } from 'path';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/report-module.mjs <module-path>'); process.exit(1); }

async function main() {
  console.log(`\n=== Generate Quality Report: ${resolve(modulePath)} ===\n`);

  const load = async (f) => { try { return await readModuleData(modulePath, f); } catch { return []; } };

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

  // Counts
  const counts = {
    courses: courses.length, lessons: lessons.length,
    'knowledge-points': kps.length, questions: questions.length,
    exams: exams.length, cases: cases.length, routes: routes.length,
    glossary: glossary.length, faqs: faqs.length, tags: tags.length,
  };

  // Question type distribution
  const qTypes = {};
  const qDiffs = {};
  for (const q of questions) {
    qTypes[q.type] = (qTypes[q.type] || 0) + 1;
    qDiffs[q.difficulty] = (qDiffs[q.difficulty] || 0) + 1;
  }

  // Duplicate check
  const findDupes = (arr) => {
    const seen = new Map();
    const dupes = [];
    for (const item of arr) {
      const id = item?.id;
      if (!id) continue;
      if (seen.has(id)) dupes.push(id);
      else seen.set(id, true);
    }
    return dupes;
  };

  const dupeSummary = {};
  const allData = { courses, lessons, 'knowledge-points': kps, questions, exams, cases, routes, glossary, faqs, tags };
  for (const [name, arr] of Object.entries(allData)) {
    const dupes = findDupes(arr);
    if (dupes.length > 0) dupeSummary[name] = dupes;
  }

  // Reference check (key only)
  const courseIds = new Set(courses.map(c=>c.id));
  const lessonIds = new Set(lessons.map(l=>l.id));
  const kpIds = new Set(kps.map(k=>k.id));
  const qIds = new Set(questions.map(q=>q.id));

  let refIssues = 0;
  for (const c of courses) for (const lid of (c.lessons||[])) if (!lessonIds.has(lid)) refIssues++;
  for (const l of lessons) if (!courseIds.has(l.courseId)) refIssues++;
  for (const e of exams) for (const qid of (e.questionIds||[])) if (!qIds.has(qid)) refIssues++;
  for (const l of lessons) for (const kpid of (l.knowledgePoints||[])) if (!kpIds.has(kpid)) refIssues++;

  // File sizes
  const dataDir = getDataDir(modulePath);
  const fileSizes = {};
  for (const f of Object.keys(counts)) {
    try {
      const stat = await fs.stat(resolve(dataDir, `${f}.json`));
      fileSizes[f] = stat.size;
    } catch {}
  }
  // Search index size
  let searchIndexSize = 0;
  try { searchIndexSize = (await fs.stat(resolve(dataDir, 'search-index.json'))).size; } catch {}

  // Build report
  const lines = [];
  const add = (s) => lines.push(s);

  add('# Module Quality Report');
  add(`\nGenerated: ${new Date().toISOString()}`);
  add(`Module path: ${resolve(modulePath)}\n`);

  add('## 1. Data Scale\n');
  add('| Data Type | Count |');
  add('|-----------|------|');
  for (const [name, count] of Object.entries(counts)) {
    add(`| ${name} | ${count} |`);
  }

  add('\n## 2. Question Type Distribution\n');
  add('| Type | Count |');
  add('|------|------|');
  for (const [type, count] of Object.entries(qTypes).sort((a,b)=>b[1]-a[1])) {
    add(`| ${type} | ${count} |`);
  }

  add('\n## 3. Difficulty Distribution\n');
  add('| Difficulty | Count | Percentage |');
  add('|------------|------|------------|');
  for (const [diff, count] of Object.entries(qDiffs)) {
    add(`| ${diff} | ${count} | ${(count/questions.length*100).toFixed(1)}% |`);
  }

  add('\n## 4. Duplicate IDs\n');
  if (Object.keys(dupeSummary).length === 0) {
    add('✅ No duplicate IDs found.\n');
  } else {
    for (const [name, dupes] of Object.entries(dupeSummary)) {
      add(`❌ **${name}.json**: ${dupes.length} duplicate(s): ${dupes.slice(0,5).join(', ')}\n`);
    }
  }

  add('## 5. Reference Integrity\n');
  if (refIssues === 0) {
    add('✅ All key references are valid.\n');
  } else {
    add(`❌ ${refIssues} missing reference(s) found. Run normalize-module.mjs to fix.\n`);
  }

  add('## 6. File Sizes\n');
  add('| File | Size (KB) |');
  add('|------|-----------|');
  for (const [name, size] of Object.entries(fileSizes).sort((a,b)=>b[1]-a[1])) {
    add(`| ${name}.json | ${(size/1024).toFixed(1)} |`);
  }
  if (searchIndexSize > 0) {
    add(`| search-index.json | ${(searchIndexSize/1024).toFixed(1)} |`);
  }

  add('\n## 7. Search Index\n');
  if (searchIndexSize > 0) {
    add(`✅ search-index.json exists (${(searchIndexSize/1024).toFixed(1)} KB)\n`);
  } else {
    add('⚠️ search-index.json not found. Run build-search-index.mjs to generate.\n');
  }

  add('## 8. Optimization Suggestions\n');
  const suggestions = [];
  const largestFile = Object.entries(fileSizes).sort((a,b)=>b[1]-a[1])[0];
  if (largestFile && largestFile[1] > 500*1024) {
    suggestions.push(`- **${largestFile[0]}.json** is large (${(largestFile[1]/1024).toFixed(0)} KB). Consider splitting or lazy-loading.`);
  }
  if (qDiffs.easy && qDiffs.easy / questions.length < 0.35) {
    suggestions.push('- Easy questions are below 35%. Consider adding more entry-level questions.');
  }
  if (qDiffs.hard && qDiffs.hard / questions.length < 0.15) {
    suggestions.push('- Hard questions are below 15%. Consider adding more challenging questions.');
  }
  if (refIssues > 0) {
    suggestions.push(`- ${refIssues} missing references need fixing. Run normalize-module.mjs.`);
  }
  if (suggestions.length === 0) suggestions.push('- No critical issues found. Data quality looks good!');
  for (const s of suggestions) add(s);

  add('\n## 9. Next Steps\n');
  add('- Replace generated questions with real textbook/exam questions (source_type: "official")');
  add('- Enrich knowledge-point contentMarkdown with detailed derivations and diagrams');
  add('- Add more case_analysis questions for practical scenarios');
  add('- Run validate-module.mjs after any data changes');

  // Write report
  const reportsDir = getReportsDir(modulePath);
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = resolve(reportsDir, 'module-quality-report.md');
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');

  console.log(`✅ Report generated`);
  console.log(`   → ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
