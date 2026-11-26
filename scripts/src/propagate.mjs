#!/usr/bin/env node
// Propagate module-template presentation layer, configs, and CI workflow to all 60 modules.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, relative, sep } from 'path';
import { getTemplateDir, getModuleDirs } from './utils/workspace.mjs';
import { hasFlag } from './utils/cli-utils.mjs';

const TPL = getTemplateDir();
const EXCLUDE_SRC = new Set([
  'data/loaders.ts',
  'utils/scoring.ts',
  'pages/SearchPage.tsx',
  'types.ts',
]);

const GENERIC_TITLE = 'OpenSkill Galaxy Module';
const GENERIC_DESC = 'OpenSkill Galaxy Module — reusable static learning module.';

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

function escapeHtmlAttr(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlText(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function unescapeHtml(str) {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function buildModuleIndexHtml(tplIndexHtml, curHtml, meta) {
  const titleMatch = curHtml.match(/<title>([^<]*)<\/title>/i);
  const currentTitle = titleMatch ? unescapeHtml(titleMatch[1].trim()) : '';
  const resolvedTitle =
    currentTitle && currentTitle !== GENERIC_TITLE
      ? currentTitle
      : `${meta.title || meta.slug} · OpenSkill Galaxy`;

  const descMatch = curHtml.match(
    /<meta\s+name=["']description["']\s+content=(?:"([^"]*)"|'([^']*)')/i
  );
  const currentDesc = descMatch ? unescapeHtml((descMatch[1] ?? descMatch[2] ?? '').trim()) : '';
  const fallbackDesc = String(meta.description || meta.subtitle || meta.title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const resolvedDesc =
    currentDesc && currentDesc !== GENERIC_DESC ? currentDesc : fallbackDesc || GENERIC_DESC;

  const ogDescMatch = curHtml.match(
    /<meta\s+property=["']og:description["']\s+content=(?:"([^"]*)"|'([^']*)')/i
  );
  const currentOgDesc = ogDescMatch
    ? unescapeHtml((ogDescMatch[1] ?? ogDescMatch[2] ?? '').trim())
    : '';
  const resolvedOgDesc =
    currentOgDesc && currentOgDesc !== GENERIC_DESC ? currentOgDesc : resolvedDesc;

  let html = tplIndexHtml.replace(
    /<title>[^<]*<\/title>/i,
    () => `<title>${escapeHtmlText(resolvedTitle)}</title>`
  );
  html = html.replace(
    /(<meta\s+property=["']og:title["']\s+content=)(?:"[^"]*"|'[^']*')/i,
    (_, prefix) => `${prefix}"${escapeHtmlAttr(resolvedTitle)}"`
  );
  html = html.replace(
    /(<meta\s+name=["']description["']\s+content=)(?:"[^"]*"|'[^']*')/i,
    (_, prefix) => `${prefix}"${escapeHtmlAttr(resolvedDesc)}"`
  );
  html = html.replace(
    /(<meta\s+property=["']og:description["']\s+content=)(?:"[^"]*"|'[^']*')/i,
    (_, prefix) => `${prefix}"${escapeHtmlAttr(resolvedOgDesc)}"`
  );
  return html;
}

function buildModulePackageJson(tplPkg, curPkg, slug, meta) {
  const curDesc = typeof curPkg?.description === 'string' ? curPkg.description.trim() : '';
  const derivedDesc =
    curDesc && curDesc !== tplPkg.description
      ? curDesc
      : String(meta.subtitle || meta.description || tplPkg.description || '').trim();

  return {
    name: `openskill-${slug}`,
    version: curPkg?.version || tplPkg.version || '1.0.0',
    private: tplPkg.private ?? true,
    description: derivedDesc,
    type: tplPkg.type || 'module',
    scripts: tplPkg.scripts,
    dependencies: tplPkg.dependencies,
    devDependencies: tplPkg.devDependencies,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = hasFlag(argv, '--dry-run');
  const checkMode = hasFlag(argv, '--check');
  const readOnly = dryRun || checkMode;

  const tplSrcFiles = walk(join(TPL, 'src'));
  const tplSrcSet = new Set(tplSrcFiles);
  const tplIndexHtml = readFileSync(join(TPL, 'index.html'), 'utf8');
  const tplVite = readFileSync(join(TPL, 'vite.config.ts'), 'utf8');
  const tplPkg = JSON.parse(readFileSync(join(TPL, 'package.json'), 'utf8'));
  const deployRel = '.github/workflows/deploy.yml';
  const hasTplDeploy = existsSync(join(TPL, deployRel));

  const mods = getModuleDirs().map((m) => ({ name: m.name, dir: m.path }));
  console.log(
    `targets: ${mods.length}${checkMode ? ' [CHECK MODE]' : dryRun ? ' [DRY RUN]' : ''}`
  );

  let driftedModules = 0;
  let totalChanges = 0;

  for (const { name, dir } of mods) {
    const meta = JSON.parse(readFileSync(join(dir, 'public', 'data', 'module.json'), 'utf8'));
    const slug = meta.slug;
    if (!slug || !slug.startsWith('module-')) throw new Error(`${name}: bad slug ${slug}`);

    const changedFiles = [];

    const syncFileContent = (relDest, nextContent) => {
      const dst = join(dir, relDest);
      const curContent = existsSync(dst) ? readFileSync(dst, 'utf8') : null;
      if (curContent !== nextContent) {
        changedFiles.push(`update:${relDest}`);
        if (!readOnly) {
          mkdirSync(join(dst, '..'), { recursive: true });
          writeFileSync(dst, nextContent, 'utf8');
        }
      }
    };

    const syncBinaryOrTextFromTpl = (relPath) => {
      const src = join(TPL, relPath);
      const dst = join(dir, relPath);
      const srcBuf = readFileSync(src);
      const dstBuf = existsSync(dst) ? readFileSync(dst) : null;
      if (!dstBuf || !srcBuf.equals(dstBuf)) {
        changedFiles.push(`sync:${relPath}`);
        if (!readOnly) {
          mkdirSync(join(dst, '..'), { recursive: true });
          writeFileSync(dst, srcBuf);
        }
      }
    };

    // 1. src sync
    for (const rel of tplSrcFiles) {
      if (EXCLUDE_SRC.has(rel)) continue;
      syncBinaryOrTextFromTpl(join('src', rel));
    }

    // Remove extra src files absent from template (except EXCLUDE_SRC)
    if (existsSync(join(dir, 'src'))) {
      for (const rel of walk(join(dir, 'src'))) {
        if (!tplSrcSet.has(rel) && !EXCLUDE_SRC.has(rel)) {
          changedFiles.push(`delete:src/${rel}`);
          if (!readOnly) {
            rmSync(join(dir, 'src', rel), { force: true });
          }
        }
      }
    }

    // 2. config + public generic files + CI deploy workflow
    for (const f of ['tailwind.config.js', 'postcss.config.js', 'tsconfig.json', 'tsconfig.node.json']) {
      syncBinaryOrTextFromTpl(f);
    }
    for (const f of ['sw.js', '404.html', 'favicon.svg']) {
      syncBinaryOrTextFromTpl(join('public', f));
    }
    if (existsSync(join(TPL, 'scripts', 'validate-data.mjs'))) {
      syncBinaryOrTextFromTpl(join('scripts', 'validate-data.mjs'));
    }
    if (hasTplDeploy) {
      syncBinaryOrTextFromTpl(deployRel);
    }

    // 3. vite.config.ts with module base
    const nextVite = tplVite
      .replaceAll('/module-template/', `/${slug}/`)
      .replace('// 项目站点 module-template', `// 项目站点 ${slug}`);
    syncFileContent('vite.config.ts', nextVite);

    // 4. index.html: preserve non-generic <title> & <meta description>, otherwise derive from module.json
    const curHtml = existsSync(join(dir, 'index.html'))
      ? readFileSync(join(dir, 'index.html'), 'utf8')
      : '';
    const nextHtml = buildModuleIndexHtml(tplIndexHtml, curHtml, meta);
    syncFileContent('index.html', nextHtml);

    // 5. package.json: sync template scripts/deps while preserving/deriving module name & description
    const pkgPath = join(dir, 'package.json');
    const curPkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
    const nextPkgObj = buildModulePackageJson(tplPkg, curPkg, slug, meta);
    const nextPkgRaw = JSON.stringify(nextPkgObj, null, 2) + '\n';
    syncFileContent('package.json', nextPkgRaw);

    // 6. types.ts targeted patch for SM-2 WrongQuestionRecord fields
    const typesPath = join(dir, 'src', 'types.ts');
    if (existsSync(typesPath)) {
      const OLD_WQR = `export interface WrongQuestionRecord {\n  questionId: string;\n  wrongCount: number;\n  lastAnswer: string[];\n  lastAt: string;\n}`;
      const NEW_WQR = `export interface WrongQuestionRecord {\n  questionId: string;\n  wrongCount: number;\n  lastAnswer: string[];\n  lastAt: string;\n  // SM-2 间隔复习字段（艾宾浩斯复习引擎）\n  interval?: number; // 天\n  repetitions?: number;\n  easeFactor?: number;\n  nextReviewDate?: string; // ISO\n}`;
      const ts = readFileSync(typesPath, 'utf8');
      if (ts.includes(OLD_WQR)) {
        changedFiles.push('patch:src/types.ts');
        if (!readOnly) {
          writeFileSync(typesPath, ts.replace(OLD_WQR, NEW_WQR), 'utf8');
        }
      }
    }

    // 7. stale build artifacts
    for (const f of ['vite.config.js', 'vite.config.d.ts', 'tsconfig.node.tsbuildinfo', 'tsconfig.tsbuildinfo']) {
      if (existsSync(join(dir, f))) {
        changedFiles.push(`delete:${f}`);
        if (!readOnly) {
          rmSync(join(dir, f), { force: true });
        }
      }
    }

    if (changedFiles.length > 0) {
      driftedModules++;
      totalChanges += changedFiles.length;
      if (readOnly) {
        console.log(`  ${name}: ${changedFiles.length} change(s) (${changedFiles.slice(0, 6).join(', ')}${changedFiles.length > 6 ? ', ...' : ''})`);
      }
    }
  }

  if (!readOnly) {
    for (const f of ['tsconfig.tsbuildinfo', 'tsconfig.node.tsbuildinfo']) {
      rmSync(join(TPL, f), { force: true });
    }
    console.log(`propagation done (${driftedModules} modules updated, ${totalChanges} file operations)`);
  } else if (checkMode) {
    console.log(`\nDrift check: ${driftedModules}/${mods.length} modules have drift (${totalChanges} file differences)`);
    if (driftedModules > 0) process.exit(1);
  } else {
    console.log(`\nDry run complete: ${driftedModules}/${mods.length} modules would be updated (${totalChanges} file operations)`);
  }
}

main();
