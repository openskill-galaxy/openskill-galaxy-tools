#!/usr/bin/env node
import { readModuleData } from './utils/read-json.mjs';
import { resolve } from 'path';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/check-references.mjs <module-path>'); process.exit(1); }

async function main() {
  console.log(`\n=== Reference Integrity Check: ${resolve(modulePath)} ===\n`);

  const load = async (f) => { try { return await readModuleData(modulePath, f); } catch { return []; } };
  const courses = await load('courses');
  const lessons = await load('lessons');
  const kps = await load('knowledge-points');
  const questions = await load('questions');
  const exams = await load('exams');
  const cases = await load('cases');
  const routes = await load('routes');

  const courseIds = new Set(courses.map(c=>c.id));
  const lessonIds = new Set(lessons.map(l=>l.id));
  const kpIds = new Set(kps.map(k=>k.id));
  const qIds = new Set(questions.map(q=>q.id));
  const caseIds = new Set(cases.map(c=>c.id));

  const issues = [];

  const check = (fromFile, fromId, field, refId, targetSet, targetName) => {
    if (refId && !targetSet.has(refId)) {
      issues.push({ fromFile, fromId, field, missingRef: refId, targetName });
    }
  };

  const checkArr = (fromFile, fromId, field, refIds, targetSet, targetName) => {
    for (const rid of (refIds || [])) {
      check(fromFile, fromId, field, rid, targetSet, targetName);
    }
  };

  // courses.lessons → lessons
  for (const c of courses) checkArr('courses', c.id, 'lessons', c.lessons, lessonIds, 'lessons');

  // lessons.courseId → courses
  for (const l of lessons) check('lessons', l.id, 'courseId', l.courseId, courseIds, 'courses');

  // lessons.knowledgePoints → knowledge-points
  for (const l of lessons) checkArr('lessons', l.id, 'knowledgePoints', l.knowledgePoints, kpIds, 'knowledge-points');

  // knowledge-points.relatedQuestions → questions
  for (const k of kps) checkArr('knowledge-points', k.id, 'relatedQuestions', k.relatedQuestions, qIds, 'questions');

  // knowledge-points.relatedCases → cases
  for (const k of kps) checkArr('knowledge-points', k.id, 'relatedCases', k.relatedCases, caseIds, 'cases');

  // questions.related_questions → questions
  for (const q of questions) checkArr('questions', q.id, 'related_questions', q.related_questions, qIds, 'questions');

  // exams.questionIds → questions
  for (const e of exams) checkArr('exams', e.id, 'questionIds', e.questionIds, qIds, 'questions');

  // cases.knowledgePoints → knowledge-points
  for (const c of cases) checkArr('cases', c.id, 'knowledgePoints', c.knowledgePoints, kpIds, 'knowledge-points');

  // routes.steps.courseId → courses, routes.steps.lessonId → lessons
  for (const r of routes) {
    for (const s of (r.steps || [])) {
      if (s.courseId) check('routes', r.id, 'steps.courseId', s.courseId, courseIds, 'courses');
      if (s.lessonId) check('routes', r.id, 'steps.lessonId', s.lessonId, lessonIds, 'lessons');
      if (s.knowledgePointId) check('routes', r.id, 'steps.knowledgePointId', s.knowledgePointId, kpIds, 'knowledge-points');
    }
  }

  // Summary
  const byTarget = {};
  for (const iss of issues) {
    const key = `${iss.field} → ${iss.targetName}`;
    byTarget[key] = (byTarget[key] || 0) + 1;
  }

  console.log(`Total missing references: ${issues.length}\n`);
  if (issues.length === 0) {
    console.log('✅ All references are valid');
    return;
  }

  console.log('--- Breakdown by reference type ---');
  for (const [key, count] of Object.entries(byTarget).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${key.padEnd(50)} ${count}`);
  }

  console.log('\n--- First 50 missing references ---');
  for (const iss of issues.slice(0, 50)) {
    console.log(`  ${iss.fromFile}[${iss.fromId}].${iss.field} → missing ${iss.missingRef} in ${iss.targetName}`);
  }

  console.log('\n--- Suggested fix ---');
  console.log('Run: node src/normalize-module.mjs <module-path>');
  console.log('This will remove invalid references from arrays.');
}

main().catch(e => { console.error(e); process.exit(1); });
