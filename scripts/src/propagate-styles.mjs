import fs from 'fs/promises';
import { resolve, join } from 'path';

const workspaceRoot = 'C:/WJH/Wonderful/openskill-galaxy';
const templatePath = 'C:/WJH/Wonderful/openskill-galaxy/00-平台与协作/模块模板';

const filesToCopy = [
  '.github/workflows/deploy.yml',
  'index.html',
  'public/sw.js',
  'public/manifest.json',
  'src/styles/index.css',
  'src/main.tsx',
  'src/App.tsx',
  'src/types.ts',
  'src/components/Layout.tsx',
  'package.json',
  'src/services/appwrite.ts',
  'src/config/constants.ts',
  'src/hooks/useTheme.ts',
  'src/hooks/useAudioSynth.ts',
  'src/hooks/useAppwriteSync.ts',
  'src/components/AppwriteModal.tsx',
  'src/components/Header.tsx',
  'src/components/SearchBox.tsx',
  'src/components/ErrorBoundary.tsx',
  'src/components/CosmicBackground.tsx',
  'src/components/CodePlayground.tsx',
  'src/components/LessonTOC.tsx',
  'src/components/CodeJudge.tsx',
  'src/components/PomodoroTimer.tsx',
  'src/components/PersonalNotes.tsx',
  'src/components/CertificateModal.tsx',
  'src/components/StudyAnalytics.tsx',
  'src/components/SpeechReader.tsx',
  'src/components/WeakPointDiagnostics.tsx',
  'src/components/ExportDataModal.tsx',
  'src/components/AchievementsModal.tsx',
  'src/components/LessonContentSearch.tsx',
  'src/components/RadarChart.tsx',
  'src/components/KnowledgeGraph.tsx',
  'src/components/QuestionPlayer.tsx',
  'src/components/ExamPlayer.tsx',
  'src/pages/FavoritesPage.tsx',
  'src/pages/ExamResultPage.tsx',
  'src/pages/HomePage.tsx',
  'src/pages/LessonPage.tsx',
  'src/pages/WrongQuestionsPage.tsx',
  'src/utils/srs.ts',
  'src/search/search.ts',
  'src/utils/markdown.tsx',
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
