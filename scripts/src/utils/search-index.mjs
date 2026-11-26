import { isPublished } from './editorial.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

function loadArray(filePath) {
  const records = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(records)) throw new Error(`Expected an array in ${filePath}`);
  return records.filter(isPublished);
}

export function buildModuleSearchIndex(dataDir) {
  const entries = [];

  for (const c of loadArray(join(dataDir, 'courses.json'))) {
    entries.push({
      type: 'course',
      id: c.id || '',
      title: c.title || '',
      summary: (c.summary || c.description || '').slice(0, 160),
      url: `/courses/${c.slug || c.id || ''}`,
      tags: Array.isArray(c.tags) ? c.tags : [],
    });
  }

  for (const l of loadArray(join(dataDir, 'lessons.json'))) {
    entries.push({
      type: 'lesson',
      id: l.id || '',
      title: l.title || '',
      summary: (l.summary || '').slice(0, 160),
      url: `/lessons/${l.slug || l.id || ''}`,
      tags: Array.isArray(l.tags) ? l.tags : [],
    });
  }

  for (const k of loadArray(join(dataDir, 'knowledge-points.json'))) {
    entries.push({
      type: 'knowledge',
      id: k.id || '',
      title: k.title || '',
      summary: (k.summary || '').slice(0, 160),
      url: `/knowledge/${k.slug || k.id || ''}`,
      tags: Array.isArray(k.tags) ? k.tags : [],
    });
  }

  for (const q of loadArray(join(dataDir, 'questions.json'))) {
    const stem = q.stem || '';
    entries.push({
      type: 'question',
      id: q.id || '',
      title: stem.length > 60 ? `${stem.slice(0, 60)}…` : stem,
      summary: (q.explanation || q.analysis || '').slice(0, 120),
      url: `/questions/${q.slug || q.id || ''}`,
      tags: Array.isArray(q.tags) ? q.tags : [],
    });
  }

  for (const cs of loadArray(join(dataDir, 'cases.json'))) {
    entries.push({
      type: 'case',
      id: cs.id || '',
      title: cs.title || '',
      summary: (cs.summary || cs.description || '').slice(0, 160),
      url: `/cases/${cs.slug || cs.id || ''}`,
      tags: Array.isArray(cs.tags) ? cs.tags : [],
    });
  }

  for (const r of loadArray(join(dataDir, 'routes.json'))) {
    entries.push({
      type: 'route',
      id: r.id || '',
      title: r.title || '',
      summary: (r.summary || r.description || '').slice(0, 160),
      url: `/routes#${r.slug || r.id || ''}`,
      tags: [],
    });
  }

  for (const g of loadArray(join(dataDir, 'glossary.json'))) {
    entries.push({
      type: 'glossary',
      id: g.id || '',
      title: g.term || g.title || '',
      summary: (g.definition || '').slice(0, 160),
      url: `/knowledge#glossary-${g.id || ''}`,
      tags: Array.isArray(g.aliases) ? g.aliases : [],
    });
  }

  for (const fq of loadArray(join(dataDir, 'faqs.json'))) {
    entries.push({
      type: 'faq',
      id: fq.id || '',
      title: fq.question || '',
      summary: (fq.answer || '').slice(0, 120),
      url: `/faq#${fq.id || ''}`,
      tags: fq.category ? [fq.category] : [],
    });
  }

  return entries;
}

export function writeModuleSearchIndex(modulePath, { pretty = false, dryRun = false } = {}) {
  const dataDir = resolve(modulePath, 'public', 'data');
  const outPath = join(dataDir, 'search-index.json');
  const entries = buildModuleSearchIndex(dataDir);
  const serialized = pretty ? JSON.stringify(entries, null, 2) + '\n' : JSON.stringify(entries);
  if (!dryRun) {
    writeFileSync(outPath, serialized, 'utf8');
  }
  return {
    outPath,
    entries,
    bytes: Buffer.byteLength(serialized, 'utf8'),
  };
}
