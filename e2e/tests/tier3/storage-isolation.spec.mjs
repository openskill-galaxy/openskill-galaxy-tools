import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { attachRuntimeGuards, clickOptionByKey, waitForAppReady } from '../../lib/helpers.mjs';

async function readDownloadJson(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test.describe('Tier 3 — Same-Origin localStorage Isolation (F6, F4, F5)', () => {
  let server;
  let modAFx;
  let modBFx;

  test.beforeAll(async () => {
    modAFx = discoverModuleFixtures('module-python-basic');
    modBFx = discoverModuleFixtures('module-algorithm-interview');
    server = await startPreviewServer({
      requirePortal: true,
      moduleSlugs: ['module-python-basic', 'module-algorithm-interview'],
    });
  });

  test.afterAll(async () => {
    if (server) await server.close();
  });

  test('Pairwise 4: Lesson completion, favorites, and wrong questions in Module A stay isolated from Module B', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    // Record completion + favorite in Module A
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${modAFx.lessonSlug}`);
    await waitForAppReady(page);

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

    // Submit a wrong question in Module A
    const q = modAFx.singleQuestion;
    await page.goto(`${server.baseUrl}/module-python-basic/questions/${q.slug}`);
    await waitForAppReady(page);
    await clickOptionByKey(page, modAFx.wrongOptionKey);
    await page.getByRole('button', { name: /提交本题/ }).click();
    await expect(page.locator('body')).toContainText(/回答错误/);

    await page.goto(`${server.baseUrl}/module-python-basic/wrong`);
    await waitForAppReady(page);
    await expect(page.locator('body')).toContainText(q.stem.slice(0, 12));

    // Verify Module B on SAME origin has 0 completed, 0 favorites, 0 wrongs
    await page.goto(`${server.baseUrl}/module-algorithm-interview/lessons/${modBFx.lessonSlug}`);
    await waitForAppReady(page);
    await expect(page.getByRole('button', { name: '开始学习' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('✓ 已完成');

    await page.goto(`${server.baseUrl}/module-algorithm-interview/wrong`);
    await waitForAppReady(page);
    await expect(page.locator('body')).not.toContainText(q.stem.slice(0, 12));

    await page.goto(`${server.baseUrl}/module-algorithm-interview/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).not.toContainText(modAFx.lessons[0].title);
    guards.assertClean('storage-isolation-state');
  });

  test('Pairwise 5: localStorage keys use distinct module-scoped prefixes (zero legacy osg-mt:)', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${modAFx.lessonSlug}`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /收藏/ }).first().click();

    await page.goto(`${server.baseUrl}/module-algorithm-interview/lessons/${modBFx.lessonSlug}`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /收藏/ }).first().click();

    const keys = await page.evaluate(() => Object.keys(localStorage));
    const legacyShared = keys.filter((k) => k.startsWith('osg-mt:'));
    expect(legacyShared).toEqual([]);

    const modAKeys = keys.filter((k) => k.includes('module-python-basic'));
    const modBKeys = keys.filter((k) => k.includes('module-algorithm-interview'));
    expect(modAKeys.length).toBeGreaterThan(0);
    expect(modBKeys.length).toBeGreaterThan(0);
    guards.assertClean('storage-isolation-keys');
  });

  test('Pairwise 6: Scoped reset in Module A (AboutPage) preserves Module B state intact', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });

    // Favorite in Module A & Module B
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${modAFx.lessonSlug}`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /收藏/ }).first().click();

    await page.goto(`${server.baseUrl}/module-algorithm-interview/lessons/${modBFx.lessonSlug}`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /收藏/ }).first().click();

    // Accept confirm + alert dialogs and clear Module A data
    page.on('dialog', async (d) => {
      await d.accept();
    });
    await page.goto(`${server.baseUrl}/module-python-basic/about`);
    await waitForAppReady(page);
    await page.getByRole('button', { name: /清空本地数据记录/ }).click();

    // Module A favorites should be cleared
    await page.goto(`${server.baseUrl}/module-python-basic/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).not.toContainText(modAFx.lessons[0].title);

    // Module B favorites MUST still exist!
    await page.goto(`${server.baseUrl}/module-algorithm-interview/favorites`);
    await waitForAppReady(page);
    await expect(page.locator('body')).toContainText(modBFx.lessons[0].title);
    guards.assertClean('storage-scoped-reset');
  });

  test('Pairwise 7: Module BackupModal exports scoped JSON and preserves shared theme', async ({ page }) => {
    const guards = attachRuntimeGuards(page, { allowDocument404: true });
    await page.goto(`${server.baseUrl}/module-python-basic/lessons/${modAFx.lessonSlug}`);
    await waitForAppReady(page);
    const favBtn = page.getByRole('button', { name: /收藏/ }).first();
    await expect(favBtn).toBeVisible();
    await favBtn.click();
    await expect(favBtn).toContainText('已收藏');

    await page.goto(`${server.baseUrl}/module-python-basic/`);
    await waitForAppReady(page);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    await page.locator('button[aria-label="本地 JSON 备份"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const exportBtn = dialog.getByRole('button', { name: /导出/ });
    await expect(exportBtn).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^openskill_galaxy_backup_\d{4}-\d{2}-\d{2}\.json$/);

    const exportedJson = await readDownloadJson(download);
    expect(exportedJson.theme).toBe('dark');
    expect(Object.keys(exportedJson).some((k) => k.startsWith('osg:module-python-basic:'))).toBe(true);
    expect(Object.keys(exportedJson).filter((k) => k.startsWith('osg-mt:'))).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    guards.assertClean('storage-backup-theme');
  });
});
