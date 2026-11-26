#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { join, resolve } from 'path';
import { getTemplateDir, getToolsDir } from './utils/workspace.mjs';
import { hasFlag, getArgValue } from './utils/cli-utils.mjs';

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const outputArg = getArgValue(argv, '--output');
  const templateDir = getTemplateDir();
  const targetPath = outputArg ? resolve(outputArg) : join(getToolsDir(), 'CHANGELOG.md');

  console.log(`🌌 OpenSkill Galaxy • 自动化 Changelog 日志生成器${dryRun ? ' [DRY RUN]' : ''}\n`);

  let rawLogs = '';
  try {
    rawLogs = execSync('git log -n 30 --pretty=format:"%h | %s | %an | %ad" --date=short', {
      cwd: templateDir,
      encoding: 'utf-8',
    });
  } catch (e) {
    console.error('无法提取 git log 数据:', e.message);
    process.exit(1);
  }

  const lines = rawLogs.trim().split('\n');
  let mdContent = `# OpenSkill Galaxy • 模板工程 Changelog 历史记录\n\n`;
  mdContent += `> 自动生成时间: ${new Date().toISOString()}\n\n`;
  mdContent += `| Commit Hash | Commit Description | Author | Date |\n`;
  mdContent += `| :--- | :--- | :--- | :--- |\n`;

  lines.forEach((line) => {
    const [hash, msg, author, date] = line.split(' | ');
    if (hash && msg) {
      mdContent += `| \`${hash}\` | ${msg.replace(/\|/g, '-')} | ${author || 'Antigravity Agent'} | ${date || ''} |\n`;
    }
  });

  if (dryRun) {
    console.log(`ℹ️  Dry run: would write ${lines.length} entries to ${targetPath}`);
    return;
  }

  await fs.writeFile(targetPath, mdContent, 'utf-8');
  console.log(`✅ CHANGELOG.md 已成功生成于: ${targetPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
