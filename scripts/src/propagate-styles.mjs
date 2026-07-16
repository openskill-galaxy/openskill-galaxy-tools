import fs from 'fs/promises';
import { resolve, join } from 'path';

const workspaceRoot = 'C:/WJH/Wonderful/openskill-galaxy';
const templatePath = 'C:/WJH/Wonderful/openskill-galaxy/00-平台与协作/模块模板';

const filesToCopy = [
  'index.html',
  'public/sw.js',
  'src/styles/index.css',
  'src/components/Layout.tsx',
  'src/components/Header.tsx',
  'src/components/QuestionPlayer.tsx',
  'tailwind.config.js'
];

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

async function copyFile(src, dest) {
  await fs.mkdir(resolve(dest, '..'), { recursive: true });
  await fs.copyFile(src, dest);
}

async function main() {
  const modules = await getModuleDirs();
  console.log(`Propagating premium styles to ${modules.length} modules...\n`);
  
  let successCount = 0;
  for (const m of modules) {
    try {
      for (const relPath of filesToCopy) {
        const src = join(templatePath, relPath);
        const dest = join(m.path, relPath);
        await copyFile(src, dest);
      }
      console.log(`✅ Propagated styles to ${m.category}/${m.name}`);
      successCount++;
    } catch (e) {
      console.error(`❌ Failed to propagate to ${m.category}/${m.name}:`, e.message);
    }
  }
  
  console.log(`\n=== Style Propagation Completed ===`);
  console.log(`Successfully updated: ${successCount} / ${modules.length}`);
}

main().catch(console.error);
