#!/usr/bin/env node
import { resolve } from 'path';
import { Schemas } from './schemas/module-schema.mjs';
import { readModuleData } from './utils/read-json.mjs';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/validate-module.mjs <module-path>'); process.exit(1); }

const DATA_FILES = ['courses','lessons','knowledge-points','questions','exams','cases','routes','glossary','faqs','tags'];

let hasError = false;

async function main() {
  console.log(`\n=== Module Validation: ${resolve(modulePath)} ===\n`);

  // 1. Load data
  const data = {};
  for (const f of DATA_FILES) {
    try { data[f] = await readModuleData(modulePath, f); }
    catch (e) { console.log(`❌ Cannot load ${f}.json: ${e.message}`); hasError = true; data[f] = []; }
  }

  // 2. Count
  console.log('--- Data Counts ---');
  for (const f of DATA_FILES) {
    const arr = data[f];
    console.log(`  ${f.padEnd(22)} ${Array.isArray(arr) ? arr.length : 'N/A'}`);
  }

  // 3. Duplicate IDs
  console.log('\n--- Duplicate ID Check ---');
  for (const f of DATA_FILES) {
    const arr = data[f];
    if (!Array.isArray(arr)) continue;
    const ids = arr.map(i=>i?.id).filter(Boolean);
    const unique = new Set(ids);
    if (ids.length !== unique.size) {
      const dupes = ids.filter((id,i) => ids.indexOf(id) !== i);
      console.log(`  ❌ ${f}.json: ${dupes.length} duplicate ID(s): ${[...new Set(dupes)].slice(0,5).join(', ')}`);
      hasError = true;
    } else {
      console.log(`  ✅ ${f}.json: ${ids.length} unique IDs`);
    }
  }

  // 4. Schema validation (sample first 5 items per file for speed)
  console.log('\n--- Schema Validation (first 5 per file) ---');
  for (const [f, schema] of Object.entries(Schemas)) {
    const arr = data[f];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    let fileErrors = 0;
    for (const item of arr.slice(0, 5)) {
      const result = schema.safeParse(item);
      if (!result.success) {
        fileErrors++;
        if (fileErrors <= 2) {
          const issues = result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');
          console.log(`  ❌ ${f}[${item.id}]: ${issues}`);
        }
      }
    }
    if (fileErrors === 0) console.log(`  ✅ ${f}.json: sample valid`);
    else {
      console.log(`  ❌ ${f}.json: ${fileErrors} schema error(s) in sample`);
      hasError = true;
    }
  }

  // 5. Reference check (key references only)
  console.log('\n--- Key Reference Check ---');
  const courseIds = new Set(data.courses.map(c=>c.id));
  const lessonIds = new Set(data.lessons.map(l=>l.id));
  const kpIds = new Set(data['knowledge-points'].map(k=>k.id));
  const qIds = new Set(data.questions.map(q=>q.id));

  let refIssues = 0;

  // courses → lessons
  for (const c of data.courses) {
    for (const lid of (c.lessons||[])) {
      if (!lessonIds.has(lid)) { refIssues++; }
    }
  }
  // lessons → courses
  for (const l of data.lessons) {
    if (!courseIds.has(l.courseId)) { refIssues++; }
  }
  // exams → questions
  for (const e of data.exams) {
    for (const qid of (e.questionIds||[])) {
      if (!qIds.has(qid)) { refIssues++; }
    }
  }
  // lessons → knowledge-points
  for (const l of data.lessons) {
    for (const kpid of (l.knowledgePoints||[])) {
      if (!kpIds.has(kpid)) { refIssues++; }
    }
  }

  if (refIssues === 0) console.log('  ✅ Key references valid');
  else {
    console.log(`  ❌ ${refIssues} missing reference(s)`);
    hasError = true;
  }

  // 6. Field completeness
  console.log('\n--- Field Completeness ---');
  let emptyStems = 0, emptyExplanations = 0;
  for (const q of data.questions) {
    if (!q.stem || q.stem.length < 5) emptyStems++;
    if (!q.explanation || q.explanation.length < 5) emptyExplanations++;
  }
  if (emptyStems === 0 && emptyExplanations === 0) console.log('  ✅ Questions have stems and explanations');
  else {
    console.log(`  ⚠️  ${emptyStems} empty stems, ${emptyExplanations} empty explanations`);
  }

  // Verdict
  console.log('\n' + '='.repeat(40));
  if (hasError) {
    console.log('VALIDATION FAILED');
    console.log('Run normalize-module.mjs to fix issues.');
  } else {
    console.log('VALIDATION PASSED');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
