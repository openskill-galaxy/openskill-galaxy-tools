// 1) Recompute module.json "stats" from actual data file counts (all modules incl. template).
// 2) Strip fabricated volume claims ("170 课时，…30 学习路线。") from portal modules.json summaries.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = 'C:/WJH/Wonderful/openskill-galaxy';
const FILES = ['courses', 'lessons', 'knowledge-points', 'questions', 'cases', 'exams', 'routes', 'glossary', 'faqs', 'tags'];
const KEY = { 'knowledge-points': 'knowledgePoints' };

for (const cat of readdirSync(ROOT)) {
  const catPath = join(ROOT, cat);
  if (!statSync(catPath).isDirectory()) continue;
  for (const m of readdirSync(catPath)) {
    const dataDir = join(catPath, m, 'public', 'data');
    const mjPath = join(dataDir, 'module.json');
    if (!existsSync(mjPath)) continue;
    const mj = JSON.parse(readFileSync(mjPath, 'utf8'));
    const stats = {};
    for (const f of FILES) {
      const p = join(dataDir, `${f}.json`);
      let n = 0;
      if (existsSync(p)) {
        try { const arr = JSON.parse(readFileSync(p, 'utf8')); n = Array.isArray(arr) ? arr.length : 0; } catch {}
      }
      stats[KEY[f] || f] = n;
    }
    mj.stats = stats;
    writeFileSync(mjPath, JSON.stringify(mj, null, 2) + '\n', 'utf8');
  }
}
console.log('module.json stats recomputed');

// Portal summaries: drop the fabricated trailing volume sentence
const portalModules = join(ROOT, '00-平台与协作', '官网门户', 'public', 'data', 'modules.json');
const mods = JSON.parse(readFileSync(portalModules, 'utf8'));
let stripped = 0;
for (const m of mods) {
  if (typeof m.summary !== 'string') continue;
  const next = m.summary.replace(/\s*\d+\s*(?:门课程|课时)[^。]*。/gu, '').trim();
  if (next !== m.summary) { m.summary = next; stripped++; }
}
writeFileSync(portalModules, JSON.stringify(mods, null, 2) + '\n', 'utf8');
console.log(`portal summaries stripped: ${stripped}`);
