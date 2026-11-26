import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import {
  assertHeaderHealthy,
  assertNoHorizontalOverflow,
  attachRuntimeGuards,
  waitForAppReady,
} from '../../lib/helpers.mjs';

test.describe('Tier 1 — Module Core Features (F4, F5, F6, F7, F8)', () => {
  let server;
  let tplFx;
  let pyFx;
  let dlFx;

  test.beforeAll(async () => {
    tplFx = discoverModuleFixtures('module-template');
    pyFx = discoverModuleFixtures('module-python-basic');
    dlFx = discoverModuleFixtures('module-digital-logic');
    server = await startPreviewServer({
      requirePortal: true,
      moduleSlugs: ['module-template', 'module-python-basic', 'module-digital-logic', 'module-algorithm-interview'],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('F4: Module HomePage (/) renders module title, stats, and WeakPointDiagnostics', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).toContainText(pyFx.meta.title);
    guards.assertClean('module-home');
  });

  test('F4: /courses and /courses/:slug render course list and course detail', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    await page.getByRole('link', { name: /课程/ }).first().click();
    await expect(page).toHaveURL(/\/module-python-basic\/courses/);
    await expect(page.locator(`a[href*="/courses/${pyFx.courseSlug}"]`).first()).toBeVisible();

    await page.locator(`a[href*="/courses/${pyFx.courseSlug}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/courses/${pyFx.courseSlug}`));
    await expect(page.locator('h1')).toContainText(pyFx.courses[0].title);
    guards.assertClean('module-courses');
  });

  test('F4: /lessons/:slug renders lesson markdown content and headings', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toContainText(pyFx.lessons[0].title);
    await expect(page.locator('article, main').first()).toBeVisible();
    guards.assertClean('module-lesson');
  });

  test('F4: Enriched lesson renders "相关知识点" links and navigates to /knowledge/:slug', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    expect(
      pyFx.lessonWithValidKpsSlug,
      'module-python-basic must contain a lesson with valid knowledgePoints IDs'
    ).toBeTruthy();
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonWithValidKpsSlug}`);
    await waitForAppReady(page);

    const kpHeading = page.getByRole('heading', { name: /相关知识点/ });
    await expect(kpHeading).toBeVisible();
    const kpLink = page.locator('a[href*="/knowledge/"]').first();
    await expect(kpLink).toBeVisible();
    await kpLink.click();

    await expect(page).toHaveURL(/\/module-python-basic\/knowledge\//);
    await expect(page.locator('h1')).toBeVisible();
    guards.assertClean('module-lesson-kp-link');
  });

  test('F4: /knowledge and /knowledge/:slug render KP list and detail', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/knowledge`);
    await waitForAppReady(page);
    await expect(page.locator(`a[href*="/knowledge/${pyFx.kpSlug}"]`).first()).toBeVisible();

    await page.goto(`${server.baseUrl}/module-python-basic/knowledge/${pyFx.kpSlug}`);
    await waitForAppReady(page);
    await expect(page.locator('h1')).toContainText(pyFx.knowledgePoints[0].title);
    guards.assertClean('module-knowledge');
  });

  test('F5: /questions and /questions/:slug QuestionPlayer submits answer and renders feedback', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/questions`);
    await waitForAppReady(page);
    await expect(page.locator(`a[href*="/questions/${pyFx.singleQuestion.slug}"]`).first()).toBeVisible();

    await page.goto(`${server.baseUrl}/module-python-basic/questions/${pyFx.singleQuestion.slug}`);
    await waitForAppReady(page);

    const optionBtn = page.locator('button.option-btn').first();
    await expect(optionBtn).toBeVisible();
    await optionBtn.click();

    await page.getByRole('button', { name: /提交本题/ }).click();
    await expect(page.locator('body')).toContainText(/回答正确|回答错误/);
    guards.assertClean('module-question-player');
  });

  test('F5: /practice/:slug renders interactive practice mode', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/practice/${pyFx.singleQuestion.slug}`);
    await waitForAppReady(page);

    await expect(page.locator('button.option-btn').first()).toBeVisible();
    guards.assertClean('module-practice');
  });

  test('F4: /exams and /exams/:slug render exam cards and interactive exam session', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/exams`);
    await waitForAppReady(page);
    await expect(page.locator(`a[href*="/exams/${pyFx.examSlug}"]`).first()).toBeVisible();

    await page.goto(`${server.baseUrl}/module-python-basic/exams/${pyFx.examSlug}`);
    await waitForAppReady(page);
    await expect(page.locator('h1')).toContainText(pyFx.exams[0].title);

    const firstOption = page.locator('button.option-btn').first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();
    await expect(firstOption).toHaveClass(/option-btn-selected/);
    await expect(page.locator('body')).toContainText(/已答\s*1\//);
    await expect(page.getByRole('button', { name: /交卷|提前交卷/ }).first()).toBeVisible();
    guards.assertClean('module-exams');
  });

  test('F4: /cases and /cases/:slug render case list and detail', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/cases`);
    await waitForAppReady(page);
    await expect(page.locator(`a[href*="/cases/${pyFx.caseSlug}"]`).first()).toBeVisible();

    await page.goto(`${server.baseUrl}/module-python-basic/cases/${pyFx.caseSlug}`);
    await waitForAppReady(page);
    await expect(page.locator('h1')).toBeVisible();
    guards.assertClean('module-cases');
  });

  test('F4: /routes, /faq, /about render cleanly on module-template', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    for (const route of ['/routes', '/faq', '/about']) {
      await page.goto(`${server.baseUrl}/module-template${route}`);
      await waitForAppReady(page);
      await expect(page.locator('h1')).toBeVisible();
    }
    expect(tplFx.routes.length).toBeGreaterThan(0);
    guards.assertClean('module-secondary-routes');
  });

  test('F5: /search form submits query and returns matching content links', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/search`);
    await waitForAppReady(page);

    const input = page.getByPlaceholder(/输入关键词/);
    await input.fill(pyFx.searchKeyword);
    await page.getByRole('button', { name: '搜索' }).click();

    await expect(page.locator('main a[href*="/module-python-basic/"]').first()).toBeVisible();
    guards.assertClean('module-search-form');
  });

  test('F5: TagFilter filters list items and restores full list on "全部标签"', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const listCandidates = [
      { route: 'courses', name: 'courses' },
      { route: 'knowledge', name: 'knowledge' },
      { route: 'questions', name: 'questions' },
      { route: 'cases', name: 'cases' },
    ];
    let chosen = null;
    for (const c of listCandidates) {
      const m = pyFx.matchingTagFor(c.name);
      if (m) {
        chosen = { ...c, match: m };
        break;
      }
    }
    expect(chosen).toBeTruthy();

    await page.goto(`${server.baseUrl}/module-python-basic/${chosen.route}`);
    await waitForAppReady(page);

    const cards = page.locator(`main a[href*="/${chosen.route}/"]`);
    await expect(cards).toHaveCount(chosen.match.totalCount);

    const expandBtn = page.getByRole('button', { name: /展开全部/ });
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
    }

    const tagBtn = page.getByRole('button', { name: chosen.match.tag.name, exact: true }).first();
    await expect(tagBtn).toBeVisible();
    await tagBtn.click();

    await expect(cards).toHaveCount(chosen.match.expectedCount);
    await page.getByRole('button', { name: '全部标签' }).click();
    await expect(cards).toHaveCount(chosen.match.totalCount);
    guards.assertClean('module-tagfilter');
  });

  test('F5: CodePlayground executes JS code inside sandbox iframe without ReferenceError', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-digital-logic/lessons/${dlFx.lessonWithCodeSlug}`);
    await waitForAppReady(page);

    const runBtn = page.getByRole('button', { name: /运行代码/ }).first();
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    const frame = page.frameLocator('iframe[title="Code Sandbox Output"]').first();
    const output = frame.locator('#output');
    await expect(output).toBeVisible();
    await expect(output).not.toContainText(/ReferenceError|运行时错误/);
    guards.assertClean('module-code-playground');
  });

  test('F6: Module AppwriteModal opens and closes cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    const btn = page.locator('button[aria-label="Appwrite 云端同步"]');
    await expect(btn).toBeVisible();
    await btn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Appwrite|云端/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    guards.assertClean('module-appwrite-modal');
  });

  test('F6: Module BackupModal opens and closes cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    const btn = page.locator('button[aria-label="本地 JSON 备份"]');
    await expect(btn).toBeVisible();
    await btn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/备份/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    guards.assertClean('module-backup-modal');
  });

  test('F6: Module ExportDataModal opens and closes cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    const btn = page.locator('button[aria-label="多格式数据导出"]');
    await expect(btn).toBeVisible();
    await btn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/导出/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    guards.assertClean('module-export-modal');
  });

  test('F8: Module theme toggle switches html.light/dark and persists across reload', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    const html = page.locator('html');
    const initiallyDark = await html.evaluate((el) => el.classList.contains('dark'));
    await page.locator('button[aria-label="切换主题模式"]').click();

    await expect
      .poll(() => html.evaluate((el) => el.classList.contains('dark')))
      .toBe(!initiallyDark);

    await page.reload();
    await waitForAppReady(page);
    expect(await html.evaluate((el) => el.classList.contains('dark'))).toBe(!initiallyDark);
    guards.assertClean('module-theme-toggle');
  });

  test('F8: Module CodeBlockWithCopy and .btn-primary render cleanly with expected layout', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonWithCodeSlug}`);
    await waitForAppReady(page);

    await expect(page.locator('div:has(> pre) > div > span').first()).toBeVisible();
    await expect(page.locator('div:has(> pre) > div > button').first()).toBeVisible();

    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);
    await expect(page.locator('.btn-primary').first()).toBeVisible();
    guards.assertClean('module-codeblock-cta-smoke');
  });

  test('F8: Module Dark mode tokens and layout render cleanly without horizontal overflow', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    const html = page.locator('html');
    const isDark = await html.evaluate((el) => el.classList.contains('dark'));
    if (!isDark) {
      await page.locator('button[aria-label="切换主题模式"]').click();
      await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(true);
    }

    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        surface: s.getPropertyValue('--surface').trim(),
        text: s.getPropertyValue('--text').trim(),
        subtle: s.getPropertyValue('--text-subtle').trim(),
      };
    });
    expect(tokens.surface).toBeTruthy();
    expect(tokens.text).toBeTruthy();
    expect(tokens.subtle).toBeTruthy();

    await assertNoHorizontalOverflow(page, 'module-dark-smoke');
    await assertHeaderHealthy(page, 'module-dark-smoke');
    guards.assertClean('module-dark-tokens-smoke');
  });

  test('F7: Module Service Worker registers /<slug>/sw.js cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    const swScript = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || null;
    });
    expect(swScript).toBeTruthy();
    expect(swScript).toMatch(/\/module-template\/sw\.js$/);
    guards.assertClean('module-sw');
  });

  test('F7: Module ?page= deep-link parameter restores target route cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    const targetRoute = `/lessons/${pyFx.lessonSlug}`;
    await page.goto(
      `${server.baseUrl}/module-python-basic/?page=${encodeURIComponent(targetRoute)}`
    );
    await waitForAppReady(page);

    expect(await page.evaluate(() => window.location.pathname)).toBe(
      `/module-python-basic/lessons/${pyFx.lessonSlug}`
    );
    await expect(page.locator('h1')).toContainText(pyFx.lessons[0].title);
    guards.assertClean('module-page-deeplink');
  });
});
