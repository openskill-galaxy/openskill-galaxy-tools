#!/usr/bin/env node
import { resolve } from 'path';
import { readModuleData } from './utils/read-json.mjs';
import { writeModuleData } from './utils/write-json.mjs';
import { hasFlag, getPositionalArgs } from './utils/cli-utils.mjs';

const VALID_DIFFS = new Set(['easy', 'medium', 'hard']);
const VALID_QTYPES = new Set(['single', 'multiple', 'judge', 'short', 'fill', 'calculation', 'case_analysis']);

function buildKpLookup(kps) {
  const byTitle = new Map();
  const byName = new Map();
  const bySlug = new Map();

  for (const k of kps) {
    if (!k?.id) continue;
    if (k.title) {
      const key = k.title.trim();
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(k.id);
    }
    if (k.name) {
      const key = k.name.trim();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(k.id);
    }
    if (k.slug) {
      const key = k.slug.trim();
      if (!bySlug.has(key)) bySlug.set(key, []);
      bySlug.get(key).push(k.id);
    }
  }

  return (raw) => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    for (const map of [bySlug, byTitle, byName]) {
      const matches = map.get(trimmed);
      if (matches && matches.length === 1) return matches[0];
    }
    return null;
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const pruneRefs = hasFlag(argv, '--prune-refs');
  const fillSourceType = hasFlag(argv, '--fill-source-type');
  const positional = getPositionalArgs(argv);
  const modulePath = positional[0];

  if (!modulePath) {
    console.error('Usage: node src/normalize-module.mjs <module-path> [--dry-run] [--prune-refs] [--fill-source-type]');
    process.exit(1);
  }

  console.log(`\n=== Normalize Module: ${resolve(modulePath)}${dryRun ? ' [DRY RUN]' : ''} ===\n`);

  const load = async (f) => {
    const rows = await readModuleData(modulePath, f);
    if (!Array.isArray(rows)) throw new Error(f + '.json must contain an array');
    return rows;
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

  const courseIds = new Set(courses.map((c) => c.id));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const kpIds = new Set(kps.map((k) => k.id));
  const qIds = new Set(questions.map((q) => q.id));
  const caseIds = new Set(cases.map((c) => c.id));
  const glossaryIds = new Set(glossary.map((g) => g.id));
  const resolveKpNameToId = buildKpLookup(kps);

  let fixes = 0;
  let unresolvedWarnings = 0;

  // --- Courses ---
  for (const c of courses) {
    if (!Array.isArray(c.lessons)) {
      c.lessons = [];
      fixes++;
    }
    if (pruneRefs) {
      const before = c.lessons.length;
      c.lessons = c.lessons.filter((id) => lessonIds.has(id));
      if (c.lessons.length !== before) fixes += before - c.lessons.length;
    }
    if (!Array.isArray(c.tags)) {
      c.tags = [];
      fixes++;
    }
    if (!VALID_DIFFS.has(c.difficulty)) {
      c.difficulty = 'medium';
      fixes++;
    }
  }

  // --- Lessons ---
  for (const l of lessons) {
    if (!courseIds.has(l.courseId)) {
      const parent = courses.find((c) => Array.isArray(c.lessons) && c.lessons.includes(l.id));
      if (parent) {
        l.courseId = parent.id;
        fixes++;
      }
    }
    if (!Array.isArray(l.knowledgePoints)) {
      l.knowledgePoints = [];
      fixes++;
    } else {
      const nextKps = [];
      const seenKps = new Set();
      for (const ref of l.knowledgePoints) {
        let resolved = ref;
        if (!kpIds.has(ref)) {
          const matchedId = resolveKpNameToId(ref);
          if (matchedId) {
            resolved = matchedId;
            fixes++;
          } else if (pruneRefs) {
            fixes++;
            continue;
          } else {
            unresolvedWarnings++;
            console.warn(`  ⚠️  lesson[${l.id}].knowledgePoints: '${ref}' not found in knowledge-points.json (kept; pass --prune-refs to drop)`);
          }
        }
        if (!seenKps.has(resolved)) {
          seenKps.add(resolved);
          nextKps.push(resolved);
        } else {
          fixes++;
        }
      }
      l.knowledgePoints = nextKps;
    }
    if (typeof l.contentMarkdown !== 'string') {
      l.contentMarkdown = '';
      fixes++;
    }
    if (typeof l.estimatedMinutes !== 'number' || l.estimatedMinutes < 1) {
      l.estimatedMinutes = 30;
      fixes++;
    }
  }

  // --- Knowledge Points ---
  for (const k of kps) {
    if (!Array.isArray(k.relatedQuestions)) {
      k.relatedQuestions = [];
      fixes++;
    } else if (pruneRefs) {
      const b1 = k.relatedQuestions.length;
      k.relatedQuestions = k.relatedQuestions.filter((id) => qIds.has(id));
      if (k.relatedQuestions.length !== b1) fixes += b1 - k.relatedQuestions.length;
    }

    if (!Array.isArray(k.relatedCases)) {
      k.relatedCases = [];
      fixes++;
    } else if (pruneRefs) {
      const b2 = k.relatedCases.length;
      k.relatedCases = k.relatedCases.filter((id) => caseIds.has(id));
      if (k.relatedCases.length !== b2) fixes += b2 - k.relatedCases.length;
    }

    if (!Array.isArray(k.glossary)) {
      k.glossary = [];
      fixes++;
    } else if (pruneRefs) {
      const b3 = k.glossary.length;
      k.glossary = k.glossary.filter((id) => glossaryIds.has(id));
      if (k.glossary.length !== b3) fixes += b3 - k.glossary.length;
    }

    if (!VALID_DIFFS.has(k.difficulty)) {
      k.difficulty = 'medium';
      fixes++;
    }
    if (!Array.isArray(k.tags)) {
      k.tags = [];
      fixes++;
    }
  }

  // --- Questions ---
  for (const q of questions) {
    if (!VALID_DIFFS.has(q.difficulty)) {
      q.difficulty = 'medium';
      fixes++;
    }
    if (!VALID_QTYPES.has(q.type)) {
      q.type = 'single';
      fixes++;
    }
    if (q.related_questions !== undefined) {
      if (!Array.isArray(q.related_questions)) {
        q.related_questions = [];
        fixes++;
      } else if (pruneRefs) {
        const b = q.related_questions.length;
        q.related_questions = q.related_questions.filter((id) => qIds.has(id) && id !== q.id);
        if (q.related_questions.length !== b) fixes += b - q.related_questions.length;
      }
    }
    if (fillSourceType && !q.source_type) {
      q.source_type = 'generated';
      fixes++;
    }
    if (typeof q.estimated_time !== 'number' || q.estimated_time < 1) {
      q.estimated_time = 60;
      fixes++;
    }
    if (!Array.isArray(q.tags)) {
      q.tags = [];
      fixes++;
    }
    if (!Array.isArray(q.knowledge_points)) {
      q.knowledge_points = [];
      fixes++;
    }
    if (!Array.isArray(q.options)) {
      q.options = [];
      fixes++;
    }
    if (!Array.isArray(q.answer)) {
      q.answer = [];
      fixes++;
    }
    if (typeof q.explanation !== 'string') {
      q.explanation = '';
      fixes++;
    }
  }

  // --- Exams ---
  for (const e of exams) {
    if (!Array.isArray(e.questionIds)) {
      e.questionIds = [];
      fixes++;
    } else if (pruneRefs) {
      const b = e.questionIds.length;
      e.questionIds = e.questionIds.filter((id) => qIds.has(id));
      if (e.questionIds.length !== b) fixes += b - e.questionIds.length;
    }
    if (!VALID_DIFFS.has(e.difficulty)) {
      e.difficulty = 'medium';
      fixes++;
    }
    if (typeof e.timeLimitMinutes !== 'number' || e.timeLimitMinutes < 1) {
      e.timeLimitMinutes = 30;
      fixes++;
    }
    if (typeof e.passingScore !== 'number') {
      e.passingScore = 60;
      fixes++;
    }
  }

  // --- Cases ---
  for (const c of cases) {
    if (!Array.isArray(c.knowledgePoints)) {
      c.knowledgePoints = [];
      fixes++;
    } else if (pruneRefs) {
      const b = c.knowledgePoints.length;
      c.knowledgePoints = c.knowledgePoints.filter((id) => kpIds.has(id));
      if (c.knowledgePoints.length !== b) fixes += b - c.knowledgePoints.length;
    }
    if (!VALID_DIFFS.has(c.difficulty)) {
      c.difficulty = 'medium';
      fixes++;
    }
    if (!Array.isArray(c.tags)) {
      c.tags = [];
      fixes++;
    }
    if (typeof c.backgroundMarkdown !== 'string') {
      c.backgroundMarkdown = '';
      fixes++;
    }
    if (typeof c.tasksMarkdown !== 'string') {
      c.tasksMarkdown = '';
      fixes++;
    }
    if (typeof c.referenceMarkdown !== 'string') {
      c.referenceMarkdown = '';
      fixes++;
    }
  }

  // --- Routes ---
  for (const r of routes) {
    if (!Array.isArray(r.steps)) {
      r.steps = [];
      fixes++;
    } else if (pruneRefs) {
      for (const s of r.steps) {
        if (s.courseId && !courseIds.has(s.courseId)) {
          delete s.courseId;
          fixes++;
        }
        if (s.lessonId && !lessonIds.has(s.lessonId)) {
          delete s.lessonId;
          fixes++;
        }
        if (s.knowledgePointId && !kpIds.has(s.knowledgePointId)) {
          delete s.knowledgePointId;
          fixes++;
        }
      }
    }
  }

  // --- Glossary ---
  for (const g of glossary) {
    if (g.aliases !== undefined && !Array.isArray(g.aliases)) {
      g.aliases = [];
      fixes++;
    }
  }

  // --- FAQs ---
  for (const f of faqs) {
    if (!f.category) {
      f.category = '通用';
      fixes++;
    }
  }

  console.log(`Planned/applied fixes: ${fixes}, unresolved reference warnings: ${unresolvedWarnings}`);
  if (!dryRun && fixes > 0) {
    await writeModuleData(modulePath, 'courses', courses);
    await writeModuleData(modulePath, 'lessons', lessons);
    await writeModuleData(modulePath, 'knowledge-points', kps);
    await writeModuleData(modulePath, 'questions', questions);
    await writeModuleData(modulePath, 'exams', exams);
    await writeModuleData(modulePath, 'cases', cases);
    await writeModuleData(modulePath, 'routes', routes);
    await writeModuleData(modulePath, 'glossary', glossary);
    await writeModuleData(modulePath, 'faqs', faqs);
    console.log('✅ Normalization complete');
  } else if (dryRun) {
    console.log('ℹ️  Dry run: no files written');
  } else {
    console.log('✅ No changes needed');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
