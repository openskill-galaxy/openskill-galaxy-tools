import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures, discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { attachRuntimeGuards, escapeRegExp, waitForAppReady } from '../../lib/helpers.mjs';

test.describe('Tier 3 — Portal ↔ Module Deep-Link Pairwise (F2, F3, F4, F7)', () => {
  let server;
  let portal;
  let pyFx;

  test.beforeAll(async () => {
    portal = discoverPortalFixtures();
    pyFx = discoverModuleFixtures('module-python-basic');
    server = await startPreviewServer({
      requirePortal: true,
      moduleSlugs: ['module-python-basic', 'module-algorithm-interview', 'module-digital-logic'],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('Pairwise 1: Portal SearchBox lesson deep-link navigates cleanly to local module LessonPage', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    const lessonItem =
      portal.globalSearchIndex.find(
        (x) => x.type === 'lesson' && x.moduleSlug === 'module-python-basic'
      ) || portal.sampleLessonItem;

    let capturedProdUrl = null;
    await page.route('https://openskill-galaxy.github.io/**', async (route) => {
      capturedProdUrl = route.request().url();
      await route.abort();
    });

    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(lessonItem.title);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const opt = listbox
      .getByRole('option', { name: /课时/ })
      .filter({ hasText: lessonItem.title })
      .first();
    await expect(opt).toBeVisible();
    await opt.locator('button').click().catch(() => {});

    await expect.poll(() => capturedProdUrl).not.toBeNull();
    expect(capturedProdUrl).toContain(`/${lessonItem.moduleSlug}/?page=%2Flessons%2F`);

    const localUrl = capturedProdUrl.replace('https://openskill-galaxy.github.io', server.baseUrl);
    await page.unroute('https://openskill-galaxy.github.io/**');
    await page.goto(localUrl);
    await waitForAppReady(page);

    await expect(page).toHaveURL(
      new RegExp(`/${escapeRegExp(lessonItem.moduleSlug)}/lessons/${escapeRegExp(lessonItem.slug)}`)
    );
    await expect(page.locator('h1')).toContainText(lessonItem.title);
    guards.assertClean('deeplink-lesson');
  });

  test('Pairwise 2: Portal SearchBox question deep-link navigates cleanly to local module QuestionPlayer', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    const questionItem =
      portal.globalSearchIndex.find(
        (x) => x.type === 'question' && x.moduleSlug === 'module-python-basic'
      ) || portal.sampleQuestionItem;

    let capturedProdUrl = null;
    await page.route('https://openskill-galaxy.github.io/**', async (route) => {
      capturedProdUrl = route.request().url();
      await route.abort();
    });

    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const cleanQTitle = questionItem.title.replace(/\.\.\.$/, '').slice(0, 18);
    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(cleanQTitle);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const opt = listbox.getByRole('option', { name: /测试/ }).filter({ hasText: cleanQTitle }).first();
    await expect(opt).toBeVisible();
    await opt.locator('button').click().catch(() => {});

    await expect.poll(() => capturedProdUrl).not.toBeNull();
    expect(capturedProdUrl).toMatch(/\?page=%2Fquestions%2F/);

    const localUrl = capturedProdUrl.replace('https://openskill-galaxy.github.io', server.baseUrl);
    await page.unroute('https://openskill-galaxy.github.io/**');
    await page.goto(localUrl);
    await waitForAppReady(page);

    await expect(page).toHaveURL(/\/questions\//);
    await expect(page.locator('button.option-btn, button:has-text("提交本题")').first()).toBeVisible();
    guards.assertClean('deeplink-question');
  });

  test('Pairwise 3: Portal Category -> ModuleDetailPage -> Local Module Courses & Lessons', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const pyMod = portal.modules.find((m) => m.slug === 'module-python-basic');
    expect(pyMod).toBeTruthy();

    await page.goto(`${server.baseUrl}/modules?category=${pyMod.category}`);
    await waitForAppReady(page);

    await page.locator(`a[href="/modules/${pyMod.slug}"]`).first().click();
    await expect(page).toHaveURL(/\/modules\/module-python-basic/);
    await expect(page.locator('h1')).toContainText(pyMod.title);

    const launchLink = page.getByRole('link', { name: /进入模块学习/ });
    await expect(launchLink).toBeVisible();
    const launchHref = await launchLink.getAttribute('href');
    expect(launchHref).toBe(`https://openskill-galaxy.github.io/${pyMod.slug}/`);

    const localModUrl = launchHref.replace('https://openskill-galaxy.github.io', server.baseUrl);
    await page.goto(localModUrl);
    await waitForAppReady(page);

    await page.getByRole('link', { name: /课程/ }).first().click();
    await expect(page).toHaveURL(/\/module-python-basic\/courses/);
    await page.locator(`a[href*="/courses/${pyFx.courseSlug}"]`).first().click();
    await expect(page.locator('h1')).toContainText(pyFx.courses[0].title);
    guards.assertClean('portal-category-to-module');
  });
});
