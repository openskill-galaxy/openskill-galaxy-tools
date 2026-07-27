// Build all modules (and portal) with 6-way parallelism; report failures.
import { readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';

const ROOT = 'C:/WJH/Wonderful/openskill-galaxy';
const dirs = [];
for (const cat of readdirSync(ROOT)) {
  const catPath = join(ROOT, cat);
  if (!statSync(catPath).isDirectory()) continue;
  for (const m of readdirSync(catPath)) {
    const dir = join(catPath, m);
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'vite.config.ts'))) dirs.push(dir);
  }
}
console.log(`building ${dirs.length} projects`);

const CONC = 6;
let idx = 0;
const failures = [];
async function worker() {
  while (idx < dirs.length) {
    const dir = dirs[idx++];
    await new Promise((res) => {
      exec('npm run build', { cwd: dir, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        const rel = dir.replace(ROOT + '/', '').replace(ROOT + '\\', '');
        if (err) {
          failures.push(rel);
          console.log(`FAIL ${rel}\n${(stdout + stderr).split('\n').filter(l => /error|Error|ERROR/.test(l)).slice(0, 12).join('\n')}`);
        } else {
          console.log(`ok   ${rel}`);
        }
        res();
      });
    });
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\ndone: ${dirs.length - failures.length}/${dirs.length} ok, ${failures.length} failed`);
failures.forEach((f) => console.log('FAILED: ' + f));
process.exit(failures.length ? 1 : 0);
