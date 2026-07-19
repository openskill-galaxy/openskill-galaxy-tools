import fs from 'fs/promises';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

const workspaceRoot = 'C:/WJH/Wonderful/openskill-galaxy';

async function getModuleDirs() {
  const dirs = [];
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('node_modules')) continue;
    const subDirPath = join(workspaceRoot, entry.name);
    const subEntries = await fs.readdir(subDirPath, { withFileTypes: true });
    for (const sub of subEntries) {
      if (sub.isDirectory()) {
        const fullPath = join(subDirPath, sub.name);
        try {
          await fs.access(join(fullPath, 'package.json'));
          dirs.push(fullPath);
        } catch {}
      }
    }
  }
  return dirs;
}

async function main() {
  const dirs = await getModuleDirs();
  console.log(`Found ${dirs.length} submodules. Running npm install for modules needing appwrite...`);
  let installed = 0;

  for (const dir of dirs) {
    try {
      const appwritePkg = join(dir, 'node_modules', 'appwrite');
      await fs.access(appwritePkg);
    } catch {
      try {
        console.log(`Installing in ${dir.replace(workspaceRoot + '/', '')}...`);
        execSync('npm install --no-audit --no-fund', { cwd: dir, stdio: 'ignore' });
        installed++;
      } catch (err) {
        console.error(`Failed npm install in ${dir}`);
      }
    }
  }

  console.log(`=== Appwrite Dependency Install Completed (${installed} installed) ===`);
}

main();
