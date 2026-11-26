#!/usr/bin/env node
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { readModuleData } from './utils/read-json.mjs';
import { hasFlag, resolveTargetModules } from './utils/cli-utils.mjs';

export async function checkModuleReferences(modulePath) {
  const absPath = resolve(modulePath);
  const name = basename(absPath);

  const loadErrors = [];
  const load = async (f) => {
    try {
      const data = await readModuleData(absPath, f);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      loadErrors.push(`${f}.json: ${e.message}`);
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

  const courseIds = new Set(courses.map((c) => c?.id).filter(Boolean));
  const lessonIds = new Set(lessons.map((l) => l?.id).filter(Boolean));
  const kpIds = new Set(kps.map((k) => k?.id).filter(Boolean));
  const qIds = new Set(questions.map((q) => q?.id).filter(Boolean));
  const caseIds = new Set(cases.map((c) => c?.id).filter(Boolean));
  const publicCaseIds = new Set(cases.filter((c) => c?.editorialStatus !== 'draft').map((c) => c?.id));
  const glossaryIds = new Set(glossary.map((g) => g?.id).filter(Boolean));

  const courseLessonMap = new Map(
    courses.map((c) => [c?.id, new Set(Array.isArray(c?.lessons) ? c.lessons : [])])
  );

  const issues = [];
  const warnings = [];

  const addIssue = (fromFile, fromId, field, missingRef, targetName) => {
    issues.push({ fromFile, fromId: fromId || 'unknown', field, missingRef, targetName });
  };

  const checkRequired = (fromFile, fromId, field, refId, targetSet, targetName) => {
    if (typeof refId !== 'string' || refId.trim() === '') {
      addIssue(fromFile, fromId, field, '<empty>', targetName);
      return;
    }
    if (!targetSet.has(refId)) {
      addIssue(fromFile, fromId, field, refId, targetName);
    }
  };

  const checkOptional = (fromFile, fromId, field, refId, targetSet, targetName) => {
    if (refId === undefined || refId === null || refId === '') return;
    if (!targetSet.has(refId)) {
      addIssue(fromFile, fromId, field, refId, targetName);
    }
  };

  const checkArr = (fromFile, fromId, field, refIds, targetSet, targetName) => {
    for (const rid of Array.isArray(refIds) ? refIds : []) {
      if (typeof rid !== 'string' || rid.trim() === '') {
        addIssue(fromFile, fromId, field, '<empty>', targetName);
      } else if (!targetSet.has(rid)) {
        addIssue(fromFile, fromId, field, rid, targetName);
      }
    }
  };

  // 1. courses.lessons -> lessons
  for (const c of courses) {
    checkArr('courses', c.id, 'lessons', c.lessons, lessonIds, 'lessons');
  }

  // 2. lessons.courseId -> courses (required) & bidirectional consistency
  for (const l of lessons) {
    checkRequired('lessons', l.id, 'courseId', l.courseId, courseIds, 'courses');
    if (l.courseId && courseIds.has(l.courseId)) {
      const cLessons = courseLessonMap.get(l.courseId);
      if (cLessons && !cLessons.has(l.id)) {
        warnings.push({
          fromFile: 'lessons',
          fromId: l.id,
          field: 'courseId',
          message: `lesson ${l.id} references course ${l.courseId}, but course.lessons omits ${l.id}`,
        });
      }
    }
  }

  // 3. lessons.knowledgePoints -> knowledge-points
  for (const l of lessons) {
    checkArr('lessons', l.id, 'knowledgePoints', l.knowledgePoints, kpIds, 'knowledge-points');
    checkArr('lessons', l.id, 'practiceQuestionIds', l.practiceQuestionIds, qIds, 'questions');
  }

  // 4. knowledge-points.courseId -> courses (optional when absent)
  for (const k of kps) {
    checkOptional('knowledge-points', k.id, 'courseId', k.courseId, courseIds, 'courses');
  }

  // 5. knowledge-points.relatedQuestions -> questions
  for (const k of kps) {
    checkArr('knowledge-points', k.id, 'relatedQuestions', k.relatedQuestions, qIds, 'questions');
  }

  // 6. knowledge-points.relatedCases -> cases
  for (const k of kps) {
    checkArr('knowledge-points', k.id, 'relatedCases', k.relatedCases, caseIds, 'cases');
  }

  // 7. knowledge-points.glossary -> glossary
  for (const k of kps) {
    checkArr('knowledge-points', k.id, 'glossary', k.glossary, glossaryIds, 'glossary');
  }

  // 8. questions.chapter -> courses OR lessons (required)
  for (const q of questions) {
    if (typeof q.chapter !== 'string' || q.chapter.trim() === '') {
      addIssue('questions', q.id, 'chapter', '<empty>', 'courses|lessons');
    } else if (!courseIds.has(q.chapter) && !lessonIds.has(q.chapter)) {
      addIssue('questions', q.id, 'chapter', q.chapter, 'courses|lessons');
    }
  }

  // 9. questions.knowledge_points -> knowledge-points
  for (const q of questions) {
    checkArr('questions', q.id, 'knowledge_points', q.knowledge_points, kpIds, 'knowledge-points');
  }

  // 10. questions.related_questions -> questions
  for (const q of questions) {
    checkArr('questions', q.id, 'related_questions', q.related_questions, qIds, 'questions');
  }

  // 11. exams.questionIds -> questions
  for (const e of exams) {
    checkArr('exams', e.id, 'questionIds', e.questionIds, qIds, 'questions');
  }

  // 12. cases.knowledgePoints -> knowledge-points
  for (const c of cases) {
    checkOptional('cases', c.id, 'nextCaseId', c.nextCaseId, publicCaseIds, 'public cases');
    checkArr('cases', c.id, 'knowledgePoints', c.knowledgePoints, kpIds, 'knowledge-points');
  }

  // 13. routes.steps.{courseId, lessonId, knowledgePointId} -> courses / lessons / knowledge-points
  for (const r of routes) {
    for (const s of Array.isArray(r.steps) ? r.steps : []) {
      checkOptional('routes', r.id, 'steps.courseId', s.courseId, courseIds, 'courses');
      checkOptional('routes', r.id, 'steps.lessonId', s.lessonId, lessonIds, 'lessons');
      checkOptional('routes', r.id, 'steps.knowledgePointId', s.knowledgePointId, kpIds, 'knowledge-points');
    }
  }

  const byTarget = {};
  for (const iss of issues) {
    const key = `${iss.fromFile}.${iss.field} → ${iss.targetName}`;
    byTarget[key] = (byTarget[key] || 0) + 1;
  }

  return {
    module: name,
    path: absPath,
    loadErrors,
    issues,
    warnings,
    byTarget,
    missingRefCount: issues.length,
    hasErrors: issues.length > 0 || loadErrors.length > 0,
  };
}

function printModuleReferences(res) {
  console.log(`\n=== Reference Integrity Check: ${res.path} ===\n`);

  if (res.loadErrors.length > 0) {
    console.log('❌ Data load errors:');
    for (const err of res.loadErrors) console.log(`  - ${err}`);
    console.log('');
  }

  console.log(`Total missing references: ${res.missingRefCount}\n`);
  if (res.warnings.length > 0) {
    console.log(`⚠️  Consistency warnings: ${res.warnings.length}`);
    for (const w of res.warnings.slice(0, 10)) {
      console.log(`  - ${w.message}`);
    }
    console.log('');
  }

  if (!res.hasErrors) {
    console.log('✅ All references are valid');
    return;
  }

  console.log('--- Breakdown by reference type ---');
  for (const [key, count] of Object.entries(res.byTarget).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(52)} ${count}`);
  }

  console.log('\n--- First 50 missing references ---');
  for (const iss of res.issues.slice(0, 50)) {
    console.log(`  ${iss.fromFile}[${iss.fromId}].${iss.field} → missing ${iss.missingRef} in ${iss.targetName}`);
  }

  console.log('\n--- Guidance ---');
  console.log('Fix broken IDs to match target JSON records (do NOT blindly strip human-readable topic strings with normalize-module.mjs).');
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonOut = hasFlag(argv, '--json');
  const targets = resolveTargetModules(
    argv,
    'Usage: node src/check-references.mjs <module-path> | --all [--include-template] [--json]'
  );
  if (!targets) process.exit(1);

  const results = [];
  let failedModules = 0;

  for (const t of targets) {
    const res = await checkModuleReferences(t.path);
    results.push(res);
    if (res.hasErrors) failedModules++;
    if (!jsonOut && targets.length === 1) {
      printModuleReferences(res);
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify(targets.length === 1 ? results[0] : results, null, 2));
  } else if (targets.length > 1) {
    console.log(`\n=== Reference Integrity Summary (${results.length} modules) ===\n`);
    for (const r of results) {
      if (r.hasErrors) {
        const breakdown = Object.entries(r.byTarget)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        console.log(`❌ ${r.module}: ${r.missingRefCount} missing (${breakdown || r.loadErrors.join('; ')})`);
      } else {
        console.log(`✅ ${r.module}: 0 missing`);
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
