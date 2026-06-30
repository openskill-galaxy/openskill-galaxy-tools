#!/usr/bin/env node
import { readModuleData } from './utils/read-json.mjs';
import { getDataDir } from './utils/path-utils.mjs';
import fs from 'fs/promises';
import { resolve } from 'path';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/count-module.mjs <module-path>'); process.exit(1); }

const DATA_FILES = ['courses','lessons','knowledge-points','questions','exams','cases','routes','glossary','faqs','tags'];

async function main() {
  console.log(`\n=== Module Data Count: ${resolve(modulePath)} ===\n`);

  const data = {};
  for (const f of DATA_FILES) {
    try { data[f] = await readModuleData(modulePath, f); }
    catch { data[f] = []; }
  }

  // Basic counts
  for (const f of DATA_FILES) {
    const arr = data[f];
    console.log(`${f.padEnd(22)} ${Array.isArray(arr) ? arr.length : 'N/A'}`);
  }

  // Question type breakdown
  const qTypeCounts = {};
  const qDiffCounts = {};
  for (const q of (data.questions || [])) {
    qTypeCounts[q.type] = (qTypeCounts[q.type] || 0) + 1;
    qDiffCounts[q.difficulty] = (qDiffCounts[q.difficulty] || 0) + 1;
  }
  console.log('\n--- Question Types ---');
  for (const [t, c] of Object.entries(qTypeCounts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${t.padEnd(20)} ${c}`);
  }
  console.log('\n--- Difficulty Distribution ---');
  for (const [d, c] of Object.entries(qDiffCounts)) {
    console.log(`  ${d.padEnd(20)} ${c}`);
  }

  // Lessons per course
  const lessonsByCourse = {};
  for (const l of (data.lessons || [])) {
    lessonsByCourse[l.courseId] = (lessonsByCourse[l.courseId] || 0) + 1;
  }
  console.log('\n--- Lessons per Course ---');
  for (const c of (data.courses || [])) {
    const cnt = lessonsByCourse[c.id] || 0;
    console.log(`  ${c.id.padEnd(12)} ${c.title.padEnd(30)} ${cnt} lessons`);
  }

  // Max JSON file size
  const dataDir = getDataDir(modulePath);
  let maxSize = 0, maxFile = '';
  for (const f of DATA_FILES) {
    try {
      const stat = await fs.stat(resolve(dataDir, `${f}.json`));
      if (stat.size > maxSize) { maxSize = stat.size; maxFile = f; }
    } catch {}
  }
  console.log(`\n--- Largest JSON File ---`);
  console.log(`  ${maxFile}.json: ${(maxSize / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
