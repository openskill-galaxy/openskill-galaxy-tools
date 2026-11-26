import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  WORKSPACE_ROOT,
  getModuleDirs,
  getAllRepoDirs,
  createIsolatedWorkspace,
  REPRESENTATIVE_MODULES,
} from '../lib/workspace.mjs';
import { resolveBrowserExecutablePath, launchBrowser } from '../lib/browser.mjs';
import { startPreviewServer } from '../lib/server.mjs';
import { getContrastRatio, measureContrastInPage, measureCssVarContrast } from '../lib/contrast.mjs';
import { discoverPortalFixtures, discoverModuleFixtures } from '../lib/fixtures.mjs';
import { attachRuntimeGuards } from '../lib/helpers.mjs';

test('self-check: workspace discovery finds 60 modules and 63 repos', () => {
  assert.ok(existsSync(WORKSPACE_ROOT), `WORKSPACE_ROOT missing: ${WORKSPACE_ROOT}`);
  const modules = getModuleDirs();
  const repos = getAllRepoDirs();
  assert.equal(modules.length, 60);
  assert.equal(repos.length, 63);
});

test('self-check: createIsolatedWorkspace isolates and cleans up temp dir', () => {
  const iso = createIsolatedWorkspace(['module-digital-logic']);
  try {
    assert.ok(iso.root.startsWith('/tmp/osg-e2e-cli-'));
    assert.ok(existsSync(join(iso.portalDir, 'public', 'data', 'modules.json')));
    assert.ok(existsSync(join(iso.templateDir, 'public', 'data', 'module.json')));
    assert.ok(existsSync(join(iso.moduleDirs['module-digital-logic'], 'public', 'data', 'module.json')));
  } finally {
    iso.cleanup();
  }
  assert.equal(existsSync(iso.root), false);
});

test('self-check: WCAG contrast math matches known specifications', () => {
  assert.equal(Number(getContrastRatio('#000000', '#ffffff').toFixed(2)), 21);
  assert.ok(getContrastRatio('#4f46e5', '#ffffff') >= 4.5);
  assert.ok(getContrastRatio('#8b93a4', '#ffffff') < 4.5);
  assert.ok(getContrastRatio('rgba(255, 255, 255, 0.9)', '#14161d') >= 12);
});

test('self-check: fixtures discovery works across Portal, template, and representative modules', () => {
  const portal = discoverPortalFixtures();
  assert.equal(portal.modules.length, 60);
  assert.equal(portal.categories.length, 15);
  assert.ok(portal.sampleModuleSlug);

  const targets = [
    'module-template',
    'module-algorithm-interview',
    'module-python-basic',
    'module-llm-application',
    'module-digital-logic',
  ];
  for (const slug of targets) {
    const fx = discoverModuleFixtures(slug);
    assert.ok(fx.courseSlug, `${slug}: courseSlug`);
    assert.ok(fx.lessonSlug, `${slug}: lessonSlug`);
    assert.ok(fx.kpSlug, `${slug}: kpSlug`);
    assert.ok(fx.singleQuestion, `${slug}: singleQuestion`);
    assert.ok(fx.wrongOptionKey, `${slug}: wrongOptionKey`);
    assert.ok(fx.examSlug, `${slug}: examSlug`);
    assert.ok(fx.caseSlug, `${slug}: caseSlug`);
    assert.ok(fx.searchKeyword, `${slug}: searchKeyword`);
    const tagMatch = fx.matchingTagFor('courses') || fx.matchingTagFor('knowledge');
    assert.ok(tagMatch && tagMatch.expectedCount >= 1, `${slug}: matching tag`);
  }
  assert.ok(REPRESENTATIVE_MODULES.length >= 6);
});

