import fs from 'fs/promises';
import { resolve, join } from 'path';

const workspaceRoot = 'C:/WJH/Wonderful/openskill-galaxy';
const portalIndexDest = 'C:/WJH/Wonderful/openskill-galaxy/00-平台与协作/官网门户/public/data/global-search-index.json';

async function getModuleDirs() {
  const dirs = [];
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const catPath = join(workspaceRoot, entry.name);
    const subEntries = await fs.readdir(catPath, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory() || subEntry.name === '.git' || subEntry.name === 'node_modules' || subEntry.name === '模块模板') continue;
      const modulePath = join(catPath, subEntry.name);
      try {
        const stat = await fs.stat(join(modulePath, 'public/data/module.json'));
        if (stat.isFile()) {
          dirs.push({ category: entry.name, name: subEntry.name, path: modulePath });
        }
      } catch {}
    }
  }
  return dirs;
}

async function main() {
  const moduleDirs = await getModuleDirs();
  console.log(`Scanning content for ${moduleDirs.length} modules to build global search index...\n`);

  const globalIndex = [];

  for (const m of moduleDirs) {
    try {
      // 1. Read module title
      const modJsonPath = join(m.path, 'public/data/module.json');
      const modMeta = JSON.parse(await fs.readFile(modJsonPath, 'utf-8'));
      const mTitle = modMeta.title || m.name;
      const mSlug = m.name.toLowerCase();

      // 2. Read lessons
      const lessonsPath = join(m.path, 'public/data/lessons.json');
      try {
        const lessons = JSON.parse(await fs.readFile(lessonsPath, 'utf-8'));
        lessons.forEach(l => {
          globalIndex.push({
            id: l.id,
            slug: l.slug,
            title: l.title,
            summary: l.summary,
            type: "lesson",
            moduleTitle: mTitle,
            moduleSlug: mSlug
          });
        });
      } catch {}

      // 3. Read questions
      const questionsPath = join(m.path, 'public/data/questions.json');
      try {
        const questions = JSON.parse(await fs.readFile(questionsPath, 'utf-8'));
        questions.forEach(q => {
          globalIndex.push({
            id: q.id,
            slug: q.slug,
            title: q.stem.length > 80 ? q.stem.slice(0, 80) + "..." : q.stem,
            summary: (q.explanation || "").slice(0, 120),
            type: "question",
            moduleTitle: mTitle,
            moduleSlug: mSlug
          });
        });
      } catch {}

    } catch (e) {
      console.warn(`⚠️ Warning: Failed to scan files for index on ${m.name}: ${e.message}`);
    }
  }

  // Ensure directory exists
  await fs.mkdir(resolve(portalIndexDest, '..'), { recursive: true });
  await fs.writeFile(portalIndexDest, JSON.stringify(globalIndex, null, 2), 'utf-8');

  console.log(`\n✅ Global search index updated with ${globalIndex.length} items!`);
  console.log(`Saved to: ${portalIndexDest}`);
}

main().catch(console.error);
