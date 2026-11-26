#!/usr/bin/env node
import { isPublished } from './utils/editorial.mjs';
import fs from 'fs/promises';
import { join, resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getPortalDir, getModuleDirs } from './utils/workspace.mjs';
import { validateModule } from './validate-module.mjs';
import { hasFlag, getArgValue } from './utils/cli-utils.mjs';

const execFileAsync = promisify(execFile);
const DATA_FILES = [
  'courses',
  'lessons',
  'knowledge-points',
  'questions',
  'exams',
  'cases',
  'routes',
  'glossary',
  'faqs',
  'tags',
];

async function isGitClean(dir) {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: dir });
    return stdout.trim() === '';
  } catch {
    return false;
  }
}

async function hasOriginRemote(dir) {
  try {
    const { stdout } = await execFileAsync('git', ['remote'], { cwd: dir });
    return stdout.split(/\r?\n/).includes('origin');
  } catch {
    return false;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const strict = hasFlag(argv, '--strict');
  const outputArg = getArgValue(argv, '--output');

  const portalDir = getPortalDir();
  const modules = getModuleDirs();
  const portalModulesRaw = await fs.readFile(join(portalDir, 'public/data/modules.json'), 'utf8');
  const portalModules = JSON.parse(portalModulesRaw);
  const portalSlugs = new Set(portalModules.map((m) => m.slug));

  console.log(
    `Scanning statistics & full validation checks for ${modules.length} modules${dryRun ? ' [DRY RUN]' : ''}...\n`
  );

  const reportModules = [];
  const totals = {
    moduleCount: modules.length,
    totalCourses: 0,
    totalLessons: 0,
    totalKnowledgePoints: 0,
    totalQuestions: 0,
    totalExams: 0,
    totalCases: 0,
    totalRoutes: 0,
    totalTags: 0,
    totalGlossary: 0,
    totalFaqs: 0,
    totalSearchIndexEntries: 0,
    lastUpdated: new Date().toISOString(),
  };

  const issues = [];
  let healthyModuleCount = 0;
  let localGitDirtyCount = 0;

  for (const m of modules) {
    const dataDir = join(m.path, 'public/data');
    let moduleMeta = {};
    try {
      moduleMeta = JSON.parse(await fs.readFile(join(dataDir, 'module.json'), 'utf8'));
    } catch {}

    const counts = {};
    let dataFilesComplete = true;

    for (const file of DATA_FILES) {
      try {
        const list = JSON.parse(await fs.readFile(join(dataDir, `${file}.json`), 'utf8'));
        if (!Array.isArray(list)) throw new Error(`Expected an array in ${file}.json`);
        counts[file] = list.filter(isPublished).length;
      } catch {
        counts[file] = 0;
        dataFilesComplete = false;
      }
    }

    let searchIndexEntries = 0;
    let searchIndexExists = false;
    try {
      const siList = JSON.parse(await fs.readFile(join(dataDir, 'search-index.json'), 'utf8'));
      searchIndexEntries = Array.isArray(siList) ? siList.length : 0;
      searchIndexExists = Array.isArray(siList) && siList.length > 0;
    } catch {}

    let deployYml = false;
    try {
      await fs.stat(join(m.path, '.github/workflows/deploy.yml'));
      deployYml = true;
    } catch {}

    const slug = moduleMeta.slug || m.name;
    const inPortal = portalSlugs.has(slug);
    const gitClean = await isGitClean(m.path);
    const remoteOk = await hasOriginRemote(m.path);
    if (!gitClean) localGitDirtyCount++;

    // Run real unified validation (schema + stats + config + duplicates + references + question audit)
    const validation = await validateModule(m.path);

    const moduleIssues = [...validation.issues];
    if (!deployYml) moduleIssues.push('missing .github/workflows/deploy.yml');
    if (!inPortal) moduleIssues.push('not registered in portal modules.json');

    for (const mi of moduleIssues) {
      issues.push(`${slug}: ${mi}`);
    }

    const contentHealthy =
      validation.valid &&
      dataFilesComplete &&
      searchIndexExists &&
      deployYml &&
      inPortal;

    if (contentHealthy) healthyModuleCount++;

    totals.totalCourses += counts.courses;
    totals.totalLessons += counts.lessons;
    totals.totalKnowledgePoints += counts['knowledge-points'];
    totals.totalQuestions += counts.questions;
    totals.totalExams += counts.exams;
    totals.totalCases += counts.cases;
    totals.totalRoutes += counts.routes;
    totals.totalTags += counts.tags;
    totals.totalGlossary += counts.glossary;
    totals.totalFaqs += counts.faqs;
    totals.totalSearchIndexEntries += searchIndexEntries;

    reportModules.push({
      slug,
      mid: moduleMeta.id || `mod-${slug.replace(/^module-/, '')}`,
      title: moduleMeta.title || m.name,
      exists: true,
      gitClean,
      remoteOk,
      localStatus: {
        gitClean,
        remoteOk,
      },
      deployYml,
      dataFilesComplete,
      searchIndexExists,
      inPortal,
      contentHealthy,
      checks: {
        schemaErrors: validation.schemaErrors,
        statsMismatch: validation.statsMismatchCount,
        configErrors: validation.configErrorCount,
        duplicateIds: validation.duplicateIds,
        duplicateSlugs: validation.duplicateSlugs,
        emptySlugs: validation.emptySlugs,
        tagSlugWarnings: validation.tagSlugWarnings,
        missingRefs: validation.missingRefs,
        questionProblems: validation.questionProblems,
      },
      moduleIssues,
      pagesUrl: `https://openskill-galaxy.github.io/${slug}/`,
      counts: {
        courses: counts.courses,
        lessons: counts.lessons,
        knowledgePoints: counts['knowledge-points'],
        questions: counts.questions,
        exams: counts.exams,
        cases: counts.cases,
        routes: counts.routes,
        tags: counts.tags,
        glossary: counts.glossary,
        faqs: counts.faqs,
        searchIndexEntries,
      },
    });
  }

  reportModules.sort((a, b) => a.slug.localeCompare(b.slug));

  const generatedAt = new Date().toISOString();
  const dateStr = generatedAt.slice(0, 10);

  const healthReport = {
    platformName: 'OpenSkill Galaxy',
    generatedAt,
    moduleCount: reportModules.length,
    summary: {
      healthyModules: healthyModuleCount,
      unhealthyModules: reportModules.length - healthyModuleCount,
      totalIssues: issues.length,
      localGitDirtyCount,
    },
    totals,
    modules: reportModules,
    issues: issues.length ? issues : ['No issues found.'],
  };

  const categories = JSON.parse(await fs.readFile(join(portalDir, 'public/data/categories.json'), 'utf8'));
  const mdLines = [
    '# OpenSkill Galaxy 全站健康报告',
    '',
    `**生成时间：** ${dateStr}`,
    `**内容健康模块：** ${healthyModuleCount} / ${reportModules.length}（总问题数：${issues.length}，本地未提交仓库数：${localGitDirtyCount}）`,
    '',
    '## 一、总概况',
    '',
    '| 项目 | 数值 |',
    '|------|------|',
    `| 总模块数 | ${totals.moduleCount} |`,
    `| 内容健康模块数 | ${healthyModuleCount} |`,
    `| 总分类数 | ${categories.length} |`,
    `| 总课程数 | ${totals.totalCourses} |`,
    `| 总课时数 | ${totals.totalLessons} |`,
    `| 总知识点数 | ${totals.totalKnowledgePoints} |`,
    `| 总题目数 | ${totals.totalQuestions} |`,
    `| 总试卷数 | ${totals.totalExams} |`,
    `| 总案例数 | ${totals.totalCases} |`,
    `| 总路线数 | ${totals.totalRoutes} |`,
    `| 总术语数 | ${totals.totalGlossary} |`,
    `| 总 FAQ 数 | ${totals.totalFaqs} |`,
    `| 总标签数 | ${totals.totalTags} |`,
    `| 搜索索引条目数 | ${totals.totalSearchIndexEntries} |`,
    '',
    '## 二、各模块数据与健康状态',
    '',
    '| # | 模块 | 课程 | 课时 | 知识点 | 题目 | 试卷 | 案例 | 术语 | Deploy | 内容健康 | 引用完整 | Schema | Slug唯一 | 已入 Portal |',
    '|---|------|------|------|--------|------|------|------|------|--------|----------|----------|--------|----------|-------------|',
  ];

  reportModules.forEach((m, idx) => {
    const c = m.counts;
    const ch = m.checks;
    mdLines.push(
      `| ${idx + 1} | [${m.title}](${m.pagesUrl}) | ${c.courses} | ${c.lessons} | ${c.knowledgePoints} | ${c.questions} | ${c.exams} | ${c.cases} | ${c.glossary} | ${m.deployYml ? '✅' : '❌'} | ${m.contentHealthy ? '✅' : '❌'} | ${ch.missingRefs === 0 ? '✅' : `❌ (${ch.missingRefs})`} | ${ch.schemaErrors === 0 ? '✅' : `❌ (${ch.schemaErrors})`} | ${ch.duplicateSlugs === 0 ? '✅' : `❌ (${ch.duplicateSlugs})`} | ${m.inPortal ? '✅' : '❌'} |`
    );
  });

  mdLines.push('', '## 三、发现的问题', '');
  for (const item of healthReport.issues) {
    mdLines.push(`- ${item}`);
  }
  mdLines.push('', '*报告由 OpenSkill Galaxy 自动化工具生成*', '');

  console.log(`Modules scanned: ${reportModules.length}`);
  console.log(`Content healthy: ${healthyModuleCount}/${reportModules.length}`);
  console.log(`Issues found:    ${issues.length}`);
  console.log(`Local git dirty: ${localGitDirtyCount} (informational only)`);

  if (issues.length > 0) {
    console.log('\nFirst 20 issues:');
    for (const iss of issues.slice(0, 20)) console.log(`  - ${iss}`);
  }

  if (!dryRun) {
    let reportJsonPath;
    let statsPath;
    let reportMdPath;

    if (outputArg) {
      const outDir = resolve(outputArg);
      await fs.mkdir(outDir, { recursive: true });
      reportJsonPath = join(outDir, 'site-health-report.json');
      statsPath = join(outDir, 'platform-stats.json');
      reportMdPath = join(outDir, 'site-health-report.md');
    } else {
      reportJsonPath = join(portalDir, 'public/data/site-health-report.json');
      statsPath = join(portalDir, 'public/data/platform-stats.json');
      reportMdPath = join(portalDir, 'public/reports/site-health-report.md');
      await fs.mkdir(join(portalDir, 'public/reports'), { recursive: true });
    }

    await fs.writeFile(reportJsonPath, JSON.stringify(healthReport, null, 2) + '\n', 'utf8');
    await fs.writeFile(statsPath, JSON.stringify(totals, null, 2) + '\n', 'utf8');
    await fs.writeFile(reportMdPath, mdLines.join('\n'), 'utf8');

    console.log(`\n✅ Wrote outputs:`);
    console.log(`   → ${statsPath}`);
    console.log(`   → ${reportJsonPath}`);
    console.log(`   → ${reportMdPath}`);
  } else {
    console.log('\nℹ️  Dry run: no files written.');
  }

  if (strict && issues.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
