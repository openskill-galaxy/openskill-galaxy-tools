#!/usr/bin/env node
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAllRepoDirs } from './utils/workspace.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  let message = 'chore: sync OpenSkill Galaxy updates';
  let dryRun = false;
  let noPush = false;
  let confirm = false;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--message' || argv[i] === '-m') && argv[i + 1]) {
      message = argv[++i];
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    } else if (argv[i] === '--no-push') {
      noPush = true;
    } else if (argv[i] === '--confirm') {
      confirm = true;
    }
  }
  return { message, dryRun, noPush, confirm };
}

async function runGit(cwd, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return { success: true, output: stdout.trim() };
  } catch (e) {
    return { success: false, error: e.stderr?.trim() || e.message };
  }
}

async function main() {
  const { message, dryRun, noPush, confirm } = parseArgs(process.argv.slice(2));
  if (!dryRun && !confirm) {
    console.error('Refusing to run git add/commit/push without --confirm (or pass --dry-run to preview).');
    process.exit(1);
  }

  const repos = getAllRepoDirs();
  console.log(`Found ${repos.length} Git repositories. Checking for changes...${dryRun ? ' [DRY RUN]' : ''}\n`);

  let updatedCount = 0;
  let successCount = 0;
  let failCount = 0;

  for (const repo of repos) {
    const status = await runGit(repo.path, ['status', '--porcelain']);
    if (!status.success) {
      console.error(`❌ Failed status check for ${repo.name}:`, status.error);
      failCount++;
      continue;
    }

    const statusFull = await runGit(repo.path, ['status', '-sb']);
    const isAhead = statusFull.success && statusFull.output.includes('ahead');

    if (status.output === '' && !isAhead) continue;

    updatedCount++;
    const fileCount = status.output ? status.output.split('\n').length : 0;
    console.log(`📦 ${repo.name} (${fileCount} changed files${isAhead ? ', ahead of origin' : ''})`);

    if (dryRun) {
      successCount++;
      continue;
    }

    if (status.output !== '') {
      const addRes = await runGit(repo.path, ['add', '-A']);
      if (!addRes.success) {
        console.error(`   ❌ git add failed:`, addRes.error);
        failCount++;
        continue;
      }

      const commitRes = await runGit(repo.path, ['commit', '-m', message]);
      if (!commitRes.success) {
        console.error(`   ❌ git commit failed:`, commitRes.error);
        failCount++;
        continue;
      }
    }

    if (!noPush) {
      const pushRes = await runGit(repo.path, ['push', 'origin', 'HEAD']);
      if (!pushRes.success) {
        console.error(`   ❌ git push failed:`, pushRes.error);
        failCount++;
        continue;
      }
      console.log(`   ✅ Committed and pushed!`);
    } else {
      console.log(`   ✅ Committed locally (--no-push).`);
    }
    successCount++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Changed repos: ${updatedCount} | Succeeded: ${successCount} | Failed: ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
