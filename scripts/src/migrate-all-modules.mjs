import fs from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = 'C:/WJH/Wonderful/openskill-galaxy';
const DATA_FILES = ['courses', 'lessons', 'knowledge-points', 'questions', 'exams', 'cases', 'routes', 'glossary', 'faqs', 'tags'];

function slugify(text) {
  if (!text) return 'slug';
  return text.toString().toLowerCase().trim()
    .replace(/[\s，。、：；（）\-+]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getModuleDirs() {
  const dirs = [];
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const catPath = join(workspaceRoot, entry.name);
    const subEntries = await fs.readdir(catPath, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory() || subEntry.name === '.git' || subEntry.name === 'node_modules') continue;
      const modulePath = join(catPath, subEntry.name);
      try {
        const stat = await fs.stat(join(modulePath, 'public/data/module.json'));
        if (stat.isFile() && subEntry.name !== '模块模板') {
          dirs.push({ category: entry.name, name: subEntry.name, path: modulePath });
        }
      } catch {}
    }
  }
  return dirs;
}

function parseWrongReason(wrongReason) {
  if (!wrongReason) return {};
  if (typeof wrongReason === 'object' && !Array.isArray(wrongReason)) {
    return wrongReason;
  }
  if (typeof wrongReason === 'string') {
    try {
      const parsed = JSON.parse(wrongReason);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {}
    return { "ALL": wrongReason };
  }
  return {};
}

function normalizeDifficulty(difficulty) {
  if (!difficulty) return 'medium';
  const d = difficulty.toString().toLowerCase().trim();
  if (d === 'easy' || d === 'beginner') return 'easy';
  if (d === 'medium' || d === 'intermediate') return 'medium';
  if (d === 'hard' || d === 'advanced') return 'hard';
  return 'medium';
}

async function migrateModule(m) {
  const dataDir = join(m.path, 'public/data');
  const data = {};
  
  // 1. Read files
  for (const file of DATA_FILES) {
    const filePath = join(dataDir, `${file}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      data[file] = JSON.parse(raw);
    } catch {
      data[file] = [];
    }
  }

  // 2. Migrate courses.json
  if (Array.isArray(data.courses)) {
    data.courses = data.courses.map((c, index) => {
      const lessons = c.lessons || c.lessonIds || [];
      const summary = c.summary || c.description || c.title || '';
      const description = c.description || c.summary || c.title || '';
      return {
        ...c,
        lessons,
        lessonIds: lessons,
        summary,
        description,
        slug: c.slug || slugify(c.title) || c.id || `course-${index + 1}`,
        difficulty: normalizeDifficulty(c.difficulty || c.diff),
        estimatedHours: c.estimatedHours || 10,
        order: typeof c.order === 'number' ? c.order : index + 1,
        tags: Array.isArray(c.tags) ? c.tags : []
      };
    });
  }

  // 3. Migrate lessons.json
  if (Array.isArray(data.lessons)) {
    data.lessons = data.lessons.map((l, index) => {
      const contentMarkdown = l.contentMarkdown || l.content || `# ${l.title || 'Lesson'}\n\n讲义内容`;
      const content = l.content || l.contentMarkdown || `# ${l.title || 'Lesson'}\n\n讲义内容`;
      const knowledgePoints = l.knowledgePoints || l.knowledgePointIds || [];
      const estimatedMinutes = l.estimatedMinutes || l.durationMinutes || l.estimated_time || 30;
      return {
        ...l,
        contentMarkdown,
        content,
        knowledgePoints,
        knowledgePointIds: knowledgePoints,
        estimatedMinutes,
        slug: l.slug || slugify(l.title) || l.id || `lesson-${index + 1}`,
        summary: l.summary || l.title || '',
        order: typeof l.order === 'number' ? l.order : index + 1,
        courseId: l.courseId || ''
      };
    });
  }

  // 4. Migrate knowledge-points.json
  if (Array.isArray(data['knowledge-points'])) {
    data['knowledge-points'] = data['knowledge-points'].map((k, index) => {
      const title = k.title || k.name || '';
      const name = k.name || k.title || '';
      const summary = k.summary || k.description || '';
      const description = k.description || k.summary || '';
      const relatedQuestions = k.relatedQuestions || k.relatedQuestionIds || [];
      const relatedCases = k.relatedCases || k.relatedCaseIds || [];
      const glossary = k.glossary || k.relatedGlossaryIds || [];
      const contentMarkdown = k.contentMarkdown || `# ${title}\n\n${summary || '概念介绍'}`;
      return {
        ...k,
        title,
        name,
        summary,
        description,
        relatedQuestions,
        relatedQuestionIds: relatedQuestions,
        relatedCases,
        relatedCaseIds: relatedCases,
        glossary,
        relatedGlossaryIds: glossary,
        contentMarkdown,
        slug: k.slug || slugify(title) || k.id || `kp-${index + 1}`,
        difficulty: normalizeDifficulty(k.difficulty),
        tags: Array.isArray(k.tags) ? k.tags : []
      };
    });
  }

  // 5. Migrate questions.json
  if (Array.isArray(data.questions)) {
    data.questions = data.questions.map((q, index) => {
      // Map question type
      let type = 'short';
      const rawType = q.type || '';
      if (rawType.includes('single') || rawType === 'single_choice') type = 'single';
      else if (rawType.includes('multiple') || rawType === 'multiple_choice') type = 'multiple';
      else if (rawType.includes('judge') || rawType.includes('true_false') || rawType === 'true_false') type = 'judge';
      else if (rawType.includes('short') || rawType === 'short_answer') type = 'short';

      // Map options
      let options = Array.isArray(q.options) ? q.options : [];
      options = options.map(o => {
        const key = o.key || o.label || '';
        const label = o.label || o.key || '';
        return { key, label, text: o.text || '' };
      });

      // Map answer
      let answer = [];
      if (Array.isArray(q.answer)) {
        answer = q.answer.map(String);
      } else if (q.answer !== undefined && q.answer !== null) {
        answer = [String(q.answer)];
      }

      // Map explanation/analysis
      const analysis = q.analysis || q.explanation || '正确答案说明。';
      const explanation = q.explanation || q.analysis || '正确答案说明。';

      // Map estimated time
      const estimatedMinutes = q.estimatedMinutes || q.estimated_time || 2;
      const estimated_time = q.estimated_time || q.estimatedMinutes || 2;

      // Sync knowledge points
      const knowledgePoints = q.knowledgePoints || q.knowledge_points || [];

      return {
        ...q,
        type,
        options,
        answer,
        analysis,
        explanation,
        estimatedMinutes,
        estimated_time,
        knowledgePoints,
        knowledge_points: knowledgePoints,
        slug: q.slug || q.id || `q-${index + 1}`,
        difficulty: normalizeDifficulty(q.difficulty),
        tags: Array.isArray(q.tags) ? q.tags : [],
        wrong_reason: parseWrongReason(q.wrong_reason),
        stem: q.stem || '题目题干说明。',
        chapter: q.chapter || ''
      };
    });
  }

  // 6. Migrate exams.json
  if (Array.isArray(data.exams)) {
    data.exams = data.exams.map((e, index) => {
      const timeLimitMinutes = e.timeLimitMinutes || e.timeLimit || 60;
      const summary = e.summary || e.description || e.title || '';
      return {
        ...e,
        timeLimitMinutes,
        timeLimit: timeLimitMinutes,
        summary,
        description: summary,
        slug: e.slug || slugify(e.title) || e.id || `exam-${index + 1}`,
        passingScore: e.passingScore || 60,
        questionIds: Array.isArray(e.questionIds) ? e.questionIds : [],
        difficulty: normalizeDifficulty(e.difficulty),
        title: e.title || e.id
      };
    });
  }

  // 7. Migrate cases.json
  if (Array.isArray(data.cases)) {
    data.cases = data.cases.map((c, index) => {
      const summary = c.summary || c.description || c.title || '';
      const estimatedMinutes = c.estimatedMinutes || c.duration || 30;
      const knowledgePoints = c.knowledgePoints || c.knowledgePointIds || [];
      
      let backgroundMarkdown = c.backgroundMarkdown || '';
      let tasksMarkdown = c.tasksMarkdown || '';
      let referenceMarkdown = c.referenceMarkdown || '';
      
      if (!backgroundMarkdown && !tasksMarkdown && !referenceMarkdown && Array.isArray(c.steps)) {
        backgroundMarkdown = `# 案例背景\n\n${summary || '关于本案例背景介绍。'}`;
        tasksMarkdown = `# 实战任务\n\n` + c.steps.map(s => `${s.order}. **${s.title}**: ${s.description}`).join('\n');
        referenceMarkdown = `# 参考方案\n\n请参考具体实现步骤完成任务。`;
      }
      
      const cleanedCase = {
        ...c,
        summary,
        description: summary,
        estimatedMinutes,
        duration: estimatedMinutes,
        knowledgePoints,
        knowledgePointIds: knowledgePoints,
        backgroundMarkdown,
        tasksMarkdown,
        referenceMarkdown,
        slug: c.slug || slugify(c.title) || c.id || `case-${index + 1}`,
        difficulty: normalizeDifficulty(c.difficulty),
        tags: Array.isArray(c.tags) ? c.tags : []
      };
      
      delete cleanedCase.steps;
      return cleanedCase;
    });
  }

  // 8. Migrate tags.json
  if (Array.isArray(data.tags)) {
    data.tags = data.tags.map((t, index) => {
      const name = t.name || t.slug || t.id;
      const slug = t.slug || slugify(name) || t.id;
      return {
        ...t,
        name,
        slug,
        id: t.id || `tag-${index + 1}`
      };
    });
  }

  // 9. Migrate routes.json
  if (Array.isArray(data.routes)) {
    data.routes = data.routes.map((r, index) => {
      const summary = r.summary || r.description || r.title || '';
      return {
        ...r,
        summary,
        description: summary,
        slug: r.slug || slugify(r.title) || r.id || `route-${index + 1}`
      };
    });
  }

  // 10. Generate search-index.json
  const searchIndex = [];
  const addIndex = (id, type, title, content, slug, tags) => {
    searchIndex.push({
      id,
      type,
      title: title || '',
      content: content || '',
      url: type === 'course' ? `/courses/${slug}` :
           type === 'lesson' ? `/lessons/${slug}` :
           type === 'knowledge' ? `/knowledge/${slug}` :
           type === 'question' ? `/questions/${slug}` :
           type === 'case' ? `/cases/${slug}` :
           type === 'route' ? `/routes` :
           type === 'faq' ? `/faq` :
           type === 'glossary' ? `/glossary` : '',
      tags: tags || []
    });
  };

  if (Array.isArray(data.courses)) {
    data.courses.forEach(c => addIndex(c.id, 'course', c.title, c.summary, c.slug, c.tags));
  }
  if (Array.isArray(data.lessons)) {
    data.lessons.forEach(l => addIndex(l.id, 'lesson', l.title, l.summary, l.slug, l.tags));
  }
  if (Array.isArray(data['knowledge-points'])) {
    data['knowledge-points'].forEach(k => addIndex(k.id, 'knowledge', k.title, k.summary, k.slug, k.tags));
  }
  if (Array.isArray(data.questions)) {
    data.questions.forEach(q => addIndex(q.id, 'question', q.stem.substring(0, 100), q.analysis, q.slug, q.tags));
  }
  if (Array.isArray(data.cases)) {
    data.cases.forEach(c => addIndex(c.id, 'case', c.title, c.summary, c.slug, c.tags));
  }
  if (Array.isArray(data.routes)) {
    data.routes.forEach(r => addIndex(r.id, 'route', r.title, r.summary, r.slug, []));
  }
  if (Array.isArray(data.glossary)) {
    data.glossary.forEach(g => addIndex(g.id, 'glossary', g.term, g.definition, '', g.tags));
  }
  if (Array.isArray(data.faqs)) {
    data.faqs.forEach(f => addIndex(f.id, 'faq', f.question, f.answer, '', f.tags));
  }

  data['search-index'] = searchIndex;

  for (const file of DATA_FILES) {
    await fs.writeFile(join(dataDir, `${file}.json`), JSON.stringify(data[file], null, 2), 'utf8');
  }
  await fs.writeFile(join(dataDir, `search-index.json`), JSON.stringify(searchIndex, null, 2), 'utf8');
}

async function main() {
  const modules = await getModuleDirs();
  console.log(`Starting migration for ${modules.length} modules...\n`);
  
  let successCount = 0;
  for (const m of modules) {
    try {
      await migrateModule(m);
      console.log(`✅ Normalized ${m.category}/${m.name}`);
      successCount++;
    } catch (e) {
      console.error(`❌ Failed migrating ${m.category}/${m.name}:`, e);
    }
  }
  
  console.log(`\n=== Migration Completed ===`);
  console.log(`Successfully migrated: ${successCount} / ${modules.length}`);
}

main().catch(console.error);
