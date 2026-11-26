import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PORTAL_DIR, TEMPLATE_DIR, WORKSPACE_ROOT } from './workspace.mjs';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonOptional(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function discoverPortalFixtures(portalDir = PORTAL_DIR) {
  const dataDir = join(portalDir, 'public', 'data');
  const modules = readJson(join(dataDir, 'modules.json'));
  const categories = readJson(join(dataDir, 'categories.json'));
  const learningPaths = readJson(join(dataDir, 'learning-paths.json'));
  const updates = readJson(join(dataDir, 'updates.json'));
  const portalSearchIndex = readJson(join(dataDir, 'portal-search-index.json'));
  const globalSearchIndex = readJson(join(dataDir, 'global-search-index.json'));
  const platformStats = readJson(join(dataDir, 'platform-stats.json'));
  const siteHealthReport = readJson(join(dataDir, 'site-health-report.json'));
  const capabilityMap = readJsonOptional(join(dataDir, 'capability-map.json'));
  const careerPaths = readJsonOptional(join(dataDir, 'career-paths.json'));
  const moduleDependencies = readJsonOptional(join(dataDir, 'module-dependencies.json'));
  const v1Roadmap = readJsonOptional(join(dataDir, 'v1-roadmap.json'));

  const sampleModule = modules[0];
  const sampleLessonItem =
    globalSearchIndex.find((x) => x.type === 'lesson' && x.moduleSlug === 'module-python-basic') ||
    globalSearchIndex.find((x) => x.type === 'lesson');
  const sampleQuestionItem =
    globalSearchIndex.find((x) => x.type === 'question' && x.moduleSlug === 'module-python-basic') ||
    globalSearchIndex.find((x) => x.type === 'question');

  return {
    portalDir,
    dataDir,
    modules,
    categories,
    learningPaths,
    updates,
    portalSearchIndex,
    globalSearchIndex,
    platformStats,
    siteHealthReport,
    capabilityMap,
    careerPaths,
    moduleDependencies,
    v1Roadmap,
    sampleModule,
    sampleModuleSlug: sampleModule?.slug,
    sampleCategoryId: categories[0]?.id,
    samplePathSlug: learningPaths[0]?.slug,
    sampleLessonItem,
    sampleQuestionItem,
  };
}

export function discoverModuleFixtures(moduleDirOrSlug) {
  const moduleDir =
    moduleDirOrSlug === 'module-template'
      ? TEMPLATE_DIR
      : existsSync(moduleDirOrSlug)
        ? moduleDirOrSlug
        : join(WORKSPACE_ROOT, moduleDirOrSlug);

  const dataDir = join(moduleDir, 'public', 'data');
  const meta = readJson(join(dataDir, 'module.json'));
  const courses = readJson(join(dataDir, 'courses.json'));
  const lessons = readJson(join(dataDir, 'lessons.json'));
  const knowledgePoints = readJson(join(dataDir, 'knowledge-points.json')).filter((entry) => entry.editorialStatus !== 'draft');
  const questions = readJson(join(dataDir, 'questions.json'));
  const exams = readJson(join(dataDir, 'exams.json'));
  const cases = readJson(join(dataDir, 'cases.json')).filter((entry) => entry.editorialStatus !== 'draft');
  const routes = readJson(join(dataDir, 'routes.json'));
  const tags = readJson(join(dataDir, 'tags.json')).filter((entry) => entry.editorialStatus !== 'draft');
  const glossary = readJson(join(dataDir, 'glossary.json')).filter((entry) => entry.editorialStatus !== 'draft');
  const faqs = readJson(join(dataDir, 'faqs.json')).filter((entry) => entry.editorialStatus !== 'draft');
  const searchIndex = readJsonOptional(join(dataDir, 'search-index.json'));

  const kpIdSet = new Set(knowledgePoints.map((k) => k.id));

  const lessonWithCode =
    lessons.find((l) => /```(?:js|javascript|ts|typescript)\b/i.test(l.contentMarkdown || '')) || lessons[0];

  const lessonWithHashInFence = lessons.find((l) => {
    const md = l.contentMarkdown || '';
    const fenceBlocks = md.match(/```[\s\S]*?```/g) || [];
    return fenceBlocks.some((block) => /\n#\s+\S+/.test(block));
  });

  const lessonWithValidKps = lessons.find(
    (l) => Array.isArray(l.knowledgePoints) && l.knowledgePoints.some((id) => kpIdSet.has(id))
  );

  const singleQuestion =
    questions.find((q) => q.type === 'single' && Array.isArray(q.options) && q.options.length >= 2) || questions[0];
  const wrongOption =
    singleQuestion && Array.isArray(singleQuestion.options)
      ? singleQuestion.options.find((o) => !(singleQuestion.answer || []).includes(o.key))
      : null;

  const listMap = {
    courses,
    knowledge: knowledgePoints,
    questions,
    cases,
  };

  function matchingTagFor(listName) {
    const items = listMap[listName] || [];
    for (const tag of tags) {
      const matched = items.filter(
        (it) => Array.isArray(it.tags) && (it.tags.includes(tag.name) || it.tags.includes(tag.id))
      );
      if (matched.length > 0 && matched.length < items.length) {
        return { tag, expectedCount: matched.length, totalCount: items.length };
      }
    }
    for (const tag of tags) {
      const matched = items.filter(
        (it) => Array.isArray(it.tags) && (it.tags.includes(tag.name) || it.tags.includes(tag.id))
      );
      if (matched.length > 0) {
        return { tag, expectedCount: matched.length, totalCount: items.length };
      }
    }
    return null;
  }

  const rawTitle = courses[0]?.title || knowledgePoints[0]?.title || meta.title || '课程';
  const searchKeyword = rawTitle.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/)[0] || rawTitle.slice(0, 4);

  return {
    slug: meta.slug,
    moduleDir,
    dataDir,
    meta,
    courses,
    lessons,
    knowledgePoints,
    questions,
    exams,
    cases,
    routes,
    tags,
    glossary,
    faqs,
    searchIndex,
    courseSlug: courses[0]?.slug,
    lessonSlug: lessons[0]?.slug,
    lessonWithCodeSlug: lessonWithCode?.slug,
    lessonWithHashInFenceSlug: lessonWithHashInFence?.slug || null,
    lessonWithValidKpsSlug: lessonWithValidKps?.slug || null,
    kpSlug: knowledgePoints[0]?.slug,
    singleQuestion,
    wrongOptionKey: wrongOption?.key || null,
    examSlug: exams[0]?.slug,
    caseSlug: cases[0]?.slug,
    searchKeyword,
    matchingTagFor,
  };
}
