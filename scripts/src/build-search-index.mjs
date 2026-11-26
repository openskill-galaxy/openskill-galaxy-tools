#!/usr/bin/env node
import { resolve } from 'path';
import { writeModuleSearchIndex } from './utils/search-index.mjs';
import { hasFlag, resolveTargetModules } from './utils/cli-utils.mjs';

function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const pretty = hasFlag(argv, '--pretty');
  const targets = resolveTargetModules(
    argv,
    'Usage: node src/build-search-index.mjs <module-path> | --all [--include-template] [--dry-run] [--pretty]'
  );
  if (!targets) process.exit(1);

  let totalEntries = 0;
  let totalBytes = 0;

  for (const t of targets) {
    const abs = resolve(t.path);
    const res = writeModuleSearchIndex(abs, { pretty, dryRun });
    totalEntries += res.entries.length;
    totalBytes += res.bytes;
    if (targets.length === 1) {
      console.log(`\n=== Build Search Index: ${abs}${dryRun ? ' [DRY RUN]' : ''} ===\n`);
      console.log(`✅ Search index ${dryRun ? 'previewed' : 'generated'}`);
      console.log(`   ${res.entries.length} entries`);
      console.log(`   ${(res.bytes / 1024).toFixed(1)} KB (${pretty ? 'pretty' : 'minified'})`);
      console.log(`   → ${res.outPath}`);
    }
  }

  if (targets.length > 1) {
    console.log(
      `✅ ${dryRun ? 'Previewed' : 'Rebuilt'} search-index.json for ${targets.length} modules (${totalEntries.toLocaleString()} entries, ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`
    );
  }
}

main();
