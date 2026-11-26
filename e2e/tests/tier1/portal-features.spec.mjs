import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import {
  assertHeaderHealthy,
  assertNoHorizontalOverflow,
  attachRuntimeGuards,
  escapeRegExp,
  waitForAppReady,
} from '../../lib/helpers.mjs';

test.describe('Tier 1 — Portal Core Features (F2, F3, F7, F8)', () => {
  let server;
  let portal;

  test.beforeAll(async () => {
    portal = discoverPortalFixtures();
    server = await startPreviewServer({ requirePortal: true });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('F2: HomePage (/) renders hero, dynamic stats, categories, and updates links', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).toContainText(String(portal.modules.length));
    await expect(page.locator('body')).toContainText(String(portal.categories.length));

    await expect(page.getByRole('link', { name: /浏览技能模块/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /查看推荐路径/ })).toBeVisible();

    const updateLinks = page.locator('a[href*="/modules/module-"]');
    expect(await updateLinks.count()).toBeGreaterThan(0);
    guards.assertClean('portal-home');
  });

  test('F2: ModulesPage (/modules) renders 15 categories + "全部" and filters by category & query', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/modules`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toContainText(/技能模块图谱/);
    await expect(
      page.getByRole('button', { name: new RegExp(`^全部\\s+${portal.modules.length}$`) })
    ).toBeVisible();

    const targetCategory = portal.categories[0];
    const catMod = portal.modules.find((m) => m.category === targetCategory.id);
    expect(catMod).toBeTruthy();

    const catBtn = page.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(targetCategory.name)}(?:\\s+\\d+)?$`),
    });
    await catBtn.click();
    await expect(page).toHaveURL(new RegExp(`category=${escapeRegExp(targetCategory.id)}`));

    const filterInput = page.getByPlaceholder(/过滤模块、标签/);
    await filterInput.fill(catMod.title.slice(0, 4));
    await expect(page.locator(`a[href="/modules/${catMod.slug}"]`).first()).toBeVisible();
    guards.assertClean('portal-modules');
  });

  test('F2: ModuleDetailPage (/modules/:slug) renders metadata, topics, tags, and external launch link', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const mod = portal.sampleModule;
    await page.goto(`${server.baseUrl}/modules/${mod.slug}`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toContainText(mod.title);
    const launchLink = page.getByRole('link', { name: /进入模块学习/ });
    await expect(launchLink).toBeVisible();
    await expect(launchLink).toHaveAttribute('href', mod.url);
    const repoLink = page.locator(`a[href="${mod.repoUrl}"]`);
    await expect(repoLink).toBeVisible();
    guards.assertClean('portal-module-detail');
  });

  test('F2: LearningPathsPage (/paths) renders all paths and module links', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/paths`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toContainText(/学习路径/);
    for (const lp of portal.learningPaths.slice(0, 3)) {
      await expect(page.locator(`#${lp.slug}`)).toBeVisible();
    }
    guards.assertClean('portal-paths');
  });

  test('F2: AboutPage (/about) renders headings, GitHub link, and MIT license', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/about`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toContainText(/关于 OpenSkill Galaxy/);
    await expect(page.locator('main a[href="https://github.com/openskill-galaxy"]')).toBeVisible();
    await expect(page.locator('body')).toContainText(/MIT/);
    guards.assertClean('portal-about');
  });

  test('F3: Portal SearchBox navigates to /modules/:slug for module queries', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(portal.sampleModule.title);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox.getByText('正在加载全站讲义与题库索引')).toBeHidden();
    const firstOption = listbox.getByRole('option').first();
    await expect(firstOption).toBeVisible();
    await firstOption.locator('button').click();

    await expect(page).toHaveURL(/\/modules\/module-/);
    guards.assertClean('portal-search-module');
  });

  test('F3: Portal SearchBox generates valid ?page= deep-link URL for global-search-index lessons', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    let capturedUrl = null;
    await page.route('https://openskill-galaxy.github.io/**', async (route) => {
      capturedUrl = route.request().url();
      await route.abort();
    });

    const lessonItem = portal.sampleLessonItem;
    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(lessonItem.title);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const matchingOption = listbox
      .getByRole('option', { name: /课时/ })
      .filter({ hasText: lessonItem.title })
      .first();
    await expect(matchingOption).toBeVisible();

    await matchingOption.locator('button').click().catch(() => {});
    await expect.poll(() => capturedUrl).not.toBeNull();
    expect(capturedUrl).toMatch(
      /^https:\/\/openskill-galaxy\.github\.io\/module-[a-z0-9-]+\/\?page=%2F(lessons|questions)%2F/
    );
    guards.assertClean('portal-search-deeplink');
  });

  test('F3: Portal SearchBox supports keyboard Enter navigation and tag matching', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    let capturedUrl = null;
    await page.route('https://openskill-galaxy.github.io/**', async (route) => {
      capturedUrl = route.request().url();
      await route.abort();
    });

    const tagMod = portal.modules.find((m) => Array.isArray(m.tags) && m.tags.length > 0) || portal.sampleModule;
    const tagQuery = tagMod.tags[0];

    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(tagQuery);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox.getByText('正在加载全站讲义与题库索引')).toBeHidden();
    await expect(listbox.getByRole('option').first()).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect
      .poll(() => (capturedUrl ? 'external' : page.url()))
      .toMatch(/external|\/modules\/module-|\/paths|\/modules\?category=/);
    guards.assertClean('portal-search-tag-enter');
  });

  test('F8: Portal theme toggle switches html.light/dark and persists across reload', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const html = page.locator('html');
    const initiallyDark = await html.evaluate((el) => el.classList.contains('dark'));
    const toggleBtn = page.getByRole('button', { name: '切换主题' });
    await toggleBtn.click();

    await expect
      .poll(() => html.evaluate((el) => el.classList.contains('dark')))
      .toBe(!initiallyDark);

    const expectedTheme = !initiallyDark ? 'dark' : 'light';
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(expectedTheme);

    await page.reload();
    await waitForAppReady(page);
    expect(await html.evaluate((el) => el.classList.contains('dark'))).toBe(!initiallyDark);
    guards.assertClean('portal-theme-toggle');
  });

  test('F8: Portal desktop and mobile header & layout render without overflow or overlap', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/`);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    for (const vp of [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 375, height: 812, name: 'mobile' },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await assertNoHorizontalOverflow(page, `portal-${vp.name}`);
      await assertHeaderHealthy(page, `portal-${vp.name}`);
    }
    guards.assertClean('portal-layout-smoke');
  });

  test('F6: Portal BackupModal opens with export/import controls and closes on Escape', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    await page.getByRole('button', { name: '备份' }).click();
    const dialog = page.getByRole('dialog', { name: '备份与同步' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /导出进度备份/ })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    guards.assertClean('portal-backup-modal');
  });

  test('F6: Portal Cloud Sync AppwriteModal opens and switches tabs cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    await page.getByRole('button', { name: '云同步' }).click();
    const dialog = page.getByRole('dialog', { name: 'Appwrite 云端集成' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('tab', { name: '配置端点' }).click();
    await expect(dialog.locator('input')).toHaveCount(2);

    await dialog.getByRole('button', { name: '关闭' }).click();
    await expect(dialog).toBeHidden();
    guards.assertClean('portal-appwrite-modal');
  });

  test('F7: Portal Service Worker registers /sw.js cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const swScript = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || null;
    });
    expect(swScript).toBeTruthy();
    expect(swScript).toMatch(/\/sw\.js$/);
    guards.assertClean('portal-sw');
  });

  test('F7: Portal deep-route direct navigation restores via 404.html cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const mod = portal.sampleModule;
    await page.goto(`${server.baseUrl}/modules/${mod.slug}`);
    await waitForAppReady(page);

    expect(await page.evaluate(() => window.location.pathname)).toBe(`/modules/${mod.slug}`);
    await expect(page.locator('h1')).toContainText(mod.title);
    guards.assertClean('portal-404-deep-route');
  });

  test('F2: Portal Footer displays brand and repository links', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(/OpenSkill Galaxy/);
    await expect(footer.locator('a[href="https://github.com/openskill-galaxy"]')).toBeVisible();
    guards.assertClean('portal-footer');
  });
});
