// Audit all modules' questions/exams: answer-key validity, exam ref integrity, id uniqueness, counts.
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
const ROOT = 'C:/WJH/Wonderful/openskill-galaxy';
let problems = [];
let total = 0, totalQ = 0, totalE = 0;
for (const cat of readdirSync(ROOT)) {
  const cp = join(ROOT, cat);
  if (!statSync(cp).isDirectory()) continue;
  for (const m of readdirSync(cp)) {
    const dd = join(cp, m, 'public', 'data');
    if (!existsSync(join(dd, 'module.json'))) continue;
    total++;
    let qs, ex;
    try { qs = JSON.parse(readFileSync(join(dd, 'questions.json'), 'utf8')); } catch (e) { problems.push(`${m}: questions.json parse error`); continue; }
    try { ex = JSON.parse(readFileSync(join(dd, 'exams.json'), 'utf8')); } catch (e) { problems.push(`${m}: exams.json parse error`); continue; }
    totalQ += qs.length; totalE += ex.length;
    const ids = new Set();
    for (const q of qs) {
      if (ids.has(q.id)) problems.push(`${m}: dup id ${q.id}`);
      ids.add(q.id);
      if (q.type === 'single' || q.type === 'multiple') {
        const keys = new Set((q.options || []).map(o => o.key));
        for (const a of q.answer || []) if (!keys.has(a)) problems.push(`${m}: ${q.id} answer '${a}' not an option key`);
        if ((q.options || []).length < 2) problems.push(`${m}: ${q.id} has <2 options`);
        if (q.type === 'single' && (q.answer || []).length !== 1) problems.push(`${m}: ${q.id} single with ${q.answer.length} answers`);
      } else if (q.type === 'judge') {
        for (const a of q.answer || []) if (a !== 'T' && a !== 'F') problems.push(`${m}: ${q.id} judge answer '${a}'`);
      } else if (q.type === 'short') {
        if (!(q.answer || []).length) problems.push(`${m}: ${q.id} short with no answer`);
      } else {
        problems.push(`${m}: ${q.id} unexpected type ${q.type}`);
      }
      if (!q.explanation) problems.push(`${m}: ${q.id} missing explanation`);
    }
    for (const e of ex) {
      for (const id of e.questionIds || []) if (!ids.has(id)) problems.push(`${m}: exam ${e.id} refs missing ${id}`);
    }
  }
}
console.log(`modules=${total} questions=${totalQ} exams=${totalE} problems=${problems.length}`);
problems.slice(0, 40).forEach(p => console.log('  ' + p));