test('self-check: static preview server multi-mount, 404.html fallback, MIME types, traversal, and missing dist error', async () => {
  const tmpDir = join('/tmp', `osg-e2e-self-${randomUUID()}`);
  try {
    // Missing dist throws loudly
    await assert.rejects(
      () => startPreviewServer({ portalDistDir: join(tmpDir, 'nonexistent-dist'), requirePortal: true }),
      /Missing dist\/ directory/
    );

    const portalDist = join(tmpDir, 'portal-dist');
    const modDist = join(tmpDir, 'mod-dist');
    mkdirSync(join(portalDist, 'assets'), { recursive: true });
    mkdirSync(join(modDist, 'assets'), { recursive: true });
    mkdirSync(join(modDist, 'data'), { recursive: true });

    writeFileSync(
      join(portalDist, 'index.html'),
      '<!doctype html><html><body style="background:#fff"><h1 id="title" style="color:#0b0f19">Portal Mock</h1><p id="subtle" style="color:#596275">Subtle</p></body></html>'
    );
    writeFileSync(join(portalDist, '404.html'), '<!doctype html><html><body>Portal 404 SPA</body></html>');

    writeFileSync(
      join(modDist, 'index.html'),
      '<!doctype html><html><body style="background:#fff"><h1 id="mod-title" style="color:#0b0f19">Module Mock</h1></body></html>'
    );
    writeFileSync(join(modDist, '404.html'), '<!doctype html><html><body>Module 404 SPA</body></html>');
    writeFileSync(join(modDist, 'assets', 'app.js'), 'console.log("ok");');
    writeFileSync(join(modDist, 'assets', 'style.css'), 'body { margin: 0; }');
    writeFileSync(join(modDist, 'data', 'info.json'), '{"ok":true}');
    writeFileSync(join(modDist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    const server = await startPreviewServer({
      portalDistDir: portalDist,
      moduleMounts: { 'module-alpha': modDist },
    });

    try {
      const rRoot = await fetch(`${server.baseUrl}/`);
      assert.equal(rRoot.status, 200);
      assert.match(rRoot.headers.get('content-type') || '', /text\/html/);
      assert.match(await rRoot.text(), /Portal Mock/);

      const rMod = await fetch(`${server.baseUrl}/module-alpha/`);
      assert.equal(rMod.status, 200);
      assert.match(await rMod.text(), /Module Mock/);

      const rModNoSlash = await fetch(`${server.baseUrl}/module-alpha?page=test`, { redirect: 'manual' });
      assert.equal(rModNoSlash.status, 301);
      assert.equal(rModNoSlash.headers.get('location'), '/module-alpha/?page=test');

      const rJs = await fetch(`${server.baseUrl}/module-alpha/assets/app.js`);
      assert.equal(rJs.status, 200);
      assert.match(rJs.headers.get('content-type') || '', /javascript/);

      const rCss = await fetch(`${server.baseUrl}/module-alpha/assets/style.css`);
      assert.equal(rCss.status, 200);
      assert.match(rCss.headers.get('content-type') || '', /text\/css/);

      const rJson = await fetch(`${server.baseUrl}/module-alpha/data/info.json`);
      assert.equal(rJson.status, 200);
      assert.match(rJson.headers.get('content-type') || '', /application\/json/);

      const rSvg = await fetch(`${server.baseUrl}/module-alpha/favicon.svg`);
      assert.equal(rSvg.status, 200);
      assert.match(rSvg.headers.get('content-type') || '', /image\/svg\+xml/);

      const rPortal404 = await fetch(`${server.baseUrl}/missing/portal/route`);
      assert.equal(rPortal404.status, 404);
      assert.match(rPortal404.headers.get('content-type') || '', /text\/html/);
      assert.match(await rPortal404.text(), /Portal 404 SPA/);

      const rMod404 = await fetch(`${server.baseUrl}/module-alpha/lessons/nonexistent`);
      assert.equal(rMod404.status, 404);
      assert.match(rMod404.headers.get('content-type') || '', /text\/html/);
      assert.match(await rMod404.text(), /Module 404 SPA/);

      const rAsset404 = await fetch(`${server.baseUrl}/module-alpha/assets/missing.js`);
      assert.equal(rAsset404.status, 404);
      assert.match(rAsset404.headers.get('content-type') || '', /text\/plain/);

      const traversalStatus = await new Promise((resolveStatus, rejectStatus) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: server.port, path: '/module-alpha/%2e%2e/secret', method: 'GET' },
          (res) => {
            res.resume();
            resolveStatus(res.statusCode);
          }
        );
        req.on('error', rejectStatus);
        req.end();
      });
      assert.equal(traversalStatus, 403);

      // Browser launch + DOM + contrast + overflow self-check
      const executablePath = resolveBrowserExecutablePath({ headless: true });
      assert.ok(existsSync(executablePath), `Browser binary missing: ${executablePath}`);

      const browser = await launchBrowser({ executablePath });
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        await page.goto(`${server.baseUrl}/`);
        const heading = await page.locator('#title').textContent();
        assert.equal(heading, 'Portal Mock');

        const contrast = await measureContrastInPage(page, ['#title', '#subtle']);
        assert.equal(contrast.length, 2);
        assert.ok(contrast[0].ratio >= 10, `Expected high title contrast, got ${contrast[0].ratio}`);
        assert.ok(contrast[1].ratio >= 4.5, `Expected AA subtle contrast >= 4.5, got ${contrast[1].ratio}`);

        const overflow = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: window.innerWidth,
        }));
        assert.ok(overflow.sw <= overflow.iw);
      } finally {
        await browser.close();
      }
    } finally {
      await server.close();
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('self-check: createIsolatedWorkspace cleans up /tmp directory on nonexistent module error', () => {
  const ownPrefix = `osg-e2e-cli-${process.pid}-`;
  const before = new Set(readdirSync('/tmp').filter((d) => d.startsWith(ownPrefix)));
  assert.throws(
    () => createIsolatedWorkspace(['module-nonexistent-xyz']),
    /createIsolatedWorkspace: module does not exist/
  );
  const after = readdirSync('/tmp').filter((d) => d.startsWith(ownPrefix) && !before.has(d));
  assert.deepEqual(after, [], `Leaked /tmp dirs on error: ${JSON.stringify(after)}`);
});

test('self-check: attachRuntimeGuards handles allowDocument404 without masking asset 404s, console errors, or pageerrors', async () => {
  const tmpDir = join('/tmp', `osg-e2e-guards-${randomUUID()}`);
  try {
    const portalDist = join(tmpDir, 'portal-dist');
    const modDist = join(tmpDir, 'mod-dist');
    mkdirSync(join(portalDist), { recursive: true });
    mkdirSync(join(modDist, 'assets'), { recursive: true });

    writeFileSync(
      join(portalDist, 'index.html'),
      '<!doctype html><html><body><h1>Portal</h1></body></html>'
    );
    writeFileSync(
      join(portalDist, '404.html'),
      '<!doctype html><html><body><h1>Portal 404</h1></body></html>'
    );
    writeFileSync(
      join(modDist, 'index.html'),
      '<!doctype html><html><head><style>:root{--fg:#5e6778;--bg:#ffffff;}</style></head><body><h1>Mod</h1></body></html>'
    );
    writeFileSync(
      join(modDist, '404.html'),
      '<!doctype html><html><head><style>:root{--fg:#5e6778;--bg:#ffffff;}</style></head><body><h1>Mod 404 SPA</h1></body></html>'
    );

    const server = await startPreviewServer({
      portalDistDir: portalDist,
      moduleMounts: { 'module-alpha': modDist },
    });
    const browser = await launchBrowser();
    try {
      // 1. allowDocument404: true passes on 404 document (with and without #hash) + measureCssVarContrast works
      {
        const page = await browser.newPage();
        const guards = attachRuntimeGuards(page, { allowDocument404: true });
        await page.goto(`${server.baseUrl}/module-alpha/lessons/nonexistent#section-1`);
        await page.waitForLoadState('domcontentloaded');
        guards.assertClean('allow-doc-404-hash');
        const cssVarRes = await measureCssVarContrast(page, '--fg', '--bg');
        assert.equal(cssVarRes.found, true);
        assert.ok(cssVarRes.ratio >= 4.5);
        await page.close();
      }

      // 2. allowDocument404: false throws on 404 document
      {
        const page = await browser.newPage();
        const guards = attachRuntimeGuards(page, { allowDocument404: false });
        await page.goto(`${server.baseUrl}/module-alpha/lessons/nonexistent`);
        await page.waitForLoadState('domcontentloaded');
        assert.throws(() => guards.assertClean('disallow-doc-404'));
        assert.ok(guards.badResponses.some((r) => r.startsWith('404 document')));
        await page.close();
      }

      // 3. allowDocument404: true still catches missing .js asset 404
      {
        const page = await browser.newPage();
        const guards = attachRuntimeGuards(page, { allowDocument404: true });
        await page.goto(`${server.baseUrl}/module-alpha/`);
        await page.evaluate(() => fetch('/module-alpha/assets/missing.js'));
        await page.waitForTimeout(50);
        assert.throws(() => guards.assertClean('asset-404'));
        assert.ok(guards.badResponses.some((r) => r.includes('/assets/missing.js')));
        await page.close();
      }

      // 4. allowDocument404: true still catches real console.error on a 404 document
      {
        const page = await browser.newPage();
        const guards = attachRuntimeGuards(page, { allowDocument404: true });
        await page.goto(`${server.baseUrl}/module-alpha/lessons/nonexistent`);
        await page.evaluate(() => console.error('real-js-error'));
        assert.throws(() => guards.assertClean('real-console-error'));
        assert.ok(guards.consoleErrors.includes('real-js-error'));
        await page.close();
      }

      // 5. allowDocument404: true still catches uncaught pageerror
      {
        const page = await browser.newPage();
        const guards = attachRuntimeGuards(page, { allowDocument404: true });
        await page.goto(`${server.baseUrl}/module-alpha/lessons/nonexistent`);
        await page.evaluate(() => {
          setTimeout(() => {
            throw new Error('boom');
          }, 0);
        });
        await page.waitForTimeout(50);
        assert.throws(() => guards.assertClean('uncaught-pageerror'));
        assert.ok(guards.pageErrors.some((e) => e.includes('boom')));
        await page.close();
      }
    } finally {
      await browser.close();
      await server.close();
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
