import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import {
  PORTAL_DIR,
  TEMPLATE_DIR,
  WORKSPACE_ROOT,
  REPRESENTATIVE_MODULES,
  getModuleDirs,
} from '../../lib/workspace.mjs';

const execFileAsync = promisify(execFile);

function assertDistArtifacts(repoDir, label) {
  const distDir = join(repoDir, 'dist');
  assert.ok(existsSync(distDir), `${label}: missing dist/ at ${distDir}`);
  for (const req of ['index.html', '404.html', 'sw.js', 'manifest.json']) {
    assert.ok(existsSync(join(distDir, req)), `${label}: missing dist/${req}`);
  }
  const assetsDir = join(distDir, 'assets');
  assert.ok(existsSync(assetsDir), `${label}: missing dist/assets/`);
  const assetFiles = readdirSync(assetsDir);
  assert.ok(assetFiles.some((f) => f.endsWith('.js')), `${label}: missing dist/assets/*.js`);
  assert.ok(assetFiles.some((f) => f.endsWith('.css')), `${label}: missing dist/assets/*.css`);
}

test('builds-and-artifacts: Portal dist/ contains required SPA and PWA build outputs', () => {
  assertDistArtifacts(PORTAL_DIR, 'openskill-galaxy.github.io');
});

test('builds-and-artifacts: module-template and representative modules dist/ contain required build outputs', () => {
  assertDistArtifacts(TEMPLATE_DIR, 'module-template');
  for (const slug of REPRESENTATIVE_MODULES) {
    assertDistArtifacts(join(WORKSPACE_ROOT, slug), slug);
  }
});

test('builds-and-artifacts: all 60 modules and module-template have matching vite base, manifest scope/start_url, and build script', () => {
  const allMods = [{ name: 'module-template', path: TEMPLATE_DIR }, ...getModuleDirs()];
  assert.equal(allMods.length, 61);

  for (const mod of allMods) {
    const expectedBase = `/${mod.name}/`;
    const viteRaw = readFileSync(join(mod.path, 'vite.config.ts'), 'utf8');
    const baseMatch = viteRaw.match(/base\s*:\s*["']([^"']+)["']/);
    assert.equal(baseMatch?.[1], expectedBase, `${mod.name}: vite.config.ts base mismatch`);

    const manifest = JSON.parse(readFileSync(join(mod.path, 'public', 'manifest.json'), 'utf8'));
    assert.equal(manifest.start_url, expectedBase, `${mod.name}: manifest start_url mismatch`);
    assert.equal(manifest.scope, expectedBase, `${mod.name}: manifest scope mismatch`);

    const pkg = JSON.parse(readFileSync(join(mod.path, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts?.build, 'tsc -b && vite build', `${mod.name}: package.json build script mismatch`);
  }
});

test('builds-and-artifacts: Portal and Module 404.html pathSegmentsToKeep & index.html SW registration are valid', () => {
  const portal404 = readFileSync(join(PORTAL_DIR, 'public', '404.html'), 'utf8');
  assert.match(portal404, /pathSegmentsToKeep\s*=\s*0/);
  const portalIndex = readFileSync(join(PORTAL_DIR, 'index.html'), 'utf8');
  assert.ok(!portalIndex.includes("register('./sw.js')") && !portalIndex.includes('register("./sw.js")'));

  const tpl404 = readFileSync(join(TEMPLATE_DIR, 'public', '404.html'), 'utf8');
  assert.match(tpl404, /pathSegmentsToKeep\s*=\s*1/);
  const tplIndex = readFileSync(join(TEMPLATE_DIR, 'index.html'), 'utf8');
  assert.ok(!tplIndex.includes("register('./sw.js')") && !tplIndex.includes('register("./sw.js")'));
});

test('builds-and-artifacts: Portal, module-template, and representative modules have node_modules installed', () => {
  const targets = [
    PORTAL_DIR,
    TEMPLATE_DIR,
    ...REPRESENTATIVE_MODULES.map((slug) => join(WORKSPACE_ROOT, slug)),
  ];
  for (const dir of targets) {
    assert.ok(existsSync(join(dir, 'node_modules')), `Missing node_modules at ${dir}`);
  }
});

test('builds-and-artifacts: npm run build (tsc -b && vite build) succeeds for Portal, Template, and sampled modules', async (t) => {
  if (process.env.SKIP_BUILD_EXEC === '1') {
    t.skip('Skipped npm run build execution because SKIP_BUILD_EXEC=1');
    return;
  }

  const targets = [
    { name: 'openskill-galaxy.github.io', dir: PORTAL_DIR },
    { name: 'module-template', dir: TEMPLATE_DIR },
    { name: 'module-algorithm-interview', dir: join(WORKSPACE_ROOT, 'module-algorithm-interview') },
    { name: 'module-python-basic', dir: join(WORKSPACE_ROOT, 'module-python-basic') },
    { name: 'module-digital-logic', dir: join(WORKSPACE_ROOT, 'module-digital-logic') },
  ];

  const tmpRoot = join('/tmp', `osg-e2e-build-${randomUUID()}`);
  mkdirSync(tmpRoot, { recursive: true });

  try {
    for (const target of targets) {
      assert.ok(
        existsSync(join(target.dir, 'node_modules')),
        `Cannot run npm run build in ${target.name}: node_modules is missing`
      );
      const tmpDir = join(tmpRoot, target.name);
      mkdirSync(tmpDir, { recursive: true });
      cpSync(target.dir, tmpDir, {
        recursive: true,
        filter: (src) => {
          const name = basename(src);
          return (
            name !== 'node_modules' &&
            name !== 'dist' &&
            name !== '.git' &&
            name !== 'tsconfig.tsbuildinfo' &&
            name !== 'tsconfig.node.tsbuildinfo'
          );
        },
      });
      symlinkSync(join(target.dir, 'node_modules'), join(tmpDir, 'node_modules'), 'dir');

      const { stdout, stderr } = await execFileAsync('npm', ['run', 'build'], {
        cwd: tmpDir,
        maxBuffer: 10 * 1024 * 1024,
      });
      assert.ok(
        existsSync(join(tmpDir, 'dist', 'index.html')),
        `${target.name}: build produced no dist/index.html\n${stdout}\n${stderr}`
      );
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
