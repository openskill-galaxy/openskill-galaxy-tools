// Propagate template presentation layer to all 60 modules.
// - full src copy EXCEPT module-specific: data/loaders.ts, utils/scoring.ts, pages/SearchPage.tsx, types.ts
// - delete src files absent from template (except the 4 excluded)
// - copy tailwind/postcss/tsconfig/tsconfig.node + public generic files (sw.js, 404.html, favicon.svg, manifest.json)
// - vite.config.ts: template content with base -> /<slug>/
// - index.html: template content with module's own <title> preserved
// - package.json name -> openskill-<slug>
// - delete stale build artifacts (vite.config.js/.d.ts, *.tsbuildinfo)
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, statSync, mkdirSync, rmSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = 'C:/WJH/Wonderful/openskill-galaxy';
const TPL = join(ROOT, '00-平台与协作', '模块模板');
const EXCLUDE_SRC = new Set([
  'data/loaders.ts',
  'utils/scoring.ts',
  'pages/SearchPage.tsx',
  'types.ts',
]);

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

const tplSrcFiles = walk(join(TPL, 'src'));
const tplIndexHtml = readFileSync(join(TPL, 'index.html'), 'utf8');
const tplVite = readFileSync(join(TPL, 'vite.config.ts'), 'utf8');

const mods = [];
for (const cat of readdirSync(ROOT)) {
  const catPath = join(ROOT, cat);
  if (!statSync(catPath).isDirectory()) continue;
  for (const m of readdirSync(catPath)) {
    const dir = join(catPath, m);
    if (m === '模块模板') continue;
    if (existsSync(join(dir, 'public', 'data', 'module.json'))) mods.push({ name: `${cat}/${m}`, dir });
  }
}
console.log(`targets: ${mods.length}`);

for (const { name, dir } of mods) {
  const meta = JSON.parse(readFileSync(join(dir, 'public', 'data', 'module.json'), 'utf8'));
  const slug = meta.slug;
  if (!slug || !slug.startsWith('module-')) throw new Error(`${name}: bad slug ${slug}`);

  // 1. src sync
  for (const rel of tplSrcFiles) {
    if (EXCLUDE_SRC.has(rel)) continue;
    const dst = join(dir, 'src', rel);
    mkdirSync(join(dst, '..'), { recursive: true });
    copyFileSync(join(TPL, 'src', rel), dst);
  }
  // delete src files not in template (keep excluded four)
  if (existsSync(join(dir, 'src'))) {
    const tplSet = new Set(tplSrcFiles);
    for (const rel of walk(join(dir, 'src'))) {
      if (!tplSet.has(rel) && !EXCLUDE_SRC.has(rel)) {
        rmSync(join(dir, 'src', rel), { force: true });
        console.log(`  ${name}: removed src/${rel}`);
      }
    }
  }

  // 2. config + public generic files
  for (const f of ['tailwind.config.js', 'postcss.config.js', 'tsconfig.json', 'tsconfig.node.json']) {
    copyFileSync(join(TPL, f), join(dir, f));
  }
  for (const f of ['sw.js', '404.html', 'favicon.svg', 'manifest.json']) {
    copyFileSync(join(TPL, 'public', f), join(dir, 'public', f));
  }

  // 3. vite.config.ts with module base
  writeFileSync(
    join(dir, 'vite.config.ts'),
    tplVite
      .replaceAll('/module-template/', `/${slug}/`)
      .replace('// 项目站点 module-template', `// 项目站点 ${slug}`),
    'utf8'
  );

  // 4. index.html: keep module's own <title>
  const curHtml = readFileSync(join(dir, 'index.html'), 'utf8');
  const titleMatch = curHtml.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1] : `OpenSkill Galaxy · ${meta.title}`;
  let html = tplIndexHtml.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`);
  writeFileSync(join(dir, 'index.html'), html, 'utf8');

  // 5. package.json name
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== `openskill-${slug}`) {
    pkg.name = `openskill-${slug}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  // 6. types.ts targeted patch: WrongQuestionRecord gained optional SM-2 fields in the
  //    template; propagated useProgressStore.ts references them, so extend each module's
  //    (otherwise untouched, module-specific) types.ts.
  const typesPath = join(dir, 'src', 'types.ts');
  if (existsSync(typesPath)) {
    const OLD_WQR = `export interface WrongQuestionRecord {
  questionId: string;
  wrongCount: number;
  lastAnswer: string[];
  lastAt: string;
}`;
    const NEW_WQR = `export interface WrongQuestionRecord {
  questionId: string;
  wrongCount: number;
  lastAnswer: string[];
  lastAt: string;
  // SM-2 间隔复习字段（艾宾浩斯复习引擎）
  interval?: number; // 天
  repetitions?: number;
  easeFactor?: number;
  nextReviewDate?: string; // ISO
}`;
    const ts = readFileSync(typesPath, 'utf8');
    if (ts.includes(OLD_WQR)) {
      writeFileSync(typesPath, ts.replace(OLD_WQR, NEW_WQR), 'utf8');
    } else if (!ts.includes('nextReviewDate')) {
      console.log(`  WARN ${name}: WrongQuestionRecord pattern not found, needs manual patch`);
    }
  }

  // 7. stale artifacts
  for (const f of ['vite.config.js', 'vite.config.d.ts', 'tsconfig.node.tsbuildinfo', 'tsconfig.tsbuildinfo']) {
    rmSync(join(dir, f), { force: true });
  }
}
// template's own stale buildinfo
for (const f of ['tsconfig.tsbuildinfo', 'tsconfig.node.tsbuildinfo']) rmSync(join(TPL, f), { force: true });
console.log('propagation done');
