import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures, discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { PORTAL_DIR } from '../../lib/workspace.mjs';
import {
  assertHeaderHealthy,
  assertNoHorizontalOverflow,
  attachRuntimeGuards,
  clickOptionByKey,
  escapeRegExp,
  waitForAppReady,
} from '../../lib/helpers.mjs';

test.describe('Tier 5 — Adversarial Regression & Production Hardening', () => {
  let server;
  let portalFx;
  let tplFx;
  let pyFx;
  let dlFx;

  test.beforeAll(async () => {
    portalFx = discoverPortalFixtures();
    tplFx = discoverModuleFixtures('module-template');
    pyFx = discoverModuleFixtures('module-python-basic');
    dlFx = discoverModuleFixtures('module-digital-logic');
    server = await startPreviewServer({
      requirePortal: true,
      includeTemplate: true,
      moduleSlugs: ['module-python-basic', 'module-digital-logic'],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('T5.1: QuizSpeedRunModal renders synthesized T/F options on real judge (options: []), scores, streaks, restarts, and fits 1440x900 & 375x812', async ({ browser }) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      const guards = attachRuntimeGuards(page, { allowDocument404: true });
      const realQuestions = JSON.parse(readFileSync(join(pyFx.dataDir, 'questions.json'), 'utf8'));
      const judgeQ = realQuestions.find(
        (q) => q.type === 'judge' && Array.isArray(q.options) && q.options.length === 0
      );
      const singleQ = realQuestions.find(
        (q) => q.type === 'single' && Array.isArray(q.options) && q.options.length >= 2
      );
      expect(judgeQ).toBeTruthy();
      expect(singleQ).toBeTruthy();

      const subset = [judgeQ, singleQ];
      await page.route('**/module-python-basic/data/questions.json', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(subset),
        });
      });

      await page.goto(`${server.baseUrl}/module-python-basic/`);
      await waitForAppReady(page);

      await page.getByRole('button', { name: '60s 极速刷题赛' }).click();
      const dialog = page.getByRole('dialog', { name: '60 秒极速刷题挑战赛' });
      await expect(dialog).toBeVisible();

      // Verify desktop viewport containment
      const desktopBox = await dialog.boundingBox();
      expect(desktopBox).toBeTruthy();
      expect(desktopBox.x).toBeGreaterThanOrEqual(0);
      expect(desktopBox.y).toBeGreaterThanOrEqual(0);
      expect(desktopBox.x + desktopBox.width).toBeLessThanOrEqual(1440);
      expect(desktopBox.y + desktopBox.height).toBeLessThanOrEqual(900);

      // Answer both questions (order may be shuffled)
      let sawJudge = false;
      const seenQuestions = new Set();
      for (let step = 0; step < 2; step++) {
        const stemText = (await dialog.locator('h3').textContent()) || '';
        const matchedQ = subset.find((q) => stemText.includes(q.stem.slice(0, 20)));
        expect(matchedQ, `Unmatched stem in speed run: ${stemText}`).toBeTruthy();
        expect(seenQuestions.has(matchedQ.id), `Repeated question in speed run: ${stemText}`).toBe(false);
        seenQuestions.add(matchedQ.id);

        const optionButtons = dialog.locator('.grid button[type="button"]');
        if (matchedQ.type === 'judge') {
          sawJudge = true;
          await expect(optionButtons).toHaveCount(2);
          await expect(optionButtons.nth(0)).toContainText('T');
          await expect(optionButtons.nth(0)).toContainText('正确');
          await expect(optionButtons.nth(1)).toContainText('F');
          await expect(optionButtons.nth(1)).toContainText('错误');
        } else {
          await expect(optionButtons).toHaveCount(matchedQ.options.length);
        }

        const correctKey = matchedQ.answer[0];
        await optionButtons
          .filter({ has: page.locator('span', { hasText: new RegExp(`^\\s*${escapeRegExp(correctKey)}\\s*$`) }) })
          .first()
          .click();

        if (step === 0) {
          await expect(dialog).toContainText('得分: 10 pts');
          await expect(dialog).toContainText('当前连胜: 1');
          await expect(dialog).toContainText('最大连击: 1');
          await expect(dialog).toContainText('第 2 / 2 题');
        }
      }

      expect(sawJudge).toBe(true);
      await expect(dialog.getByText('挑战结算完成！')).toBeVisible();
      await expect(dialog).toContainText('20');
      await expect(dialog).toContainText('最高连击');

      // Restart resets state
      await dialog.getByRole('button', { name: '重新挑战' }).click();
      await expect(dialog).toContainText('第 1 / 2 题');
      await expect(dialog).toContainText('得分: 0 pts');
      await expect(dialog).toContainText('当前连胜: 0');
      await expect(dialog).toContainText('最大连击: 0');

      // Mobile 375x812 viewport bounds & scrollability
      await page.setViewportSize({ width: 375, height: 812 });
      const mobileMetrics = await dialog.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          overflowY: style.overflowY,
        };
      });
      expect(mobileMetrics.left).toBe(0);
      expect(mobileMetrics.top).toBe(0);
      expect(mobileMetrics.width).toBe(375);
      expect(mobileMetrics.height).toBe(812);
      expect(mobileMetrics.overflowY).toBe('auto');

      const closeBtn = dialog.getByRole('button', { name: '关闭弹窗' });
      await closeBtn.scrollIntoViewIfNeeded();
      await closeBtn.click();
      await expect(dialog).toBeHidden();
      guards.assertClean('t5-quiz-speed-run');
    } finally {
      await context.close();
    }
  });

  test('T5.2: CertificateModal & QuizSpeedRunModal escape transform containment (1440x900 & 375x812) and LessonPage reading bar stays fixed top=0', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    for (const vp of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto(`${server.baseUrl}/module-template/`);
      await waitForAppReady(page);
      // Wait past 400ms fadeIn animation to ensure transform stays 'none'
      await expect
        .poll(() =>
          page.evaluate(() => getComputedStyle(document.querySelector('main > div')).transform)
        )
        .toBe('none');

      // Scroll down first to prove fixed overlay is viewport-bound even when scrolled
      await page.evaluate(() => window.scrollTo(0, 400));

      await page.getByRole('button', { name: '查看通关结业证书' }).click();
      const certDialog = page.getByRole('dialog', { name: '个人结业证书' });
      await expect(certDialog).toBeVisible();
      const certOverlay = await certDialog.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
          overflowY: getComputedStyle(el).overflowY,
        };
      });
      expect(certOverlay.left).toBe(0);
      expect(certOverlay.top).toBe(0);
      expect(certOverlay.width).toBeGreaterThanOrEqual(vp.width - 1);
      expect(certOverlay.height).toBeGreaterThanOrEqual(vp.height - 1);
      expect(certOverlay.overflowY).toBe('auto');

      const closeCertBtn = certDialog.getByRole('button', { name: '关闭窗口' });
      await closeCertBtn.scrollIntoViewIfNeeded();
      await expect(closeCertBtn).toBeVisible();
      await closeCertBtn.click();
      await expect(certDialog).toBeHidden();

      await page.getByRole('button', { name: '60s 极速刷题赛' }).click();
      const speedDialog = page.getByRole('dialog', { name: '60 秒极速刷题挑战赛' });
      await expect(speedDialog).toBeVisible();
      const speedOverlay = await speedDialog.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      });
      expect(speedOverlay.left).toBe(0);
      expect(speedOverlay.top).toBe(0);
      expect(speedOverlay.width).toBeGreaterThanOrEqual(vp.width - 1);
      expect(speedOverlay.height).toBeGreaterThanOrEqual(vp.height - 1);
      await speedDialog.getByRole('button', { name: '关闭弹窗' }).click();
      await expect(speedDialog).toBeHidden();
    }

    // LessonPage fixed top progress bar stays pinned to top === 0 while scrolled
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}`);
    await waitForAppReady(page);
    await expect(page.locator('article h1')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 500));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const bar = document.querySelector('article > div.fixed.top-0.left-0');
          if (!bar) return null;
          const r = bar.getBoundingClientRect();
          return {
            top: Math.round(r.top),
            left: Math.round(r.left),
            hasWidth: r.width > 0,
          };
        })
      )
      .toEqual({ top: 0, left: 0, hasWidth: true });
    guards.assertClean('t5-fixed-containment');
  });

  test('T5.3: CodePlayground resets edited code & sandbox across lesson navigation and captures runtime Error', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-digital-logic/lessons/lesson-1-1`);
    await waitForAppReady(page);

    const editor = page.locator('textarea[aria-label="代码编辑器"]').first();
    await expect(editor).toBeVisible();
    const l1InitialCode = await editor.inputValue();
    expect(l1InitialCode.length).toBeGreaterThan(0);

    // Runtime error capture
    await editor.fill('throw new Error("TIER5_BOOM");');
    await page.getByRole('button', { name: /运行代码/ }).first().click();
    const frame = page.frameLocator('iframe[title="Code Sandbox Output"]').first();
    await expect(frame.locator('#output')).toContainText('运行时错误: TIER5_BOOM');

    // Mutate code again and run, then navigate to lesson-1-2
    await editor.fill('console.log("STALE_FROM_L1");');
    await page.getByRole('button', { name: /运行代码/ }).first().click();
    await expect(frame.locator('#output')).toContainText('STALE_FROM_L1');

    const nextLink = page.locator('a[href*="/lessons/lesson-1-2"]').first();
    await expect(nextLink).toBeVisible();
    await nextLink.click();
    await expect(page).toHaveURL(/\/module-digital-logic\/lessons\/lesson-1-2/);
    await waitForAppReady(page);

    await expect(page.locator('iframe[title="Code Sandbox Output"]')).toHaveCount(0);
    const l2Editor = page.locator('textarea[aria-label="代码编辑器"]').first();
    await expect(l2Editor).toBeVisible();
    const l2Code = await l2Editor.inputValue();
    expect(l2Code).not.toContain('STALE_FROM_L1');
    expect(l2Code).not.toBe(l1InitialCode);
    guards.assertClean('t5-codeplayground-reset-and-error');
  });

  test('T5.4: LessonPage scrollProgress resets on short lesson and LessonTOC click scrolls heading into non-occluded view', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. LessonTOC click-to-scroll & active highlight & non-occlusion
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}`);
    await waitForAppReady(page);
    const tocButtons = page.locator('aside nav button');
    const tocCount = await tocButtons.count();
    expect(tocCount).toBeGreaterThan(1);
    const targetBtn = tocButtons.nth(Math.min(2, tocCount - 1));
    const targetText = (await targetBtn.textContent() || '').trim();
    await targetBtn.click();

    await expect
      .poll(async () =>
        page.evaluate((txt) => {
          const header = document.querySelector('header');
          const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
          const headings = [...document.querySelectorAll('article h2, article h3, article h4')];
          const match = headings.find((h) => (h.textContent || '').trim().includes(txt));
          if (!match) return null;
          const r = match.getBoundingClientRect();
          return { top: r.top, headerBottom, inView: r.top >= headerBottom - 2 && r.top < window.innerHeight };
        }, targetText)
      )
      .toMatchObject({ inView: true });
    await expect(targetBtn).toHaveClass(/text-brand/);

    // 2. scrollProgress resets when navigating from scrolled long lesson to short lesson (totalHeight <= 0)
    await page.setViewportSize({ width: 1440, height: 1500 });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/lesson-1-1`);
    await waitForAppReady(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const bar = document.querySelector('article > div.fixed.top-0.left-0');
          return bar ? parseFloat(bar.style.width || '0') : 0;
        })
      )
      .toBeGreaterThan(90);

    // Navigate via Next link to lesson-1-2
    const nextLesson = page.locator('a[href*="/lessons/lesson-1-2"]').first();
    await expect(nextLesson).toBeVisible();
    await nextLesson.click();
    await expect(page).toHaveURL(/\/module-python-basic\/lessons\/lesson-1-2/);
    await waitForAppReady(page);

    // Ensure viewport tall enough that short lesson has totalHeight <= 0
    const dims = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ih: window.innerHeight,
    }));
    if (dims.sh > dims.ih) {
      await page.setViewportSize({ width: 1440, height: dims.sh + 100 });
    }

    await expect
      .poll(() =>
        page.evaluate(() => {
          const bar = document.querySelector('article > div.fixed.top-0.left-0');
          return bar ? parseFloat(bar.style.width || '0') : -1;
        })
      )
      .toBe(0);
    guards.assertClean('t5-lesson-scroll-and-toc');
  });

  test('T5.5: ExamResultPage survives page.reload() from localStorage (osg:<slug>:exams) and ExamPlayer supports Ctrl+ArrowRight/Left', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/exams/${pyFx.examSlug}`);
    await waitForAppReady(page);

    // Keyboard Ctrl+ArrowRight / Ctrl+ArrowLeft navigation in ExamPlayer
    await expect(page.locator('body')).toContainText('第 1 /');
    await page.keyboard.press('Control+ArrowRight');
    await expect(page.locator('body')).toContainText('第 2 /');
    await page.keyboard.press('Control+ArrowLeft');
    await expect(page.locator('body')).toContainText('第 1 /');

    await page.locator('button.option-btn').first().click();
    await page.getByRole('button', { name: /交卷|提前交卷/ }).first().click();

    await expect(page).toHaveURL(new RegExp(`/module-python-basic/exams/${escapeRegExp(pyFx.examSlug)}/result`));
    await expect(page.getByText('逐题评分与答题回顾')).toBeVisible();
    const scoreBefore = await page.locator('header p.text-4xl').textContent();

    const storedLen = await page.evaluate(() => {
      const raw = localStorage.getItem('osg:module-python-basic:exams');
      return raw ? JSON.parse(raw).length : 0;
    });
    expect(storedLen).toBeGreaterThanOrEqual(1);

    await page.reload();
    await waitForAppReady(page);
    await expect(page.getByText('未找到本次测验成绩数据')).toHaveCount(0);
    await expect(page.getByText('逐题评分与答题回顾')).toBeVisible();
    await expect(page.locator('header p.text-4xl')).toHaveText(scoreBefore.trim());
    guards.assertClean('t5-exam-result-reload');
  });

  test('T5.6: WeakPointDiagnostics shows human-readable course title (no raw mod-*-c-1) and WrongQuestionsPage supports SM-2 3x mastery, 移除, and 清空全部错题', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const q1 = pyFx.questions.find((q) => q.type === 'single' && q.options?.length >= 2);
    const q2 = pyFx.questions.find((q) => q.id !== q1.id && q.type === 'single' && q.options?.length >= 2);
    expect(q1 && q2).toBeTruthy();
    const q1Wrong = q1.options.find((o) => !q1.answer.includes(o.key)).key;
    const q2Wrong = q2.options.find((o) => !q2.answer.includes(o.key)).key;

    // Answer q1 wrongly
    await page.goto(`${server.baseUrl}/module-python-basic/questions/${q1.slug}`);
    await waitForAppReady(page);
    await clickOptionByKey(page, q1Wrong);
    await page.getByRole('button', { name: /提交本题/ }).click();

    // Check WeakPointDiagnostics on HomePage resolves human-readable course title instead of mod-python-basic-c-1
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);
    const diagHeading = page.getByText('智能薄弱知识点诊断与攻坚');
    await expect(diagHeading).toBeVisible();
    const diagCard = diagHeading.locator('xpath=ancestor::div[contains(@class,"card")][1]');
    const diagText = await diagCard.textContent();
    expect(diagText).not.toMatch(/mod-python-basic-c-\d+/);
    const expectedCourse = pyFx.courses.find((c) => c.id === q1.chapter);
    if (expectedCourse) {
      expect(diagText).toContain(expectedCourse.title);
    }

    // SM-2 3x consecutive correct mastery removes q1 from WrongQuestionsPage
    await page.goto(`${server.baseUrl}/module-python-basic/wrong`);
    await waitForAppReady(page);
    await expect(page.locator('main header')).toContainText('共 1 道错题');

    for (let rep = 0; rep < 3; rep++) {
      await page.goto(`${server.baseUrl}/module-python-basic/practice/${q1.slug}`);
      await waitForAppReady(page);
      await clickOptionByKey(page, q1.answer[0]);
      await page.getByRole('button', { name: /提交本题/ }).click();
      await expect(page.locator('body')).toContainText('✓ 回答正确');
    }

    await page.goto(`${server.baseUrl}/module-python-basic/wrong`);
    await waitForAppReady(page);
    await expect(page.getByText('暂无错题记录')).toBeVisible();

    // Add 2 wrong questions, test "移除" and "清空全部错题"
    for (const [q, wk] of [
      [q1, q1Wrong],
      [q2, q2Wrong],
    ]) {
      await page.goto(`${server.baseUrl}/module-python-basic/questions/${q.slug}`);
      await waitForAppReady(page);
      await clickOptionByKey(page, wk);
      await page.getByRole('button', { name: /提交本题/ }).click();
    }

    await page.goto(`${server.baseUrl}/module-python-basic/wrong`);
    await waitForAppReady(page);
    await expect(page.locator('main header')).toContainText('共 2 道错题');

    await page.getByRole('button', { name: '移除', exact: true }).first().click();
    await expect(page.locator('main header')).toContainText('共 1 道错题');

    await page.getByRole('button', { name: '清空全部错题' }).click();
    await expect(page.getByText('暂无错题记录')).toBeVisible();
    guards.assertClean('t5-weakpoint-and-wrong-questions');
  });

  test('T5.7: QuestionPlayer multiple/judge/short + shortcuts, KnowledgePoint & Case backlinks/favorites, TagFilter across 4 pages, SearchPage submit/clear', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    // 1. QuestionPlayer multiple, judge, short + keyboard shortcuts (1-4, Enter)
    const multiQ = pyFx.questions.find((q) => q.type === 'multiple' && q.options?.length >= 2);
    const judgeQ = pyFx.questions.find((q) => q.type === 'judge');
    const shortQ = pyFx.questions.find((q) => q.type === 'short');
    expect(multiQ && judgeQ && shortQ).toBeTruthy();

    await page.goto(`${server.baseUrl}/module-python-basic/questions/${multiQ.slug}`);
    await waitForAppReady(page);
    await expect(page.locator('button.option-btn').first()).toBeVisible();
    for (const ansKey of multiQ.answer) {
      const idx = multiQ.options.findIndex((o) => o.key === ansKey);
      if (idx >= 0 && idx < 6) {
        await page.keyboard.press(String(idx + 1));
      } else {
        await clickOptionByKey(page, ansKey);
      }
    }
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toContainText('✓ 回答正确');

    await page.goto(`${server.baseUrl}/module-python-basic/questions/${judgeQ.slug}`);
    await waitForAppReady(page);
    await expect(page.locator('button.option-btn').first()).toBeVisible();
    await page.keyboard.press(judgeQ.answer[0] === 'T' ? 'T' : 'F');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toContainText('✓ 回答正确');

    await page.goto(`${server.baseUrl}/module-python-basic/questions/${shortQ.slug}`);
    await waitForAppReady(page);
    await expect(page.locator('textarea[aria-label="答案输入"]')).toBeVisible();
    await page.locator('textarea[aria-label="答案输入"]').fill(shortQ.answer[0] || 'test');
    await page.getByRole('button', { name: /提交本题/ }).click();
    await expect(page.locator('body')).toContainText(/回答正确|回答错误/);

    // 2. KnowledgePointDetailPage & CaseDetailPage backlinks + favorite reactivity
    const kpWithLinks = tplFx.knowledgePoints.find(
      (k) => (k.relatedQuestions?.length || 0) > 0 && (k.relatedCases?.length || 0) > 0
    );
    expect(kpWithLinks).toBeTruthy();
    await page.goto(`${server.baseUrl}/module-template/knowledge/${kpWithLinks.slug}`);
    await waitForAppReady(page);
    await expect(page.getByRole('heading', { name: '相关题目' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '相关案例' })).toBeVisible();
    await page.getByRole('button', { name: /收藏/ }).click();
    await expect(page.getByRole('button', { name: '★ 已收藏' })).toBeVisible();

    const caseWithKps = tplFx.cases.find((c) => (c.knowledgePoints?.length || 0) > 0);
    expect(caseWithKps).toBeTruthy();
    await page.goto(`${server.baseUrl}/module-template/cases/${caseWithKps.slug}`);
    await waitForAppReady(page);
    await expect(page.getByRole('heading', { name: '相关知识点' })).toBeVisible();
    await page.getByRole('button', { name: /收藏/ }).click();
    await expect(page.getByRole('button', { name: '★ 已收藏' })).toBeVisible();

    await page.goto(`${server.baseUrl}/module-template/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('main')).toContainText(kpWithLinks.title);
    await expect(page.locator('main')).toContainText(caseWithKps.title);

    // 3. TagFilter multi-tag + clear across /courses, /knowledge, /questions, /cases
    for (const route of ['courses', 'knowledge', 'questions', 'cases']) {
      await page.goto(`${server.baseUrl}/module-template/${route}`);
      await waitForAppReady(page);
      const expandBtn = page.getByRole('button', { name: /展开全部/ });
      if (await expandBtn.isVisible().catch(() => false)) {
        await expandBtn.click();
      }
      const match = tplFx.matchingTagFor(route);
      expect(match, `No matching tag for module-template/${route}`).toBeTruthy();
      const firstTagBtn = page.getByRole('button', { name: match.tag.name, exact: true }).first();
      await firstTagBtn.click();
      // Select a second tag if available to verify multi-tag filtering
      const otherTag = tplFx.tags.find((t) => t.name !== match.tag.name);
      if (otherTag) {
        const secondBtn = page.getByRole('button', { name: otherTag.name, exact: true }).first();
        if (await secondBtn.isVisible().catch(() => false)) {
          await secondBtn.click();
        }
      }
      await page.getByRole('button', { name: '全部标签', exact: true }).click();
      await expect(page.locator('main a').first()).toBeVisible();
    }

    // 4. SearchPage ?q= submit & clear
    await page.goto(`${server.baseUrl}/module-template/search`);
    await waitForAppReady(page);
    const searchInput = page.getByPlaceholder('输入关键词…');
    await searchInput.fill(tplFx.searchKeyword);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`\\?q=${escapeRegExp(encodeURIComponent(tplFx.searchKeyword))}|\\?q=${escapeRegExp(tplFx.searchKeyword)}`));
    await expect(page.locator('main')).toContainText(/共 \d+ 条结果/);

    await searchInput.fill('');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page).toHaveURL(/\/module-template\/search$/);
    guards.assertClean('t5-question-kp-case-tagfilter-searchpage');
  });

  test('T5.8: AchievementsModal, KeyboardShortcutsModal (Shift+?), PomodoroTimer mobile popover, and Header mobile drawer outside-click close', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    // Desktop modals
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseUrl}/module-template/`);
    await waitForAppReady(page);

    await page.getByRole('button', { name: '成就勋章墙' }).click();
    const achDialog = page.getByRole('dialog', { name: '游戏化成就勋章墙' });
    await expect(achDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(achDialog).toBeHidden();

    // Ensure focus is not in an input before pressing Shift+?
    await page.locator('h1').click();
    await page.keyboard.press('Shift+?');
    const kbDialog = page.getByRole('dialog', { name: '全站键盘快捷键指南' });
    await expect(kbDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(kbDialog).toBeHidden();

    // Mobile 375x812 PomodoroTimer popover & drawer outside-click close
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: '番茄专注计时器' }).click();
    const pomoPanel = page.getByText('专注番茄钟').locator('xpath=ancestor::div[contains(@class,"card")][1]');
    await expect(pomoPanel).toBeVisible();
    const pomoBox = await pomoPanel.boundingBox();
    expect(pomoBox).toBeTruthy();
    expect(pomoBox.x).toBeGreaterThanOrEqual(0);
    expect(pomoBox.x + pomoBox.width).toBeLessThanOrEqual(375);
    await page.getByRole('button', { name: '关闭番茄钟面板' }).click();
    await expect(pomoPanel).toBeHidden();

    await page.getByRole('button', { name: /打开移动导航菜单/ }).click();
    const mobileNav = page.getByRole('navigation', { name: '移动端导航' });
    await expect(mobileNav).toBeVisible();

    // Click outside header (main content below drawer)
    await page.mouse.click(200, 760);
    await expect(mobileNav).toBeHidden();
    await assertNoHorizontalOverflow(page, 't5-mobile-modals');
    await assertHeaderHealthy(page, 't5-mobile-modals');
    guards.assertClean('t5-modals-pomodoro-drawer');
  });

  test('T5.9: Portal Tier-5 gaps — /modules level filter/sort, /paths tabs & ModuleDetailPage deps, /about stats & 404 fallback, BackupModal, SearchBox lazy/mobile/500, updates.json & dist parity', async ({ browser }) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 1440, height: 900 },
    });
    try {
      const page = await context.newPage();
      const guards = attachRuntimeGuards(page, { allowDocument404: true });

      // 1. dist/data vs public/data byte-for-byte parity
      const pubDataDir = join(PORTAL_DIR, 'public', 'data');
      const distDataDir = join(PORTAL_DIR, 'dist', 'data');
      expect(existsSync(distDataDir)).toBe(true);
      for (const file of readdirSync(pubDataDir).filter((f) => f.endsWith('.json'))) {
        const pubBuf = readFileSync(join(pubDataDir, file));
        const distPath = join(distDataDir, file);
        expect(existsSync(distPath), `Missing dist/data/${file}`).toBe(true);
        expect(pubBuf.equals(readFileSync(distPath)), `Parity mismatch in dist/data/${file}`).toBe(true);
      }

      // 2. SearchBox lazy-load check: global-search-index.json NOT requested before focus/input
      const globalIndexRequests = [];
      page.on('request', (req) => {
        if (req.url().includes('global-search-index.json')) {
          globalIndexRequests.push(req.url());
        }
      });

      await page.goto(`${server.baseUrl}/`);
      await waitForAppReady(page);
      expect(globalIndexRequests.length).toBe(0);

      // 3. HomePage updates.json click-through
      const firstInternalUpdate = portalFx.updates
        .map((u) => ({
          ...u,
          resolvedHref: (u.url || '').replace(/^https:\/\/openskill-galaxy\.github\.io/, ''),
        }))
        .find((u) => u.resolvedHref.startsWith('/modules/') || u.resolvedHref.startsWith('/paths'));
      expect(firstInternalUpdate).toBeTruthy();
      const updateLink = page.locator(`main a[href="${firstInternalUpdate.resolvedHref}"]`).first();
      await expect(updateLink).toBeVisible();
      await updateLink.click();
      await expect(page.locator('h1')).toBeVisible();

      // 4. /modules difficulty filter (?level=), reset & monotonic sort order
      await page.goto(`${server.baseUrl}/modules`);
      await waitForAppReady(page);
      await page.getByRole('button', { name: '入门', exact: true }).click();
      await expect(page).toHaveURL(/\/modules\?level=beginner/);
      const beginnerCount = portalFx.modules.filter((m) => m.level === 'beginner').length;
      await expect(page.locator('main')).toContainText(`显示 ${beginnerCount} / ${portalFx.modules.length} 个模块`);

      await page.getByRole('button', { name: '重置筛选' }).click();
      await expect(page).toHaveURL(/\/modules$/);
      await expect(page.locator('main')).toContainText(`显示 ${portalFx.modules.length} / ${portalFx.modules.length} 个模块`);

      // Verify monotonic difficulty order (入门 <= 进阶 <= 高阶)
      const cardLevels = await page.locator('main .catalog-row .catalog-level').evaluateAll((els) =>
        els
          .map((el) => {
            const badge = (el.textContent || '').trim();
            if (badge === '入门') return 0;
            if (badge === '进阶') return 1;
            if (badge === '高阶') return 2;
            return -1;
          })
          .filter((v) => v >= 0)
      );
      expect(cardLevels.length).toBe(portalFx.modules.length);
      for (let i = 1; i < cardLevels.length; i++) {
        expect(cardLevels[i]).toBeGreaterThanOrEqual(cardLevels[i - 1]);
      }

      // 5. /paths tabs (学习路径 stages, 职业方向, 能力图谱) & ModuleDetailPage deps/careers
      await page.goto(`${server.baseUrl}/paths`);
      await waitForAppReady(page);
      await expect(page.locator('main')).toContainText('阶段 1');
      await page.getByRole('tab', { name: /职业方向/ }).click();
      await expect(page).toHaveURL(/\/paths\?tab=careers/);
      await expect(page.locator('main')).toContainText('核心必修');
      await expect(page.locator('main')).toContainText('作品集建议');
      await page.getByRole('tab', { name: /能力图谱/ }).click();
      await expect(page).toHaveURL(/\/paths\?tab=capabilities/);
      await expect(page.locator('main')).toContainText('初级');
      await expect(page.locator('main')).toContainText('实践建议');

      const depWithAll = (portalFx.moduleDependencies || []).find((d) => {
        const hasPrereq = (d.dependsOn || []).length > 0;
        const hasNext = (portalFx.moduleDependencies || []).some((x) => (x.dependsOn || []).includes(d.module));
        const hasCareer = (portalFx.careerPaths || []).some((c) =>
          [...(c.requiredModules || []), ...(c.recommendedModules || []), ...(c.projectModules || []), ...(c.interviewModules || [])].includes(d.module)
        );
        return hasPrereq && hasNext && hasCareer;
      });
      expect(depWithAll).toBeTruthy();
      await page.goto(`${server.baseUrl}/modules/${depWithAll.module}`);
      await waitForAppReady(page);
      await expect(page.getByText('建议前置基础')).toBeVisible();
      await expect(page.getByText('后续进阶方向')).toBeVisible();
      await expect(page.getByText('适配职业方向')).toBeVisible();

      // 6. /about dynamic stats + mobile responsive (/about & /paths)
      await page.goto(`${server.baseUrl}/about`);
      await waitForAppReady(page);
      await expect(page.locator('main')).toContainText('平台资源规模');
      await expect(page.locator('main')).toContainText(String(portalFx.platformStats.totalCourses));
      await expect(page.locator('main')).toContainText(portalFx.platformStats.totalQuestions.toLocaleString());

      await page.setViewportSize({ width: 375, height: 812 });
      await assertNoHorizontalOverflow(page, 't5-portal-about-mobile');
      await page.goto(`${server.baseUrl}/paths`);
      await waitForAppReady(page);
      await assertNoHorizontalOverflow(page, 't5-portal-paths-mobile');

      // 7. SearchBox mobile 375x812 dropdown bounds + HTTP 500 fallback & retry
      let failGlobal = true;
      await page.route('**/data/global-search-index.json', async (route) => {
        if (failGlobal) {
          await route.fulfill({ status: 500, body: 'Server Error' });
        } else {
          await route.continue();
        }
      });

      const searchInput = page.locator('input[aria-label="全站搜索"]');
      await searchInput.click();
      await searchInput.fill('Python');
      const listbox = page.locator('#portal-search-results');
      await expect(listbox).toBeVisible();
      await expect(listbox).toContainText('全站课时索引暂不可用');

      const dropBox = await listbox.boundingBox();
      expect(dropBox).toBeTruthy();
      expect(dropBox.x).toBeGreaterThanOrEqual(0);
      expect(dropBox.x + dropBox.width).toBeLessThanOrEqual(375);

      // Retry after clearing 500 fault
      failGlobal = false;
      await searchInput.blur();
      await searchInput.focus();
      await expect
        .poll(() => globalIndexRequests.length)
        .toBeGreaterThanOrEqual(2);
      await expect(listbox).not.toContainText('全站课时索引暂不可用');
      await searchInput.fill('');
      await page.keyboard.press('Escape');

      // 8. Portal BackupModal export, invalid array/null rejection, and valid import
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => {
        localStorage.setItem('osg:module-python-basic:favorites', '[{"type":"lesson","id":"l1"}]');
        localStorage.setItem('unrelated-other-key', 'ignore-me');
      });
      await page.locator('button[aria-label="备份"]').click();
      const backupDialog = page.getByRole('dialog', { name: '备份与同步' });
      await expect(backupDialog).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        backupDialog.getByRole('button', { name: '导出进度备份 (.json)' }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^openskill_galaxy_backup_.*\.json$/);

      const fileInput = backupDialog.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'bad-array.json',
        mimeType: 'application/json',
        buffer: Buffer.from('["osg:bad"]'),
      });
      await expect(backupDialog).toContainText('无效的备份文件格式');

      await fileInput.setInputFiles({
        name: 'bad-null.json',
        mimeType: 'application/json',
        buffer: Buffer.from('null'),
      });
      await expect(backupDialog).toContainText('无效的备份文件格式');

      await fileInput.setInputFiles({
        name: 'valid-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            'osg:module-rust-basic:progress': '{"l1":{"status":"completed"}}',
            'evil-foreign-key': 'should-ignore',
          })
        ),
      });
      await expect(backupDialog).toContainText('操作成功');
      await expect
        .poll(() =>
          page.evaluate(() => ({
            rust: localStorage.getItem('osg:module-rust-basic:progress'),
            evil: localStorage.getItem('evil-foreign-key'),
          }))
        )
        .toEqual({
          rust: '{"l1":{"status":"completed"}}',
          evil: null,
        });

      // 9. HomePage platform-stats.json 404 fallback renders core stats cleanly without pageerror
      const fallbackPage = await context.newPage();
      const fallbackErrors = [];
      fallbackPage.on('pageerror', (err) => fallbackErrors.push(err.message));
      await fallbackPage.route('**/data/platform-stats.json', (route) =>
        route.fulfill({ status: 404, body: 'Not Found' })
      );
      await fallbackPage.goto(`${server.baseUrl}/`);
      await waitForAppReady(fallbackPage);
      await expect(fallbackPage.locator('main')).toContainText('技能模块');
      await expect(fallbackPage.locator('main')).toContainText('学科分类');
      await expect(fallbackPage.locator('main')).toContainText('学习路线');
      expect(fallbackErrors).toEqual([]);
      await fallbackPage.close();

      // Note: intentional 500 on global-search-index produces expected browser console error,
      // so assert zero pageErrors / failedRequests here.
      expect(guards.pageErrors, 't5-portal: pageerrors').toEqual([]);
      expect(guards.failedRequests, 't5-portal: failedRequests').toEqual([]);
    } finally {
      await context.close();
    }
  });
});
