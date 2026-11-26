import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures, discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { measureContrastInPage, measureCssVarContrast } from '../../lib/contrast.mjs';
import {
  assertHeaderHealthy,
  assertNoHorizontalOverflow,
  attachRuntimeGuards,
  waitForAppReady,
} from '../../lib/helpers.mjs';

async function setTheme(page, mode) {
  const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
  if ((mode === 'dark') !== isDark) {
    const btn = page
      .locator('button[aria-label="切换主题"], button[aria-label="切换主题模式"]')
      .first();
    await btn.click();
    await expect
      .poll(() => page.locator('html').evaluate((el) => el.classList.contains('dark')))
      .toBe(mode === 'dark');
  }
}

test.describe('Tier 2 — Portal Responsive Layout & Light/Dark Contrast (F8)', () => {
  let server;
  let portal;

  test.beforeAll(async () => {
    portal = discoverPortalFixtures();
    server = await startPreviewServer({ requirePortal: true });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('F8: Portal Desktop (1440x900) Light & Dark zero overflow and healthy header', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    for (const mode of ['light', 'dark']) {
      await setTheme(page, mode);
      for (const route of ['/', '/modules', `/modules/${portal.sampleModuleSlug}`, '/paths']) {
        await page.goto(`${server.baseUrl}${route}`);
        await waitForAppReady(page);
        await assertNoHorizontalOverflow(page, `portal-${mode}-${route}`);
        await assertHeaderHealthy(page, `portal-${mode}-${route}`);
      }
    }
    guards.assertClean('portal-desktop-responsive');
  });

  test('F8: Portal Mobile (375x812) Light & Dark zero overflow, healthy header, and drawer works', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    for (const mode of ['light', 'dark']) {
      await setTheme(page, mode);
      for (const route of ['/', '/modules', `/modules/${portal.sampleModuleSlug}`]) {
        await page.goto(`${server.baseUrl}${route}`);
        await waitForAppReady(page);
        await assertNoHorizontalOverflow(page, `portal-mobile-${mode}-${route}`);
        await assertHeaderHealthy(page, `portal-mobile-${mode}-${route}`);
      }
    }

    const menuBtn = page.getByRole('button', { name: /导航菜单/ });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    const mobileNav = page.getByRole('navigation', { name: '移动端导航' });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole('link', { name: '技能模块' })).toBeVisible();

    const mobileCloudBtn = mobileNav.getByRole('button', { name: /Appwrite 云端同步/ });
    await expect(mobileCloudBtn).toBeVisible();
    await mobileCloudBtn.click();

    const appwriteDialog = page.getByRole('dialog', { name: 'Appwrite 云端集成' });
    await expect(appwriteDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(appwriteDialog).toBeHidden();
    guards.assertClean('portal-mobile-responsive');
  });

  test('F8: Portal Narrow Mobile (320x568) zero horizontal overflow and unclipped header', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    await assertNoHorizontalOverflow(page, 'portal-320');
    await assertHeaderHealthy(page, 'portal-320');
    for (const mode of ['light', 'dark']) {
      await setTheme(page, mode);
      await page.goto(`${server.baseUrl}/paths?tab=capabilities`);
      await expect(page.getByRole('heading', { name: '编程能力', exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(page, `portal-320-capabilities-${mode}`);
    }
    guards.assertClean('portal-narrow-mobile');
  });

  test('F8: Portal Light mode WCAG AA contrast >= 4.5:1 for primary, muted, subtle, and CTA elements', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);
    await setTheme(page, 'light');

    const tokenContrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        text: style.getPropertyValue('--text').trim(),
        muted: style.getPropertyValue('--text-muted').trim(),
        subtle: style.getPropertyValue('--text-subtle').trim(),
        surface: style.getPropertyValue('--surface').trim(),
      };
    });
    expect(tokenContrast.text).toBeTruthy();

    const results = await measureContrastInPage(page, ['h1', 'p', '.btn-primary']);
    for (const r of results) {
      expect(r.found, `Portal light contrast target missing: ${r.selector}`).toBe(true);
      expect(r.ratio, `Portal light contrast for ${r.selector}`).toBeGreaterThanOrEqual(4.5);
    }

    const subtle = await measureCssVarContrast(page, '--text-subtle', '--surface');
    expect(subtle.found, 'Portal light --text-subtle or --surface missing').toBe(true);
    expect(subtle.ratio, 'Portal light --text-subtle on --surface WCAG AA').toBeGreaterThanOrEqual(4.5);
    guards.assertClean('portal-light-contrast');
  });

  test('F8: Portal Dark mode WCAG AA contrast >= 4.5:1 for primary, subtle, and CTA elements', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);
    await setTheme(page, 'dark');

    const results = await measureContrastInPage(page, ['h1', 'p', '.btn-primary']);
    for (const r of results) {
      expect(r.found, `Portal dark contrast target missing: ${r.selector}`).toBe(true);
      expect(r.ratio, `Portal dark contrast for ${r.selector}`).toBeGreaterThanOrEqual(4.5);
    }

    const subtle = await measureCssVarContrast(page, '--text-subtle', '--surface');
    expect(subtle.found, 'Portal dark --text-subtle or --surface missing').toBe(true);
    expect(subtle.ratio, 'Portal dark --text-subtle on --surface WCAG AA').toBeGreaterThanOrEqual(4.5);
    guards.assertClean('portal-dark-contrast');
  });
});

