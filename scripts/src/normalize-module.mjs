#!/usr/bin/env node
import { readModuleData } from './utils/read-json.mjs';
import { writeModuleData } from './utils/write-json.mjs';
import { resolve } from 'path';
import fs from 'fs/promises';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/normalize-module.mjs <module-path>'); process.exit(1); }

const VALID_DIFFS = new Set(['easy', 'medium', 'hard']);
const VALID_QTYPES = new Set(['single', 'multiple', 'judge', 'short', 'fill', 'calculation', 'case_analysis']);

async function main() {
  console.log(`\n=== Normalize Module: ${resolve(modulePath)} ===\n`);

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

  const courseIds = new Set(courses.map(c=>c.id));
  const lessonIds = new Set(lessons.map(l=>l.id));
  const kpIds = new Set(kps.map(k=>k.id));
  const qIds = new Set(questions.map(q=>q.id));
  const caseIds = new Set(cases.map(c=>c.id));
  const glossaryIds = new Set(glossary.map(g=>g.id));

  let fixes = 0;

  // --- Courses: fix lessons references ---
  for (const c of courses) {
    if (!Array.isArray(c.lessons)) { c.lessons = []; fixes++; }
    const before = c.lessons.length;
    c.lessons = c.lessons.filter(id => lessonIds.has(id));
    if (c.lessons.length !== before) fixes += before - c.lessons.length;
    if (!Array.isArray(c.tags)) { c.tags = []; fixes++; }
    if (!VALID_DIFFS.has(c.difficulty)) { c.difficulty = 'medium'; fixes++; }
  }

  // --- Lessons: fix courseId, knowledgePoints ---
  for (const l of lessons) {
    if (!courseIds.has(l.courseId)) {
      // Try to find a course that references this lesson
      const parent = courses.find(c => c.lessons.includes(l.id));
      if (parent) { l.courseId = parent.id; fixes++; }
    }
    if (!Array.isArray(l.knowledgePoints)) { l.knowledgePoints = []; fixes++; }
    const before = l.knowledgePoints.length;
    l.knowledgePoints = l.knowledgePoints.filter(id => kpIds.has(id));
    if (l.knowledgePoints.length !== before) fixes += before - l.knowledgePoints.length;
    if (!l.contentMarkdown) { l.contentMarkdown = ''; fixes++; }
    if (typeof l.estimatedMinutes !== 'number' || l.estimatedMinutes < 1) { l.estimatedMinutes = 30; fixes++; }
  }

  // --- Knowledge Points: fix relatedQuestions, relatedCases, glossary ---
  for (const k of kps) {
    if (!Array.isArray(k.relatedQuestions)) { k.relatedQuestions = []; fixes++; }
    const b1 = k.relatedQuestions.length;
    k.relatedQuestions = k.relatedQuestions.filter(id => qIds.has(id));
    if (k.relatedQuestions.length !== b1) fixes += b1 - k.relatedQuestions.length;

    if (!Array.isArray(k.relatedCases)) { k.relatedCases = []; fixes++; }
    const b2 = k.relatedCases.length;
    k.relatedCases = k.relatedCases.filter(id => caseIds.has(id));
    if (k.relatedCases.length !== b2) fixes += b2 - k.relatedCases.length;

    if (!Array.isArray(k.glossary)) { k.glossary = []; fixes++; }
    const b3 = k.glossary.length;
    k.glossary = k.glossary.filter(id => glossaryIds.has(id));
    if (k.glossary.length !== b3) fixes += b3 - k.glossary.length;

    if (!VALID_DIFFS.has(k.difficulty)) { k.difficulty = 'medium'; fixes++; }
    if (!Array.isArray(k.tags)) { k.tags = []; fixes++; }
  }

  // --- Questions: fix related_questions, difficulty, type, source_type, estimated_time ---
  for (const q of questions) {
    if (!VALID_DIFFS.has(q.difficulty)) { q.difficulty = 'medium'; fixes++; }
    if (!VALID_QTYPES.has(q.type)) { q.type = 'single'; fixes++; }
    if (!Array.isArray(q.related_questions)) { q.related_questions = []; fixes++; }
    const b = q.related_questions.length;
    q.related_questions = q.related_questions.filter(id => qIds.has(id) && id !== q.id);
    if (q.related_questions.length !== b) fixes += b - q.related_questions.length;
    if (!q.source_type) { q.source_type = 'generated'; fixes++; }
    if (typeof q.estimated_time !== 'number' || q.estimated_time < 1) { q.estimated_time = 60; fixes++; }
    if (!Array.isArray(q.tags)) { q.tags = []; fixes++; }
    if (!Array.isArray(q.knowledge_points)) { q.knowledge_points = []; fixes++; }
    if (!Array.isArray(q.options)) { q.options = []; fixes++; }
    if (!Array.isArray(q.answer)) { q.answer = []; fixes++; }
    if (!q.explanation) { q.explanation = ''; fixes++; }
  }

  // --- Exams: fix questionIds ---
  for (const e of exams) {
    if (!Array.isArray(e.questionIds)) { e.questionIds = []; fixes++; }
    const b = e.questionIds.length;
    e.questionIds = e.questionIds.filter(id => qIds.has(id));
    if (e.questionIds.length !== b) fixes += b - e.questionIds.length;
    if (!VALID_DIFFS.has(e.difficulty)) { e.difficulty = 'medium'; fixes++; }
    if (typeof e.timeLimitMinutes !== 'number' || e.timeLimitMinutes < 1) { e.timeLimitMinutes = 30; fixes++; }
    if (typeof e.passingScore !== 'number') { e.passingScore = 60; fixes++; }
  }

  // --- Cases: fix knowledgePoints ---
  for (const c of cases) {
    if (!Array.isArray(c.knowledgePoints)) { c.knowledgePoints = []; fixes++; }
    const b = c.knowledgePoints.length;
    c.knowledgePoints = c.knowledgePoints.filter(id => kpIds.has(id));
    if (c.knowledgePoints.length !== b) fixes += b - c.knowledgePoints.length;
    if (!VALID_DIFFS.has(c.difficulty)) { c.difficulty = 'medium'; fixes++; }
    if (!Array.isArray(c.tags)) { c.tags = []; fixes++; }
    if (!c.backgroundMarkdown) { c.backgroundMarkdown = ''; fixes++; }
    if (!c.tasksMarkdown) { c.tasksMarkdown = ''; fixes++; }
    if (!c.referenceMarkdown) { c.referenceMarkdown = ''; fixes++; }
  }

  // --- Routes: fix step references ---
  for (const r of routes) {
    if (!Array.isArray(r.steps)) { r.steps = []; fixes++; }
    for (const s of r.steps) {
      if (s.courseId && !courseIds.has(s.courseId)) { delete s.courseId; fixes++; }
      if (s.lessonId && !lessonIds.has(s.lessonId)) { delete s.lessonId; fixes++; }
      if (s.knowledgePointId && !kpIds.has(s.knowledgePointId)) { delete s.knowledgePointId; fixes++; }
    }
  }

  // --- Glossary: ensure aliases ---
  for (const g of glossary) {
    if (!Array.isArray(g.aliases)) { g.aliases = []; fixes++; }
  }

  // --- FAQs: ensure category ---
  for (const f of faqs) {
    if (!f.category) { f.category = '通用'; fixes++; }
  }

  // Write back
  console.log(`Applying ${fixes} fix(es)...\n`);
  await writeModuleData(modulePath, 'courses', courses);
  await writeModuleData(modulePath, 'lessons', lessons);
  await writeModuleData(modulePath, 'knowledge-points', kps);
  await writeModuleData(modulePath, 'questions', questions);
  await writeModuleData(modulePath, 'exams', exams);
  await writeModuleData(modulePath, 'cases', cases);
  await writeModuleData(modulePath, 'routes', routes);
  await writeModuleData(modulePath, 'glossary', glossary);
  await writeModuleData(modulePath, 'faqs', faqs);
  // Don't overwrite tags or module meta

  console.log('✅ Normalization complete');
  console.log(`   ${fixes} fix(es) applied`);
}

main().catch(e => { console.error(e); process.exit(1); });
