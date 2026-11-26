#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { getModuleDirs } from './utils/workspace.mjs';
import { hasFlag } from './utils/cli-utils.mjs';

export const SCHEMA_QUESTION_TYPES = new Set([
  'single',
  'multiple',
  'judge',
  'short',
  'fill',
  'calculation',
  'case_analysis',
]);

export const UI_SUPPORTED_QUESTION_TYPES = new Set([
  'single',
  'multiple',
  'judge',
  'short',
]);

export function auditModuleQuestions(modulePath) {
  const absPath = resolve(modulePath);
  const m = basename(absPath);
  const dd = join(absPath, 'public', 'data');
  const problems = [];
  const warnings = [];
  const typeCounts = {};

  let qs;
  let ex;
  try {
    qs = JSON.parse(readFileSync(join(dd, 'questions.json'), 'utf8'));
    if (!Array.isArray(qs)) throw new Error('questions.json is not an array');
  } catch (e) {
    problems.push(`${m}: questions.json parse error (${e.message})`);
    return { module: m, path: absPath, questionCount: 0, examCount: 0, typeCounts, problems, warnings };
  }

  try {
    ex = JSON.parse(readFileSync(join(dd, 'exams.json'), 'utf8'));
    if (!Array.isArray(ex)) throw new Error('exams.json is not an array');
  } catch (e) {
    problems.push(`${m}: exams.json parse error (${e.message})`);
    return { module: m, path: absPath, questionCount: qs.length, examCount: 0, typeCounts, problems, warnings };
  }

  const ids = new Set();
  for (const q of qs) {
    const qid = q?.id || '<missing-id>';
    if (!q?.id) {
      problems.push(`${m}: question missing id`);
    } else if (ids.has(q.id)) {
      problems.push(`${m}: dup id ${q.id}`);
    } else {
      ids.add(q.id);
    }

    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;

    if (!SCHEMA_QUESTION_TYPES.has(q.type)) {
      problems.push(`${m}: ${qid} unexpected type '${q.type}'`);
    } else {
      if (!UI_SUPPORTED_QUESTION_TYPES.has(q.type)) {
        warnings.push(`${m}: ${qid} uses schema-only type '${q.type}' (not yet rendered in template UI)`);
      }

      const ans = Array.isArray(q.answer) ? q.answer : [];
      if (q.type === 'single' || q.type === 'multiple') {
        const opts = Array.isArray(q.options) ? q.options : [];
        if (opts.length < 2) {
          problems.push(`${m}: ${qid} has <2 options (${opts.length})`);
        }
        const optionKeys = new Set();
        for (const opt of opts) {
          if (!opt || typeof opt.key !== 'string' || opt.key.trim() === '') {
            problems.push(`${m}: ${qid} has option with empty key`);
          } else if (optionKeys.has(opt.key)) {
            problems.push(`${m}: ${qid} has duplicate option key '${opt.key}'`);
          } else {
            optionKeys.add(opt.key);
          }
        }
        if (ans.length === 0) {
          problems.push(`${m}: ${qid} ${q.type} with no answer`);
        }
        for (const a of ans) {
          if (!optionKeys.has(a)) {
            problems.push(`${m}: ${qid} answer '${a}' not an option key`);
          }
        }
        if (q.type === 'single' && ans.length !== 1) {
          problems.push(`${m}: ${qid} single with ${ans.length} answers`);
        }
      } else if (q.type === 'judge') {
        if (ans.length !== 1) {
          problems.push(`${m}: ${qid} judge with ${ans.length} answers`);
        }
        for (const a of ans) {
          if (a !== 'T' && a !== 'F') {
            problems.push(`${m}: ${qid} judge answer '${a}' must be 'T' or 'F'`);
          }
        }
      } else {
        // short | fill | calculation | case_analysis
        if (ans.length === 0 || ans.some((a) => typeof a !== 'string' || a.trim() === '')) {
          problems.push(`${m}: ${qid} ${q.type} with empty/missing answer`);
        }
      }
    }

    if (typeof q.stem !== 'string' || q.stem.trim() === '') {
      problems.push(`${m}: ${qid} missing stem`);
    }
    if (typeof q.explanation !== 'string' || q.explanation.trim() === '') {
      problems.push(`${m}: ${qid} missing explanation`);
    }
  }

  for (const e of ex) {
    const eid = e?.id || '<missing-exam-id>';
    for (const qid of Array.isArray(e?.questionIds) ? e.questionIds : []) {
      if (!ids.has(qid)) {
        problems.push(`${m}: exam ${eid} refs missing ${qid}`);
      }
    }
  }

  return {
    module: m,
    path: absPath,
    questionCount: qs.length,
    examCount: ex.length,
    typeCounts,
    problems,
    warnings,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const includeTemplate = hasFlag(argv, '--include-template');
  const jsonOut = hasFlag(argv, '--json');

  const modules = getModuleDirs(undefined, { includeTemplate });
  const allProblems = [];
  const allWarnings = [];
  let totalQ = 0;
  let totalE = 0;
  const globalTypeCounts = {};

  const perModule = [];
  for (const mod of modules) {
    const res = auditModuleQuestions(mod.path);
    perModule.push(res);
    totalQ += res.questionCount;
    totalE += res.examCount;
    for (const [t, c] of Object.entries(res.typeCounts)) {
      globalTypeCounts[t] = (globalTypeCounts[t] || 0) + c;
    }
    allProblems.push(...res.problems);
    allWarnings.push(...res.warnings);
  }

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          modules: modules.length,
          questions: totalQ,
          exams: totalE,
          problemsCount: allProblems.length,
          warningsCount: allWarnings.length,
          typeCounts: globalTypeCounts,
          problems: allProblems,
          warnings: allWarnings,
        },
        null,
        2
      )
    );
  } else {
    console.log(`modules=${modules.length} questions=${totalQ} exams=${totalE} problems=${allProblems.length}`);
    if (allWarnings.length > 0) {
      console.log(`warnings=${allWarnings.length} (schema-only question types not supported in template UI)`);
      for (const w of allWarnings) console.log(`  WARN ${w}`);
    }
    for (const p of allProblems) {
      console.log(`  ${p}`);
    }
  }

  process.exit(allProblems.length > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
