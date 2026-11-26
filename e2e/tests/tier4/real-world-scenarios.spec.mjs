import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures, discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { measureContrastInPage } from '../../lib/contrast.mjs';
import {
  REPRESENTATIVE_MODULES,
  SCRIPTS_DIR,
  WORKSPACE_ROOT,
  createIsolatedWorkspace,
  getAllRepoDirs,
} from '../../lib/workspace.mjs';
import {
  assertHeaderHealthy,
  assertNoHorizontalOverflow,
  attachRuntimeGuards,
  clickOptionByKey,
  escapeRegExp,
  waitForAppReady,
} from '../../lib/helpers.mjs';

const execFileAsync = promisify(execFile);

async function readDownloadJson(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test.describe('Tier 4 — Real-World User & Platform Release Scenarios', () => {
  let server;
  let portal;

  test.beforeAll(async () => {
    portal = discoverPortalFixtures();
    server = await startPreviewServer({
      requirePortal: true,
      includeTemplate: true,
      moduleSlugs: REPRESENTATIVE_MODULES,
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('Scenario 1: End-to-End Learner Journey (Portal -> Search -> Module -> Lesson -> Complete/Fav -> Quiz -> WeakPointDiagnostics)', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const pyFx = discoverModuleFixtures('module-python-basic');

    let capturedProdUrl = null;
    await page.route('https://openskill-galaxy.github.io/**', async (route) => {
      capturedProdUrl = route.request().url();
      await route.abort();
    });

    // 1. Start on Portal Home
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);
    await expect(page.locator('h1')).toBeVisible();

    // 2. Search for a Python lesson via global SearchBox
    const pyLessonItem =
      portal.globalSearchIndex.find(
        (x) => x.type === 'lesson' && x.moduleSlug === 'module-python-basic'
      ) || portal.sampleLessonItem;
    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(pyLessonItem.title);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const prefixRe = new RegExp(escapeRegExp(pyLessonItem.title.slice(0, 8)));
    const lessonOption = listbox
      .getByRole('option', { name: /课时/ })
      .filter({ hasText: prefixRe })
      .first();
    await expect(lessonOption).toBeVisible();
    await lessonOption.locator('button').click().catch(() => {});

    await expect.poll(() => capturedProdUrl).not.toBeNull();
    const localDeepLink = capturedProdUrl.replace('https://openskill-galaxy.github.io', server.baseUrl);
    await page.unroute('https://openskill-galaxy.github.io/**');

    // 3. Land in Module LessonPage, mark complete & favorite
    await page.goto(localDeepLink);
    await waitForAppReady(page);
    await expect(page.locator('h1')).toContainText(pyLessonItem.title);

    const startBtn = page.getByRole('button', { name: '开始学习' });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    const completeBtn = page.getByRole('button', { name: '标记完成' });
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();
    await expect(page.locator('body')).toContainText('✓ 已完成');

    const favBtn = page.getByRole('button', { name: /收藏/ }).first();
    await expect(favBtn).toBeVisible();
    await favBtn.click();
    await expect(favBtn).toContainText('已收藏');

    // 4. Answer a question wrongly and check WeakPointDiagnostics on Module Home
    const q = pyFx.singleQuestion;
    await page.goto(`${server.baseUrl}/module-python-basic/questions/${q.slug}`);
    await waitForAppReady(page);
    await clickOptionByKey(page, pyFx.wrongOptionKey);
    await page.getByRole('button', { name: /提交本题/ }).click();
    await expect(page.locator('body')).toContainText(/回答错误/);

    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);
    await expect(page.locator('body')).not.toContainText(/暂无错题记录/);
    guards.assertClean('scenario-1-learner-journey');
  });

  test('Scenario 2: Platform Release Pipeline & Ecosystem Consistency Check (CLI + Isolated Regeneration)', async () => {
    const validateRes = await execFileAsync(
      'node',
      [join(SCRIPTS_DIR, 'src/validate-module.mjs'), '--all', '--include-template'],
      { cwd: SCRIPTS_DIR, maxBuffer: 16 * 1024 * 1024 }
    );
    expect(validateRes.stdout).toMatch(/Passed:\s*61\/61/);

    const auditRes = await execFileAsync(
      'node',
      [join(SCRIPTS_DIR, 'src/audit-questions.mjs')],
      { cwd: SCRIPTS_DIR, maxBuffer: 16 * 1024 * 1024 }
    );
    expect(auditRes.stdout).toMatch(/modules=60.*problems=0/);

    expect(portal.platformStats.moduleCount).toBe(60);
    expect(portal.siteHealthReport.summary.healthyModules).toBe(60);
    expect(portal.siteHealthReport.summary.totalIssues).toBe(0);

    const iso = createIsolatedWorkspace(['module-digital-logic', 'module-python-basic']);
    try {
      const portalModsPath = join(iso.portalDir, 'public/data/modules.json');
      const allMods = JSON.parse(readFileSync(portalModsPath, 'utf8'));
      writeFileSync(
        portalModsPath,
        JSON.stringify(
          allMods.filter((m) => ['module-digital-logic', 'module-python-basic'].includes(m.slug)),
          null,
          2
        ) + '\n'
      );

      const env = { ...process.env, OSG_ROOT: iso.root };
      await execFileAsync('node', [join(SCRIPTS_DIR, 'src/fix-stats.mjs')], { cwd: SCRIPTS_DIR, env });
      await execFileAsync('node', [join(SCRIPTS_DIR, 'src/optimize-pwa-and-search.mjs')], { cwd: SCRIPTS_DIR, env });
      await execFileAsync('node', [join(SCRIPTS_DIR, 'src/build-global-index.mjs')], { cwd: SCRIPTS_DIR, env });
      const hr = await execFileAsync(
        'node',
        [join(SCRIPTS_DIR, 'src/build-health-report.mjs'), '--strict'],
        { cwd: SCRIPTS_DIR, env }
      );
      expect(hr.stdout).toMatch(/Content healthy:\s*2\/2/);
    } finally {
      iso.cleanup();
    }
  });

  test('Scenario 3: Multi-Module Production Preview Smoke Sweep (Portal + Template + 6 Group A/B Modules)', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);
    await expect(page.locator('h1')).toBeVisible();

    const targets = ['module-template', ...REPRESENTATIVE_MODULES];
    for (const slug of targets) {
      const fx = discoverModuleFixtures(slug);
      for (const rel of ['', 'courses', `lessons/${fx.lessonSlug}`, `questions/${fx.singleQuestion.slug}`]) {
        await page.goto(`${server.baseUrl}/${slug}/${rel}`);
        await waitForAppReady(page);
        await expect(page.locator('h1')).toBeVisible();
      }
    }
    guards.assertClean('scenario-3-multi-module-sweep');
  });

  test('Scenario 4: Multi-Viewport Desktop (1440x900) & Mobile (375x812) Light/Dark Visual & Contrast Audit', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const viewports = [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 375, height: 812, name: 'mobile' },
    ];

    const pagesToAudit = [
      `${server.baseUrl}/`,
      `${server.baseUrl}/modules`,
      `${server.baseUrl}/module-python-basic/`,
      `${server.baseUrl}/module-algorithm-interview/lessons/${discoverModuleFixtures('module-algorithm-interview').lessonSlug}`,
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const url of pagesToAudit) {
        await page.goto(url);
        await waitForAppReady(page);
        for (const dark of [false, true]) {
          const curDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
          if (curDark !== dark) {
            await page
              .locator('button[aria-label="切换主题"], button[aria-label="切换主题模式"]')
              .first()
              .click();
          }
          await assertNoHorizontalOverflow(page, `${vp.name}-${dark ? 'dark' : 'light'}-${url}`);
          await assertHeaderHealthy(page, `${vp.name}-${dark ? 'dark' : 'light'}-${url}`);
          const contrasts = await measureContrastInPage(page, ['h1', 'main p']);
          for (const c of contrasts) {
            expect(c.found, `Scenario 4 contrast missing: ${c.selector} on ${url}`).toBe(true);
            expect(c.ratio, `Scenario 4 contrast for ${c.selector} on ${url}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
    guards.assertClean('scenario-4-visual-audit');
  });

  test('Scenario 5: PWA Offline Service Worker & Bookmark Deep-Link Restoration Journey', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const pyFx = discoverModuleFixtures('module-python-basic');

    async function expectActiveWorker(scope) {
      await expect.poll(() => page.evaluate(async (scopePath) => {
        const registration = await navigator.serviceWorker.getRegistration(scopePath);
        if (!registration || new URL(registration.scope).pathname !== scopePath) return null;
        return registration.active?.state === 'activated' ? registration.active.scriptURL : null;
      }, scope)).toBe(`${server.baseUrl}${scope}sw.js`);
    }

    // Portal SW + 404 deep bookmark restore
    await page.goto(`${server.baseUrl}/modules/module-python-basic?from=bookmark&ref=share#topics`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pyFx.meta.title);
    await expectActiveWorker('/');
    expect(await page.evaluate(() => window.location.search)).toContain('from=bookmark');
    expect(await page.evaluate(() => window.location.hash)).toBe('#topics');

    // Module SW + 404 deep bookmark restore
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}?step=2&mode=review#notes`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(pyFx.lessons[0].title);
    await expectActiveWorker('/module-python-basic/');
    expect(await page.evaluate(() => window.location.pathname)).toBe(
      `/module-python-basic/lessons/${pyFx.lessonSlug}`
    );
    expect(await page.evaluate(() => window.location.search)).toContain('step=2');
    expect(await page.evaluate(() => window.location.hash)).toBe('#notes');
    guards.assertClean('scenario-5-pwa-deeplink');
  });

  test('Scenario 6: Cross-Module Backup, Scoped Reset & 63-Repo Git Boundary Preservation Journey', async ({ page }) => {
    const repos = getAllRepoDirs(WORKSPACE_ROOT);
    const headsBefore = new Map();
    for (const repo of repos) {
      const { stdout } = await execFileAsync('git', ['-C', repo.path, 'rev-parse', 'HEAD']);
      headsBefore.set(repo.name, stdout.trim());
    }
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const pyFx = discoverModuleFixtures('module-python-basic');
    const rustFx = discoverModuleFixtures('module-rust-basic');

    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}`);
    await waitForAppReady(page);
    const pyFavBtn = page.getByRole('button', { name: /收藏/ }).first();
    await expect(pyFavBtn).toBeVisible();
    await pyFavBtn.click();
    await expect(pyFavBtn).toContainText('已收藏');

    await page.goto(`${server.baseUrl}/module-rust-basic/lessons/${rustFx.lessonSlug}`);
    await waitForAppReady(page);
    const rustFavBtn = page.getByRole('button', { name: /收藏/ }).first();
    await expect(rustFavBtn).toBeVisible();
    await rustFavBtn.click();
    await expect(rustFavBtn).toContainText('已收藏');

    // Verify multi-module BackupModal export includes both scoped modules & zero osg-mt:
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);
    await page.locator('button[aria-label="本地 JSON 备份"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const exportBtn = dialog.getByRole('button', { name: /导出/ });
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    const exportedJson = await readDownloadJson(download);
    const keys = Object.keys(exportedJson);
    expect(keys.some((k) => k.startsWith('osg:module-python-basic:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('osg:module-rust-basic:'))).toBe(true);
    expect(keys.filter((k) => k.startsWith('osg-mt:'))).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Scoped reset on module-python-basic leaves module-rust-basic intact
    page.on('dialog', async (d) => d.accept());
    await page.goto(`${server.baseUrl}/module-python-basic/about`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /清空本地数据记录/ }).click();

    await page.goto(`${server.baseUrl}/module-rust-basic/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).toContainText(rustFx.lessons[0].title);
    guards.assertClean('scenario-6-backup-reset');

    // Compare with the revisions at the start of this run.
    for (const repo of repos) {
      const { stdout } = await execFileAsync('git', ['-C', repo.path, 'rev-parse', 'HEAD']);
      expect(stdout.trim(), repo.name).toBe(headsBefore.get(repo.name));
    }
  });
});
