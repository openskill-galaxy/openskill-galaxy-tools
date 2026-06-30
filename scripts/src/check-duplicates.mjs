#!/usr/bin/env node
import { readModuleData } from './utils/read-json.mjs';
import { resolve } from 'path';

const modulePath = process.argv[2];
if (!modulePath) { console.error('Usage: node src/check-duplicates.mjs <module-path>'); process.exit(1); }

const FILES_TO_CHECK = ['courses','lessons','knowledge-points','questions','exams','cases','routes','glossary','faqs','tags'];

async function main() {
  console.log(`\n=== Duplicate ID Check: ${resolve(modulePath)} ===\n`);
  let totalDupes = 0;

  for (const f of FILES_TO_CHECK) {
    let arr;
    try { arr = await readModuleData(modulePath, f); } catch { continue; }
    if (!Array.isArray(arr)) continue;

    const seen = new Map();
    const dupes = [];
    for (const item of arr) {
      const id = item?.id;
      if (!id) continue;
      if (seen.has(id)) {
        dupes.push({ id, firstIndex: seen.get(id), secondIndex: arr.indexOf(item) });
      } else {
        seen.set(id, arr.indexOf(item));
      }
    }

    if (dupes.length > 0) {
      totalDupes += dupes.length;
      console.log(`❌ ${f}.json: ${dupes.length} duplicate(s)`);
      for (const d of dupes.slice(0, 20)) {
        console.log(`   id="${d.id}" (indices ${d.firstIndex}, ${d.secondIndex})`);
      }
    } else {
      console.log(`✅ ${f}.json: no duplicates (${arr.length} items)`);
    }
  }

  console.log(`\nTotal duplicates: ${totalDupes}`);
  if (totalDupes === 0) console.log('✅ No duplicate IDs found');
  else console.log('❌ Duplicate IDs found — please fix before deployment');
}

main().catch(e => { console.error(e); process.exit(1); });
