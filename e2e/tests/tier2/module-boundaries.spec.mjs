import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { attachRuntimeGuards, clickOptionByKey, waitForAppReady } from '../../lib/helpers.mjs';

test.describe('Tier 2 — Module Boundary & Corner Cases (F4, F5, F6, F7)', () => {
  let server;
  let pyFx;
  let dlFx;
  let algFx;

  test.beforeAll(async () => {
    pyFx = discoverModuleFixtures('module-python-basic');
    dlFx = discoverModuleFixtures('module-digital-logic');
    algFx = discoverModuleFixtures('module-algorithm-interview');
    server = await startPreviewServer({
      requirePortal: true,
      moduleSlugs: [
        'module-template',
        'module-python-basic',
        'module-digital-logic',
        'module-algorithm-interview',
      ],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('F4: Unknown module subroute * falls back cleanly to module HomePage', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/nonexistent-subroute-xyz`);
    await waitForAppReady(page);

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('body')).toContainText(pyFx.meta.title);
    guards.assertClean('module-unknown-subroute');
  });

  test('F4: Unknown /lessons/nonexistent renders friendly fallback without crash', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/nonexistent-lesson-xyz`);
    await waitForAppReady(page);

    await expect(page.locator('body')).toContainText(/未找到|返回/);
    guards.assertClean('module-unknown-lesson');
  });

  test('F4: Unknown /courses/nonexistent renders friendly fallback without crash', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/courses/nonexistent-course-xyz`);
    await waitForAppReady(page);

    await expect(page.locator('body')).toContainText(/未找到|返回/);
    guards.assertClean('module-unknown-course');
  });

  test('F5: TagFilter >12 tags expands, filters tags by search, handles non-matching tag query, and resets', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    expect(pyFx.tags.length).toBeGreaterThan(12);

    await page.goto(`${server.baseUrl}/module-python-basic/knowledge`);
    await waitForAppReady(page);

    const match = pyFx.matchingTagFor('knowledge');
    expect(match).toBeTruthy();

    const cards = page.locator('main a[href*="/knowledge/"]');
    await expect(cards).toHaveCount(match.totalCount);

    const expandBtn = page.getByRole('button', { name: /展开全部/ });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    const tagSearch = page.getByPlaceholder(/快速搜索标签/);
    await expect(tagSearch).toBeVisible();

    await tagSearch.fill('__no_such_tag_999__');
    await expect(page.getByRole('button', { name: '全部标签' })).toBeVisible();

    await tagSearch.fill(match.tag.name);
    const matchingPill = page.getByRole('button', { name: match.tag.name, exact: true }).first();
    await expect(matchingPill).toBeVisible();
    await matchingPill.click();
    await expect(cards).toHaveCount(match.expectedCount);

    await page.getByRole('button', { name: '全部标签' }).click();
    await expect(cards).toHaveCount(match.totalCount);
    guards.assertClean('module-tagfilter-boundary');
  });

  test('F5: SearchPage ?q=<keyword> pre-fills input and renders matches immediately', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const kw = pyFx.searchKeyword;
    await page.goto(`${server.baseUrl}/module-python-basic/search?q=${encodeURIComponent(kw)}`);
    await waitForAppReady(page);

    const input = page.getByPlaceholder(/输入关键词/);
    await expect(input).toHaveValue(kw);
    await expect(page.locator('main a[href*="/module-python-basic/"]').first()).toBeVisible();
    guards.assertClean('module-searchpage-prefill');
  });

  test('F5: SearchPage gibberish query renders empty state cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/search?q=__nonexistent_xyz_999__`);
    await waitForAppReady(page);

    await expect(page.locator('body')).toContainText(/未找到与/);
    guards.assertClean('module-searchpage-empty');
  });

  test('F5: SearchPage handles special characters safely without XSS', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    let dialogFired = false;
    page.on('dialog', async (d) => {
      dialogFired = true;
      await d.dismiss();
    });
    await page.goto(
      `${server.baseUrl}/module-python-basic/search?q=${encodeURIComponent('<img src=x onerror=alert(1)>')}`
    );
    await waitForAppReady(page);
    expect(dialogFired).toBe(false);
    guards.assertClean('module-searchpage-xss');
  });

  test('F4: LessonTOC excludes fenced # comments and extracts #### H4 headings', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const rawLessons = JSON.parse(readFileSync(join(pyFx.dataDir, 'lessons.json'), 'utf8'));
    const targetLesson = rawLessons[0];
    rawLessons[0] = {
      ...targetLesson,
      contentMarkdown: [
        '## 第一节概览',
        '',
        '#### H4 子节标题',
        '',
        '```python',
        '# fake_comment_heading',
        'print("hello")',
        '```',
        '',
        '### 三级小节',
      ].join('\n'),
    };

    await page.route('**/module-python-basic/data/lessons.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(rawLessons),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${targetLesson.slug}`);
    await waitForAppReady(page);

    const tocAside = page.locator('aside').filter({ hasText: /目录/ }).first();
    await expect(tocAside).toBeVisible();
    await expect(tocAside).toContainText('H4 子节标题');
    await expect(tocAside).not.toContainText('fake_comment_heading');
    guards.assertClean('module-toc-fenced-h4');
  });

  test('F4: LessonTOC remains sticky while scrolling long lesson at desktop 1440x900', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}`);
    await waitForAppReady(page);

    const tocAside = page.locator('aside').filter({ hasText: /目录/ }).first();
    await expect(tocAside).toBeVisible();

    const stickyCheck = await tocAside.evaluate((el) => {
      const selfPos = getComputedStyle(el).position;
      const parent = el.parentElement;
      const parentPos = parent ? getComputedStyle(parent).position : '';
      const selfRect = el.getBoundingClientRect();
      const parentRect = parent ? parent.getBoundingClientRect() : null;
      return {
        selfPos,
        parentPos,
        selfHeight: Math.round(selfRect.height),
        parentHeight: parentRect ? Math.round(parentRect.height) : 0,
      };
    });
    expect(stickyCheck.selfPos === 'sticky' || stickyCheck.parentPos === 'sticky').toBe(true);
    expect(
      stickyCheck.parentHeight,
      'LessonTOC parent container must span lesson content height so sticky works (no tight wrapper div)'
    ).toBeGreaterThan(stickyCheck.selfHeight);

    await page.evaluate(() => window.scrollBy(0, 700));
    const box = await tocAside.boundingBox();
    expect(box).toBeTruthy();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeLessThan(260);
    guards.assertClean('module-toc-sticky');
  });

  test('F5: CodePlayground on mobile 375x812 maintains readable pane heights without overlap', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${server.baseUrl}/module-digital-logic/lessons/${dlFx.lessonWithCodeSlug}`);
    await waitForAppReady(page);

    const runBtn = page.getByRole('button', { name: /运行代码/ }).first();
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    const iframe = page.locator('iframe[title="Code Sandbox Output"]').first();
    const textarea = page.locator('textarea').first();
    await expect(iframe).toBeVisible();
    await expect(textarea).toBeVisible();

    const tfBox = await textarea.boundingBox();
    const ifBox = await iframe.boundingBox();
    expect(tfBox.height).toBeGreaterThanOrEqual(110);
    expect(ifBox.height).toBeGreaterThanOrEqual(110);
    expect(tfBox.y + tfBox.height).toBeLessThanOrEqual(ifBox.y + 8);
    guards.assertClean('module-playground-mobile');
  });

  test('F5: WeakPointDiagnostics handles empty knowledge_points[] fallback without hiding wrong questions', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const q = dlFx.singleQuestion;
    await page.goto(`${server.baseUrl}/module-digital-logic/questions/${q.slug}`);
    await waitForAppReady(page);

    await clickOptionByKey(page, dlFx.wrongOptionKey);
    await page.getByRole('button', { name: /提交本题/ }).click();
    await expect(page.locator('body')).toContainText(/回答错误/);

    await page.goto(`${server.baseUrl}/module-digital-logic/`);
    await waitForAppReady(page);
    await expect(page.locator('body')).not.toContainText(/暂无错题记录/);
    guards.assertClean('module-weakpoint-fallback');
  });

  test('F5: WeakPointDiagnostics resolves KP title and /knowledge/:slug link when question has knowledge_points', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const swBlockedPage = await context.newPage();
      const guards = attachRuntimeGuards(swBlockedPage, { allowDocument404: true });
      const rawQuestions = JSON.parse(readFileSync(join(dlFx.dataDir, 'questions.json'), 'utf8'));
      const targetKp = dlFx.knowledgePoints[0];
      const targetQIdx = rawQuestions.findIndex((q) => q.type === 'single' && q.options?.length >= 2);
      rawQuestions[targetQIdx] = {
        ...rawQuestions[targetQIdx],
        knowledge_points: [targetKp.id],
      };

      await swBlockedPage.route('**/module-digital-logic/data/questions.json', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(rawQuestions),
        });
      });

      const targetQ = rawQuestions[targetQIdx];
      const wrongOpt = targetQ.options.find((o) => !(targetQ.answer || []).includes(o.key));

      await swBlockedPage.goto(`${server.baseUrl}/module-digital-logic/questions/${targetQ.slug}`);
      await waitForAppReady(swBlockedPage);
      await clickOptionByKey(swBlockedPage, wrongOpt.key);
      await swBlockedPage.getByRole('button', { name: /提交本题/ }).click();

      await swBlockedPage.goto(`${server.baseUrl}/module-digital-logic/`);
      await waitForAppReady(swBlockedPage);
      await expect(swBlockedPage.locator('body')).toContainText(targetKp.title);
      await expect(
        swBlockedPage
          .locator(
            `a[href*="/knowledge/${targetKp.slug}"], a[href*="/knowledge/${encodeURIComponent(targetKp.slug)}"]`
          )
          .first()
      ).toBeVisible();
      guards.assertClean('module-weakpoint-kp-title');
    } finally {
      await context.close();
    }
  });

  test('F6: Module BackupModal rejects invalid/corrupted JSON import without mutating localStorage', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('osg:module-python-basic:favorites', '[]');
    });

    await page.locator('button[aria-label="本地 JSON 备份"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'corrupted-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ invalid json !!!'),
    });

    await expect(dialog).toContainText(/导入失败|无效|格式/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('osg:module-python-basic:favorites'))).toBe('[]');
    guards.assertClean('module-backup-invalid-json');
  });

  test('F6: Module BackupModal valid JSON import restores scoped osg:<slug>: keys without leaking to sibling modules', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    const importedFav = [
      {
        type: 'lesson',
        id: pyFx.lessons[0].id,
        title: pyFx.lessons[0].title,
        slug: pyFx.lessonSlug,
        addedAt: '2026-11-22T00:00:00.000Z',
      },
    ];
    const siblingSentinel = [
      {
        type: 'lesson',
        id: algFx.lessons[0].id,
        title: algFx.lessons[0].title,
        slug: algFx.lessonSlug,
        addedAt: '2026-11-22T00:00:00.000Z',
      },
    ];

    await page.evaluate((sentinel) => {
      localStorage.setItem('osg:module-algorithm-interview:favorites', JSON.stringify(sentinel));
    }, siblingSentinel);

    await page.locator('button[aria-label="本地 JSON 备份"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const reloadPromise = page.waitForEvent('load');
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'valid-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          'osg:module-python-basic:favorites': JSON.stringify(importedFav),
        })
      ),
    });
    await reloadPromise;
    await waitForAppReady(page);

    await page.goto(`${server.baseUrl}/module-python-basic/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).toContainText(pyFx.lessons[0].title);

    await page.goto(`${server.baseUrl}/module-algorithm-interview/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).toContainText(algFx.lessons[0].title);
    await expect(page.locator('body')).not.toContainText(pyFx.lessons[0].title);
    guards.assertClean('module-backup-valid-import-isolation');
  });

  test('F6: Module ExportDataModal triggers Markdown, CSV, and JSON downloads cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    await page.locator('button[aria-label="多格式数据导出"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const checks = [
      { buttonName: /Markdown 学习报告/, extRe: /\.md$/ },
      { buttonName: /CSV 数据分析表/, extRe: /\.csv$/ },
      { buttonName: /JSON 本地备份快照/, extRe: /\.json$/ },
    ];
    for (const item of checks) {
      const downloadPromise = page.waitForEvent('download');
      await dialog.getByRole('button', { name: item.buttonName }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(item.extRe);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    guards.assertClean('module-export-formats');
  });

  test('F6: Legacy osg-mt: keys do not overwrite existing module state or cause sibling key deletion on reset', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-algorithm-interview/`);
    await waitForAppReady(page);

    const siblingSentinel = [
      {
        type: 'lesson',
        id: algFx.lessons[0].id,
        title: algFx.lessons[0].title,
        slug: algFx.lessonSlug,
        addedAt: '2026-11-22T00:00:00.000Z',
      },
    ];
    const legacyNoise = [
      {
        type: 'lesson',
        id: 'legacy-noise-id',
        title: 'LEGACY_SHOULD_NOT_OVERWRITE',
        slug: 'legacy-noise',
        addedAt: '2026-11-22T00:00:00.000Z',
      },
    ];

    await page.evaluate(
      ({ sentinel, legacy }) => {
        localStorage.setItem('osg:module-algorithm-interview:favorites', JSON.stringify(sentinel));
        localStorage.setItem('osg-mt:favorites', JSON.stringify(legacy));
        localStorage.setItem('osg-mt:progress', '{corrupted-legacy-json');
      },
      { sentinel: siblingSentinel, legacy: legacyNoise }
    );

    // Sibling module keeps its own osg:<slug>: state without contamination
    await page.goto(`${server.baseUrl}/module-algorithm-interview/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).toContainText(algFx.lessons[0].title);
    await expect(page.locator('body')).not.toContainText('LEGACY_SHOULD_NOT_OVERWRITE');

    // Scoped reset on module-python-basic preserves sibling module keys
    page.on('dialog', async (d) => d.accept());
    await page.goto(`${server.baseUrl}/module-python-basic/about`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /清空本地数据记录/ }).click();

    const siblingStillPresent = await page.evaluate(() =>
      localStorage.getItem('osg:module-algorithm-interview:favorites')
    );
    expect(siblingStillPresent).toBeTruthy();
    expect(siblingStillPresent).toContain(algFx.lessons[0].title);
    guards.assertClean('module-legacy-osgmt-noncontamination');
  });

  test('F7: Module 404.html SPA restore preserves path, ~and~ multi-query params, and hash', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(
      `${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}?foo=1&bar=2#top`
    );
    await waitForAppReady(page);

    const loc = await page.evaluate(() => ({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    }));
    expect(loc.pathname).toBe(`/module-python-basic/lessons/${pyFx.lessonSlug}`);
    expect(loc.search).toContain('foo=1');
    expect(loc.search).toContain('bar=2');
    expect(loc.hash).toBe('#top');
    await expect(page.locator('h1')).toContainText(pyFx.lessons[0].title);
    guards.assertClean('module-404-restore');
  });

  test('F7: Module ?page= deep-link restores search query route cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    const targetPage = `/search?q=${pyFx.searchKeyword}`;
    await page.goto(
      `${server.baseUrl}/module-python-basic/?page=${encodeURIComponent(targetPage)}`
    );
    await waitForAppReady(page);

    await expect(page).toHaveURL(/\/module-python-basic\/search/);
    await expect(page.getByPlaceholder(/输入关键词/)).toHaveValue(pyFx.searchKeyword);
    guards.assertClean('module-page-param-search');
  });

  test('F7: Module Service Worker on nested /<slug>/courses resolves /<slug>/sw.js', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/courses`);
    await waitForAppReady(page);

    const swScript = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL || reg.installing?.scriptURL || null;
    });
    expect(swScript).toBeTruthy();
    expect(swScript).toMatch(new RegExp(`^${server.baseUrl}/module-python-basic/sw\\.js$`));
    guards.assertClean('module-nested-sw');
  });
});
