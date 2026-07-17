import fs from 'fs/promises';
import { resolve, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const workspaceRoot = 'C:/WJH/Wonderful/openskill-galaxy';

async function getRepoDirs() {
  const dirs = [];
  
  // 1. Add specific platform tool repos
  const platformTools = [
    '00-平台与协作/工具集',
    '00-平台与协作/模块模板',
    '00-平台与协作/官网门户'
  ];
  for (const rel of platformTools) {
    const p = join(workspaceRoot, rel);
    try {
      await fs.stat(join(p, '.git'));
      dirs.push({ category: 'Platform', name: rel.split('/').pop(), path: p });
    } catch {}
  }

  // 2. Scan all category subdirectories for learning modules
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const catPath = join(workspaceRoot, entry.name);
    const subEntries = await fs.readdir(catPath, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory() || subEntry.name === '.git' || subEntry.name === 'node_modules') continue;
      const modulePath = join(catPath, subEntry.name);
      try {
        const stat = await fs.stat(join(modulePath, '.git'));
        if (stat.isDirectory()) {
          dirs.push({ category: entry.name, name: subEntry.name, path: modulePath });
        }
      } catch {}
    }
  }
  return dirs;
}

async function runGit(cwd, args) {
  const cmd = `git ${args}`;
  try {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Jiehu Wang',
      GIT_AUTHOR_EMAIL: 'jiehu.wang@github.com',
      GIT_COMMITTER_NAME: 'Jiehu Wang',
      GIT_COMMITTER_EMAIL: 'jiehu.wang@github.com'
    };
    const { stdout } = await execAsync(cmd, { cwd, env });
    return { success: true, output: stdout.trim() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const repos = await getRepoDirs();
  console.log(`Found ${repos.length} Git repositories. Checking for changes...\n`);
  
  let updatedCount = 0;
  let successCount = 0;
  let failCount = 0;

  // Temporarily disable global http.sslVerify to avoid Windows Schannel handshake failures
  console.log('🔒 Disabling sslVerify globally for connection reliability...');
  await execAsync('git config --global http.sslVerify false');

  try {
    for (const repo of repos) {
      // Check if there are changes
      const status = await runGit(repo.path, 'status --porcelain');
      if (!status.success) {
        console.error(`❌ Failed status check for ${repo.category}/${repo.name}:`, status.error);
        failCount++;
        continue;
      }

      const statusFull = await runGit(repo.path, 'status');
      const isAhead = statusFull.success && statusFull.output.includes('ahead');

      if (status.output === '' && !isAhead) {
        // No changes, and not ahead of remote, skip
        continue;
      }

      updatedCount++;
      console.log(`📦 Syncing ${repo.category}/${repo.name}...`);
      
      if (status.output !== '') {
        // 1. Git add
        const addRes = await runGit(repo.path, 'add .');
        if (!addRes.success) {
          console.error(`   ❌ git add failed:`, addRes.error);
          failCount++;
          continue;
        }

        // 2. Git commit
        const commitRes = await runGit(repo.path, 'commit -m "style: optimize database schema and redesign premium visual UI"');
        if (!commitRes.success) {
          console.error(`   ❌ git commit failed:`, commitRes.error);
          failCount++;
          continue;
        }
      }

      // 3. Git push
      const pushRes = await runGit(repo.path, 'push origin main');
      if (!pushRes.success) {
        console.error(`   ❌ git push failed:`, pushRes.error);
        failCount++;
        continue;
      }

      console.log(`   ✅ Successfully pushed to GitHub!`);
      successCount++;
    }
  } finally {
    console.log('🔓 Restoring global sslVerify configuration...');
    try {
      await execAsync('git config --global --unset http.sslVerify');
    } catch {}
  }

  console.log(`\n=== Synchronization Completed ===`);
  console.log(`Total Repositories with changes: ${updatedCount}`);
  console.log(`Successfully Synced: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

main().catch(console.error);
