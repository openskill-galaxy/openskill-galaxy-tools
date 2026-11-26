#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getModuleDirs, getPortalDir, getTemplateDir } from './utils/workspace.mjs';
import { buildModuleSearchIndex } from './utils/search-index.mjs';
import { hasFlag, getArgValue } from './utils/cli-utils.mjs';

function loadArrayLength(filePath) {
  if (!existsSync(filePath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function updateSwCacheVersion(raw, { swVersion, bumpSw }) {
  const regex = /(CACHE_NAME\s*=\s*["'][^"']+?-v)(\d+)(["'])/;
  const match = raw.match(regex);
  if (!match) return { next: raw, changed: false, version: null };

  const currentVer = Number(match[2]);
  let targetVer = currentVer;
  if (swVersion !== undefined) {
    targetVer = Number(swVersion);
  } else if (bumpSw) {
    targetVer = currentVer + 1;
  }

  if (!Number.isInteger(targetVer) || targetVer < 1 || targetVer === currentVer) {
    return { next: raw, changed: false, version: currentVer };
  }

  const next = raw.replace(regex, `$1${targetVer}$3`);
  return { next, changed: next !== raw, version: targetVer, from: currentVer };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const bumpSw = hasFlag(argv, '--bump-sw');
  const includeTemplate = hasFlag(argv, '--include-template');
  const swVersionRaw = getArgValue(argv, '--sw-version');

  if (swVersionRaw !== undefined && (!/^\d+$/.test(swVersionRaw) || Number(swVersionRaw) < 1)) {
    console.error(`Invalid --sw-version '${swVersionRaw}'. Expected a positive integer.`);
    process.exit(1);
  }
  const swVersion = swVersionRaw !== undefined ? Number(swVersionRaw) : undefined;

  const modules = getModuleDirs(undefined, { includeTemplate });
  let oldEntries = 0;
  let newEntries = 0;
  let oldBytes = 0;
  let newBytes = 0;
  let manifestsUpdated = 0;
  let swBumped = 0;
  const swTransitions = new Set();

  for (const mod of modules) {
    const dataDir = join(mod.path, 'public', 'data');
    const siPath = join(dataDir, 'search-index.json');
    if (existsSync(siPath)) {
      oldBytes += statSync(siPath).size;
      oldEntries += loadArrayLength(siPath);
    }

    const entries = buildModuleSearchIndex(dataDir);
    const serialized = JSON.stringify(entries);
    if (!dryRun) {
      writeFileSync(siPath, serialized, 'utf8');
    }
    newEntries += entries.length;
    newBytes += Buffer.byteLength(serialized, 'utf8');

    const metaPath = join(dataDir, 'module.json');
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      const title = meta.title || mod.name;
      const slug = meta.slug || mod.name;
      const desc = meta.description || meta.subtitle || meta.summary || `OpenSkill Galaxy — ${title}`;
      const manifest = {
        short_name: title.length <= 12 ? title : title.slice(0, 12),
        name: `OpenSkill Galaxy — ${title}`,
        description: desc.slice(0, 140),
        icons: [
          {
            src: 'favicon.svg',
            type: 'image/svg+xml',
            sizes: 'any',
          },
        ],
        start_url: `/${slug}/`,
        scope: `/${slug}/`,
        background_color: '#fbfbfd',
        theme_color: '#4f46e5',
        display: 'standalone',
        orientation: 'portrait',
      };
      if (!dryRun) {
        writeFileSync(
          join(mod.path, 'public', 'manifest.json'),
          JSON.stringify(manifest, null, 2) + '\n',
          'utf8'
        );
      }
      manifestsUpdated++;
    }
  }

  if (bumpSw || swVersion !== undefined) {
    const swTargets = [getPortalDir(), getTemplateDir(), ...getModuleDirs().map((m) => m.path)];
    for (const dir of swTargets) {
      const swPath = join(dir, 'public', 'sw.js');
      if (!existsSync(swPath)) continue;
      const raw = readFileSync(swPath, 'utf8');
      const res = updateSwCacheVersion(raw, { swVersion, bumpSw });
      if (res.changed) {
        swBumped++;
        if (res.from !== undefined) swTransitions.add(`v${res.from} -> v${res.version}`);
        if (!dryRun) {
          writeFileSync(swPath, res.next, 'utf8');
        }
      }
    }
  }

  const modeLabel = dryRun ? ' [DRY RUN]' : '';
  console.log(
    `✅ ${dryRun ? 'Previewed' : 'Rebuilt'} ${modules.length} module search-index.json${modeLabel}: ${oldEntries.toLocaleString()} -> ${newEntries.toLocaleString()} entries`
  );
  console.log(`   Size: ${(oldBytes / 1024 / 1024).toFixed(2)} MB -> ${(newBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`✅ ${dryRun ? 'Previewed' : 'Personalized'} manifest.json for ${manifestsUpdated}/${modules.length} modules`);
  if (bumpSw || swVersion !== undefined) {
    const label = swTransitions.size > 0 ? [...swTransitions].join(', ') : 'no change';
    console.log(`✅ ${dryRun ? 'Would bump' : 'Bumped'} sw.js cache version (${label}) across ${swBumped} repos`);
  } else {
    console.log('ℹ️  sw.js cache version unchanged (pass --bump-sw or --sw-version <N> to update)');
  }
}

main();
