import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-algorithm-interview';
const { cases } = discoverModuleFixtures(slug);
const [first, second] = cases;
let server;
let base;

test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [slug] });
  base = server.baseUrl + '/' + slug + '/cases';
});
test.afterAll(async () => { await server?.close(); });

test('A learner can resume, compare, revise and export an individual case at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(base);
  await page.getByRole('link').filter({ hasText: first.title }).click();
  const answer = page.getByLabel('我的作答', { exact: true });
  const review = page.getByRole('checkbox', { name: '我已对照参考思路完成自评' });
  const download = page.getByRole('button', { name: /导出作品/ });
  await expect(download).toBeDisabled();
  const solution = '先验证样例，再比较结果。\n预期和实际值一致。';
  await answer.fill(solution);
  await expect(review).toHaveCount(0);
  await page.reload();
  await expect(answer).toHaveValue(solution);
  await page.getByText('查看参考思路', { exact: true }).click();
  await review.check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const pending = page.waitForEvent('download');
  await download.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe(first.slug + '-work.md');
  const text = await readFile(await file.path(), 'utf8');
  expect(text).toContain(first.tasksMarkdown);
  expect(text).toContain(solution);
  expect(text).toContain('已对照参考思路自评');
  await page.goto(base);
  const link = page.getByRole('link').filter({ hasText: first.title });
  await expect(link).toContainText('已自评');
  await page.getByRole('link').filter({ hasText: second.title }).click();
  await expect(answer).toHaveValue('');
  await page.goto(base + '/' + first.slug);
  await expect(review).toBeChecked();
  await answer.fill('第二稿');
  await expect(review).not.toBeChecked();
  await page.goto(base);
  await expect(link).toContainText('作答草稿');
});

test('An unsaved case remains exportable when browser storage is full', async ({ page }) => {
  await page.addInitScript(() => {
    const previous = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes(':case-work:')) throw new DOMException('Storage full', 'QuotaExceededError');
      return previous.call(this, key, value);
    };
  });
  await page.goto(base + '/' + first.slug);
  await page.getByLabel('我的作答', { exact: true }).fill('保留这段作答');
  await expect(page.getByRole('status').filter({ hasText: '未能保存' })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出作品/ }).click();
  expect(await readFile(await (await pending).path(), 'utf8')).toContain('保留这段作答');
});
