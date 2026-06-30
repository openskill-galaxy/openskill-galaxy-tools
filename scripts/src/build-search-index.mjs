#!/usr/bin/env node
import { readModuleData } from './utils/read-json.mjs';
import { getDataDir } from './utils/path-utils.mjs';
import fs from 'fs/promises';
import { resolve } from 'path';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/build-search-index.mjs <module-path>'); process.exit(1); }

async function main() {
  console.log(`\n=== Build Search Index: ${resolve(modulePath)} ===\n`);

  const load = async (f) => { try { return await readModuleData(modulePath, f); } catch { return []; } };

  const courses = await load('courses');
  const lessons = await load('lessons');
  const kps = await load('knowledge-points');
  const questions = await load('questions');
  const cases = await load('cases');
  const glossary = await load('glossary');
  const faqs = await load('faqs');

  const index = [];

  // Courses
  for (const c of courses) {
    index.push({
      id: c.id, type: 'course', title: c.title,
      summary: c.summary, tags: c.tags,
      url: `/courses/${c.slug}`
    });
  }

  // Lessons (lightweight: title + summary only)
  for (const l of lessons) {
    index.push({
      id: l.id, type: 'lesson', title: l.title,
      summary: l.summary ? l.summary.slice(0, 200) : '',
      tags: [],
      url: `/lessons/${l.id}`
    });
  }

  // Knowledge Points
  for (const k of kps) {
    index.push({
      id: k.id, type: 'knowledge-point', title: k.title,
      summary: k.summary ? k.summary.slice(0, 200) : '',
      tags: k.tags,
      url: `/knowledge/${k.id}`
    });
  }

  // Questions (lightweight: stem truncated + tags)
  for (const q of questions) {
    index.push({
      id: q.id, type: 'question', title: q.stem ? q.stem.slice(0, 120) : '',
      summary: `${q.type} · ${q.difficulty} · ${q.chapter}`,
      tags: q.tags,
      url: `/questions/${q.id}`
    });
  }

  // Cases
  for (const c of cases) {
    index.push({
      id: c.id, type: 'case', title: c.title,
      summary: c.summary ? c.summary.slice(0, 200) : '',
      tags: c.tags,
      url: `/cases/${c.id}`
    });
  }

  // Glossary
  for (const g of glossary) {
    index.push({
      id: g.id, type: 'glossary', title: g.term,
      summary: g.definition ? g.definition.slice(0, 200) : '',
      tags: g.aliases || [],
      url: `/glossary/${g.id}`
    });
  }

  // FAQs
  for (const f of faqs) {
    index.push({
      id: f.id, type: 'faq', title: f.question,
      summary: f.answer ? f.answer.slice(0, 200) : '',
      tags: [f.category],
      url: `/faqs/${f.id}`
    });
  }

  // Write index
  const outPath = resolve(getDataDir(modulePath), 'search-index.json');
  await fs.writeFile(outPath, JSON.stringify(index, null, 2), 'utf8');

  const stat = await fs.stat(outPath);
  console.log(`✅ Search index generated`);
  console.log(`   ${index.length} entries`);
  console.log(`   ${(stat.size / 1024).toFixed(1)} KB`);
  console.log(`   → ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
