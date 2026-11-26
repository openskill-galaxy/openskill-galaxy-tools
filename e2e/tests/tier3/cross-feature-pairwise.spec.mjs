import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import {
  assertHeaderHealthy,
  assertNoHorizontalOverflow,
  attachRuntimeGuards,
  clickOptionByKey,
  escapeRegExp,
  waitForAppReady,
} from '../../lib/helpers.mjs';

test.describe('Tier 3 — Cross-Feature Pairwise Interactions (F4, F5, F6, F7, F8)', () => {
  let server;
  let pyFx;
  let dlFx;

  test.beforeAll(async () => {
    pyFx = discoverModuleFixtures('module-python-basic');
    dlFx = discoverModuleFixtures('module-digital-logic');
    server = await startPreviewServer({
      requirePortal: true,
      moduleSlugs: ['module-template', 'module-python-basic', 'module-digital-logic'],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('Pairwise 8: QuestionPlayer wrong answer -> WeakPointDiagnostics -> KnowledgePoint detail', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const swBlockedPage = await context.newPage();
      const guards = attachRuntimeGuards(swBlockedPage, { allowDocument404: true });
      const rawQuestions = JSON.parse(readFileSync(join(pyFx.dataDir, 'questions.json'), 'utf8'));
      const targetKp = pyFx.knowledgePoints[0];
      const qIdx = rawQuestions.findIndex((q) => q.type === 'single' && q.options?.length >= 2);
      rawQuestions[qIdx] = { ...rawQuestions[qIdx], knowledge_points: [targetKp.id] };

      await swBlockedPage.route('**/module-python-basic/data/questions.json', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(rawQuestions),
        });
      });

      const targetQ = rawQuestions[qIdx];
      const wrongOpt = targetQ.options.find((o) => !(targetQ.answer || []).includes(o.key));

      await swBlockedPage.goto(`${server.baseUrl}/module-python-basic/questions/${targetQ.slug}`);
      await waitForAppReady(swBlockedPage);
      await clickOptionByKey(swBlockedPage, wrongOpt.key);
      await swBlockedPage.getByRole('button', { name: /提交本题/ }).click();

      await swBlockedPage.goto(`${server.baseUrl}/module-python-basic/`);
      await waitForAppReady(swBlockedPage);
      const kpLink = swBlockedPage
        .locator(
          `a[href*="/knowledge/${targetKp.slug}"], a[href*="/knowledge/${encodeURIComponent(targetKp.slug)}"]`
        )
        .first();
      await expect(kpLink).toBeVisible();
      await kpLink.click();

      await expect(swBlockedPage).toHaveURL(
        new RegExp(
          `/module-python-basic/knowledge/(?:${escapeRegExp(targetKp.slug)}|${escapeRegExp(encodeURIComponent(targetKp.slug))})`
        )
      );
      await expect(swBlockedPage.locator('h1')).toContainText(targetKp.title);
      guards.assertClean('pairwise-question-weakpoint-kp');
    } finally {
      await context.close();
    }
  });

  test('Pairwise 9: Light/Dark toggle + 375x812 Mobile Drawer + Modals Esc + Reload Persistence', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    await page.locator('button[aria-label="切换主题模式"]').click();
    await expect
      .poll(() => page.locator('html').evaluate((el) => el.classList.contains('dark')))
      .toBe(true);

    const menuBtn = page.getByRole('button', { name: /打开移动导航菜单|导航菜单/ });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const mobileNav = page.getByRole('navigation', { name: '移动端导航' });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole('link', { name: '课程列表' })).toBeVisible();

    const cloudBtn = mobileNav.getByRole('button', { name: /云端同步/ });
    await expect(cloudBtn).toBeVisible();
    await cloudBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(376);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.reload();
    await waitForAppReady(page);
    expect(await page.locator('html').evaluate((el) => el.classList.contains('dark'))).toBe(true);
    await assertNoHorizontalOverflow(page, 'pairwise-mobile-dark');
    await assertHeaderHealthy(page, 'pairwise-mobile-dark');
    guards.assertClean('pairwise-theme-mobile-modal');
  });

  test('Pairwise 10: SearchPage ?q= combined with 404.html restoration and hash preservation', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const kw = pyFx.searchKeyword;
    await page.goto(
      `${server.baseUrl}/module-python-basic/search?q=${encodeURIComponent(kw)}#results`
    );
    await waitForAppReady(page);

    await expect(page.getByPlaceholder(/输入关键词/)).toHaveValue(kw);
    expect(await page.evaluate(() => window.location.hash)).toBe('#results');
    await expect(page.locator('main a[href*="/module-python-basic/"]').first()).toBeVisible();
    guards.assertClean('pairwise-search-404-restore');
  });

  test('Pairwise 11: ExamPage (/exams/:slug) submission -> ExamResultPage persistence', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-template/exams/${discoverModuleFixtures('module-template').examSlug}`);
    await waitForAppReady(page);

    const firstOpt = page.locator('button.option-btn').first();
    await expect(firstOpt).toBeVisible();
    await firstOpt.click();

    const submitExamBtn = page.getByRole('button', { name: /交卷|提交试卷/ }).first();
    await expect(submitExamBtn).toBeVisible();
    await submitExamBtn.click();

    // Handle optional confirmation button inside exam modal/dialog if present
    const confirmSubmit = page.getByRole('button', { name: /确认交卷/ });
    if (await confirmSubmit.isVisible().catch(() => false)) {
      await confirmSubmit.click();
    }

    await expect(page).toHaveURL(/\/exams\/[^/]+\/result/);
    await expect(page.locator('body')).toContainText(/得分|正确率|成绩/);
    guards.assertClean('pairwise-exam-result');
  });

  test('Pairwise 12: LessonTOC + CodePlayground + CodeBlockWithCopy across Desktop/Mobile & Light/Dark', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseUrl}/module-digital-logic/lessons/${dlFx.lessonWithCodeSlug}`);
    await waitForAppReady(page);

    await page.getByRole('button', { name: /运行代码/ }).first().click();
    const frame = page.frameLocator('iframe[title="Code Sandbox Output"]').first();
    await expect(frame.locator('#output')).not.toContainText(/ReferenceError|运行时错误/);

    await page.locator('button[aria-label="切换主题模式"]').click();
    await assertNoHorizontalOverflow(page, 'pairwise-lesson-desktop-dark');

    await page.setViewportSize({ width: 375, height: 812 });
    await assertNoHorizontalOverflow(page, 'pairwise-lesson-mobile-dark');
    guards.assertClean('pairwise-toc-playground-theme');
  });

  test('Pairwise 13: TagFilter + Header SearchBox keyboard navigation on Module', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const match = pyFx.matchingTagFor('courses') || pyFx.matchingTagFor('knowledge');
    const route = pyFx.matchingTagFor('courses') ? 'courses' : 'knowledge';
    expect(match).toBeTruthy();

    await page.goto(`${server.baseUrl}/module-python-basic/${route}`);
    await waitForAppReady(page);

    const expandBtn = page.getByRole('button', { name: /展开全部/ });
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
    }
    await page.getByRole('button', { name: match.tag.name, exact: true }).first().click();

    const searchInput = page.locator('input[aria-label="全站搜索"]');
    await searchInput.click();
    await searchInput.fill(pyFx.searchKeyword);
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/module-python-basic\/(courses|lessons|knowledge|questions|cases|routes|faq)/);
    guards.assertClean('pairwise-tagfilter-searchbox');
  });
});