test.describe('Tier 2 — Module Responsive Layout & Light/Dark Contrast (F8)', () => {
  let server;
  let pyFx;
  let algFx;

  test.beforeAll(async () => {
    pyFx = discoverModuleFixtures('module-python-basic');
    algFx = discoverModuleFixtures('module-algorithm-interview');
    server = await startPreviewServer({
      requirePortal: true,
      moduleSlugs: ['module-template', 'module-python-basic', 'module-algorithm-interview'],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('F8: Modules Desktop (1440x900) Light & Dark zero overflow and healthy header', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    const targets = [
      { slug: 'module-template', lesson: discoverModuleFixtures('module-template').lessonSlug },
      { slug: 'module-python-basic', lesson: pyFx.lessonSlug },
      { slug: 'module-algorithm-interview', lesson: algFx.lessonSlug },
    ];

    for (const t of targets) {
      await page.goto(`${server.baseUrl}/${t.slug}/`);
      await waitForAppReady(page);
      for (const mode of ['light', 'dark']) {
        await setTheme(page, mode);
        await assertNoHorizontalOverflow(page, `${t.slug}-${mode}-home`);
        await assertHeaderHealthy(page, `${t.slug}-${mode}-home`);
        await page.goto(`${server.baseUrl}/${t.slug}/lessons/${t.lesson}`);
        await waitForAppReady(page);
        await assertNoHorizontalOverflow(page, `${t.slug}-${mode}-lesson`);
      }
    }
    guards.assertClean('module-desktop-responsive');
  });

  test('F8: Modules Mobile (375x812) Light & Dark zero overflow, visible brand, and working drawer', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    for (const mode of ['light', 'dark']) {
      await setTheme(page, mode);
      for (const route of ['', 'courses', `lessons/${pyFx.lessonSlug}`, `questions/${pyFx.singleQuestion.slug}`, 'exams', 'about']) {
        await page.goto(`${server.baseUrl}/module-python-basic/${route}`);
        await waitForAppReady(page);
        await assertNoHorizontalOverflow(page, `py-mobile-${mode}-${route}`);
        await assertHeaderHealthy(page, `py-mobile-${mode}-${route}`);
      }
    }

    const menuBtn = page.getByRole('button', { name: /打开移动导航菜单|导航菜单/ });
    await menuBtn.click();
    const coursesNav = page
      .getByRole('navigation', { name: '移动端导航' })
      .getByRole('link', { name: /课程列表/ });
    await expect(coursesNav).toBeVisible();
    await coursesNav.click();
    await expect(page).toHaveURL(/\/module-python-basic\/courses/);
    guards.assertClean('module-mobile-responsive');
  });

  test('F8: Module Narrow Mobile (320x568) zero horizontal overflow and unclipped header', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);

    await assertNoHorizontalOverflow(page, 'module-320');
    await assertHeaderHealthy(page, 'module-320');
    guards.assertClean('module-narrow-mobile');
  });

  test('F8: Long inline configuration paths wrap on a 320px lesson page', async ({ page }) => {
    const configPath = 'META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports';
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route('**/data/lessons.json', async (route) => {
      const response = await route.fetch();
      const lessons = await response.json();
      const lesson = lessons.find((item) => item.slug === pyFx.lessonSlug);
      lesson.contentMarkdown += '\n\n配置文件位于 `' + configPath + '`。';
      await route.fulfill({ response, json: lessons });
    });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonSlug}`);
    await expect(page.locator('main').getByText(configPath, { exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page, 'lesson-with-long-path');
  });

  test('F8: Module Light mode WCAG AA contrast >= 4.5:1 including --text-subtle and CodeBlockWithCopy', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonWithCodeSlug}`);
    await waitForAppReady(page);
    await setTheme(page, 'light');

    const results = await measureContrastInPage(page, [
      'h1',
      'main p',
      'pre code',
      'div:has(> pre) > div > span',
      'div:has(> pre) > div > button',
    ]);
    for (const r of results) {
      expect(r.found, `Module light contrast target missing: ${r.selector}`).toBe(true);
      expect(r.ratio, `Module light contrast for ${r.selector}`).toBeGreaterThanOrEqual(4.5);
    }

    const subtle = await measureCssVarContrast(page, '--text-subtle', '--surface');
    expect(subtle.found, 'Module light --text-subtle or --surface missing').toBe(true);
    expect(subtle.ratio, 'Module light --text-subtle on --surface WCAG AA').toBeGreaterThanOrEqual(4.5);
    guards.assertClean('module-light-contrast');
  });

  test('F8: Module Dark mode WCAG AA contrast >= 4.5:1 including --text-subtle and CodeBlockWithCopy', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${pyFx.lessonWithCodeSlug}`);
    await waitForAppReady(page);
    await setTheme(page, 'dark');

    const results = await measureContrastInPage(page, [
      'h1',
      'main p',
      'pre code',
      'div:has(> pre) > div > span',
      'div:has(> pre) > div > button',
    ]);
    for (const r of results) {
      expect(r.found, `Module dark contrast target missing: ${r.selector}`).toBe(true);
      expect(r.ratio, `Module dark contrast for ${r.selector}`).toBeGreaterThanOrEqual(4.5);
    }

    const subtle = await measureCssVarContrast(page, '--text-subtle', '--surface');
    expect(subtle.found, 'Module dark --text-subtle or --surface missing').toBe(true);
    expect(subtle.ratio, 'Module dark --text-subtle on --surface WCAG AA').toBeGreaterThanOrEqual(4.5);
    guards.assertClean('module-dark-contrast');
  });
});
