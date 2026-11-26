import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { attachRuntimeGuards, waitForAppReady } from '../../lib/helpers.mjs';

test.describe('Tier 2 — Portal Boundary & Corner Cases (F2, F3, F6, F7)', () => {
  let server;
  let portal;

  test.beforeAll(async () => {
    portal = discoverPortalFixtures();
    server = await startPreviewServer({ requirePortal: true });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('F2: Unknown portal wildcard route redirects cleanly to /', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/nonexistent-portal-route-xyz`);
    await waitForAppReady(page);

    await expect(page).toHaveURL(`${server.baseUrl}/`);
    await expect(page.locator('h1')).toBeVisible();
    guards.assertClean('portal-unknown-route');
  });

  test('F2: Unknown /modules/:slug renders "未找到模块" and working back link', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/modules/nonexistent-module-xyz`);
    await waitForAppReady(page);

    await expect(page.locator('body')).toContainText(/未找到模块/);
    const backLink = page.getByRole('link', { name: /返回模块列表/ });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL(/\/modules$/);
    guards.assertClean('portal-unknown-module-slug');
  });

  test('F3: Empty and whitespace-only SearchBox input opens no listbox or crashes', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill('   ');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`${server.baseUrl}/`);
    await expect(page.getByRole('listbox')).toBeHidden();
    guards.assertClean('portal-search-whitespace');
  });

  test('F3: Special-character XSS-like input in SearchBox renders escaped empty state cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    let dialogTriggered = false;
    page.on('dialog', async (d) => {
      dialogTriggered = true;
      await d.dismiss();
    });

    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill('<script>alert(1)</script>&foo=bar');
    await expect(page.locator('body')).toContainText(/未找到匹配结果/);
    expect(dialogTriggered).toBe(false);
    guards.assertClean('portal-search-special-chars');
  });

  test('F3: Gibberish SearchBox query renders "未找到匹配结果"', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.fill('zzzznonexistent999xyz');
    await expect(page.locator('body')).toContainText(/未找到匹配结果/);
    guards.assertClean('portal-search-gibberish');
  });

  test('F3: SearchBox keyboard navigation (Ctrl+K, ArrowDown, ArrowUp, Escape, Enter)', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    await page.keyboard.press('Control+k');
    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await expect(searchInput).toBeFocused();

    await searchInput.fill(portal.sampleModule.title.slice(0, 4));
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox.getByText('正在加载全站讲义与题库索引')).toBeHidden();

    await page.keyboard.press('ArrowDown');
    const firstDescendant = await searchInput.getAttribute('aria-activedescendant');
    expect(firstDescendant).toBeTruthy();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    expect(await searchInput.getAttribute('aria-activedescendant')).toBe(firstDescendant);

    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();

    // Re-open and navigate via Enter
    await searchInput.click();
    await searchInput.fill(portal.sampleModule.title);
    await expect(listbox).toBeVisible();
    await expect(listbox.getByText('正在加载全站讲义与题库索引')).toBeHidden();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/modules\/module-/);
    guards.assertClean('portal-search-keyboard');
  });

  test('F3: Portal SearchBox handles async question deep-link (?page=%2Fquestions%2F) and outside-click close', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    let capturedUrl = null;
    await page.route('https://openskill-galaxy.github.io/**', async (route) => {
      capturedUrl = route.request().url();
      await route.abort();
    });

    const qItem = portal.sampleQuestionItem;
    const cleanQTitle = qItem.title.replace(/\.\.\.$/, '').slice(0, 18);
    const searchInput = page.getByRole('combobox', { name: '全站搜索' });
    await searchInput.click();
    await searchInput.fill(cleanQTitle);

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox.getByText('正在加载全站讲义与题库索引')).toBeHidden();
    const qOpt = listbox.getByRole('option', { name: /测试/ }).filter({ hasText: cleanQTitle }).first();
    await expect(qOpt).toBeVisible();

    // Outside click closes dropdown cleanly
    await page.locator('h1').click();
    await expect(listbox).toBeHidden();

    // Re-focus and trigger question deep-link
    await searchInput.click();
    await expect(listbox).toBeVisible();
    await expect(qOpt).toBeVisible();
    await qOpt.locator('button').click().catch(() => {});

    await expect.poll(() => capturedUrl).not.toBeNull();
    expect(capturedUrl).toMatch(
      /^https:\/\/openskill-galaxy\.github\.io\/module-[a-z0-9-]+\/\?page=%2Fquestions%2F/
    );
    guards.assertClean('portal-search-question-outside-click');
  });

  test('F7: 404.html SPA restore preserves path, multi-query params (~and~), and hash fragment', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const targetSlug = portal.sampleModuleSlug;
    await page.goto(`${server.baseUrl}/modules/${targetSlug}?tab=overview&foo=1&bar=2#topics`);
    await waitForAppReady(page);

    const loc = await page.evaluate(() => ({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    }));
    expect(loc.pathname).toBe(`/modules/${targetSlug}`);
    expect(loc.search).toContain('tab=overview');
    expect(loc.search).toContain('foo=1');
    expect(loc.search).toContain('bar=2');
    expect(loc.hash).toBe('#topics');
    await expect(page.locator('h1')).toContainText(portal.sampleModule.title);
    guards.assertClean('portal-404-restore');
  });

  test('F2: /modules?category=nonexistent&q=xyz renders empty state cleanly', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/modules?category=cat-nonexistent-999&q=xyz999`);
    await waitForAppReady(page);

    await expect(page.locator('body')).toContainText(/没有找到匹配的技能模块/);
    guards.assertClean('portal-modules-empty');
  });

  test('F2: /modules?category=<id>&q=<token> restores filter state from URL query params', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    const mod = portal.sampleModule;
    await page.goto(
      `${server.baseUrl}/modules?category=${encodeURIComponent(mod.category)}&q=${encodeURIComponent(mod.title)}`
    );
    await waitForAppReady(page);

    await expect(page.locator(`a[href*="/modules/${mod.slug}"]`).first()).toBeVisible();
    guards.assertClean('portal-modules-url-sync');
  });

  test('F2: /paths#<slug> renders and targets matching learning path section', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/paths#${portal.samplePathSlug}`);
    await waitForAppReady(page);

    await expect(page.locator(`#${portal.samplePathSlug}`)).toBeVisible();
    guards.assertClean('portal-paths-hash');
  });

  test('F7: Service Worker on nested route /modules/:slug resolves /sw.js (not /modules/sw.js)', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/modules/${portal.sampleModuleSlug}`);
    await waitForAppReady(page);

    const swScript = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL || reg.installing?.scriptURL || null;
    });
    expect(swScript).toBeTruthy();
    expect(swScript).toBe(`${server.baseUrl}/sw.js`);
    guards.assertClean('portal-nested-sw');
  });

  test('F6: BackupModal rejects invalid non-JSON backup import safely without throwing', async ({ page }) => {
    const guards = attachRuntimeGuards(page);
    await page.goto(`${server.baseUrl}/`);
    await waitForAppReady(page);

    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.getByRole('button', { name: '备份' }).click();
    const dialog = page.getByRole('dialog', { name: '备份与同步' });
    await expect(dialog).toBeVisible();

    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'bad-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ invalid json !!!'),
    });

    // Theme remains intact and no pageerror occurred
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    guards.assertClean('portal-backup-invalid-json');
  });
});
