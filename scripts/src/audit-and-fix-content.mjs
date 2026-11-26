#!/usr/bin/env node
import fs from 'fs/promises';
import { join, resolve, basename } from 'path';
import { getModuleDirs } from './utils/workspace.mjs';
import { hasFlag, getPositionalArgs } from './utils/cli-utils.mjs';

const VALID_DIFFS = new Set(['easy', 'medium', 'hard']);

async function auditModuleContent(dirPath, moduleName, { fix = false } = {}) {
  const dataDir = join(dirPath, 'public', 'data');
  const questionsPath = join(dataDir, 'questions.json');
  const lessonsPath = join(dataDir, 'lessons.json');

  const issues = [];
  const warnings = [];
  let fixedQuestions = 0;

  let questions = [];
  try {
    questions = JSON.parse(await fs.readFile(questionsPath, 'utf-8'));
    if (!Array.isArray(questions)) throw new Error('questions.json is not an array');
  } catch (err) {
    return {
      module: moduleName,
      issues: [`Cannot read questions.json: ${err.message}`],
      warnings,
      fixedQuestions: 0,
      wroteFiles: 0,
    };
  }

  let qModified = false;
  for (const q of questions) {
    const qid = q?.id || '<unknown>';
    const optionKeys = Array.isArray(q.options) ? q.options.map((o) => o?.key).filter(Boolean) : [];

    if (q.type === 'single' || q.type === 'multiple') {
      if (optionKeys.length < 2) {
        issues.push(`question[${qid}]: ${q.type} has fewer than 2 valid option keys`);
      }
      const answers = Array.isArray(q.answer) ? q.answer : [];
      if (answers.length === 0) {
        issues.push(`question[${qid}]: ${q.type} has empty answer`);
      }
      for (const ansKey of answers) {
        if (!optionKeys.includes(ansKey)) {
          issues.push(`question[${qid}]: answer '${ansKey}' not in option keys [${optionKeys.join(', ')}]`);
        }
      }
      if (q.type === 'single' && answers.length !== 1) {
        issues.push(`question[${qid}]: single question must have 1 answer (got ${answers.length})`);
      }
    } else if (q.type === 'judge') {
      const answers = Array.isArray(q.answer) ? q.answer : [];
      if (answers.length !== 1 || !answers.every((a) => a === 'T' || a === 'F')) {
        issues.push(`question[${qid}]: judge answer must be ['T'] or ['F']`);
      }
    }

    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length < 10) {
      warnings.push(`question[${qid}]: missing or short explanation (<10 chars)`);
    }

    if (!VALID_DIFFS.has(q.difficulty)) {
      if (fix) {
        q.difficulty = 'medium';
        qModified = true;
        fixedQuestions++;
      } else {
        issues.push(`question[${qid}]: invalid difficulty '${q.difficulty}'`);
      }
    }
  }

  let wroteFiles = 0;
  if (fix && qModified) {
    await fs.writeFile(questionsPath, JSON.stringify(questions, null, 2) + '\n', 'utf-8');
    wroteFiles++;
  }

  let lessons = [];
  try {
    lessons = JSON.parse(await fs.readFile(lessonsPath, 'utf-8'));
    if (!Array.isArray(lessons)) throw new Error('lessons.json is not an array');
  } catch (err) {
    issues.push(`Cannot read lessons.json: ${err.message}`);
    return { module: moduleName, issues, warnings, fixedQuestions, wroteFiles };
  }

  for (const l of lessons) {
    const lid = l?.id || '<unknown>';
    if (!l.contentMarkdown || typeof l.contentMarkdown !== 'string' || l.contentMarkdown.trim().length < 50) {
      warnings.push(`lesson[${lid}]: short or empty contentMarkdown (<50 chars)`);
    }
    if (!l.title || typeof l.title !== 'string' || l.title.trim() === '') {
      issues.push(`lesson[${lid}]: missing title`);
    }
  }

  return {
    module: moduleName,
    issues,
    warnings,
    fixedQuestions,
    wroteFiles,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const fix = hasFlag(argv, '--fix');
  const includeTemplate = hasFlag(argv, '--include-template');
  const positional = getPositionalArgs(argv);

  let targets;
  if (positional.length > 0) {
    targets = positional.map((p) => ({ name: basename(resolve(p)), path: resolve(p) }));
  } else {
    targets = getModuleDirs(undefined, { includeTemplate }).map((m) => ({ name: m.name, path: m.path }));
  }

  console.log(
    `🔍 Content Audit across ${targets.length} module(s) (${fix ? 'FIX mode: safe fixes only' : 'READ-ONLY audit mode'})...\n`
  );

  let totalIssues = 0;
  let totalWarnings = 0;
  let totalFixed = 0;
  let totalFilesWritten = 0;

  for (const t of targets) {
    const res = await auditModuleContent(t.path, t.name, { fix });
    totalIssues += res.issues.length;
    totalWarnings += res.warnings.length;
    totalFixed += res.fixedQuestions;
    totalFilesWritten += res.wroteFiles;

    if (res.issues.length > 0) {
      console.log(`❌ ${t.name}: ${res.issues.length} issue(s), ${res.warnings.length} warning(s)`);
      for (const iss of res.issues.slice(0, 10)) console.log(`   - ${iss}`);
    } else if (res.warnings.length > 0) {
      console.log(`⚠️  ${t.name}: 0 issues, ${res.warnings.length} warning(s)`);
    }
  }

  console.log(`\n=== Content Audit Summary ===`);
  console.log(`Modules audited: ${targets.length}`);
  console.log(`Blocking issues: ${totalIssues}`);
  console.log(`Warnings:        ${totalWarnings}`);
  console.log(`Files written:   ${totalFilesWritten} (fixed items: ${totalFixed})`);

  if (totalIssues > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
