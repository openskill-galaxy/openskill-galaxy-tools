import { expect, test } from '@playwright/test';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const data = discoverPortalFixtures();
let server;
test.beforeAll(async () => {
  server = await startPreviewServer();
});
test.afterAll(async () => {
  await server?.close();
});

// Route interception applies only to this context, including on browsers that support offline mode.
test.use({ serviceWorkers: 'block', viewport: { width: 375, height: 760 } });

for (const key of ['Escape', 'Tab']) {
  test(`Completing a delayed search does not reopen suggestions dismissed with ${key}`, async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route('**/data/global-search-index.json', async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto(server.baseUrl);
    const input = page.getByRole('combobox', { name: '全站搜索' });
    const results = page.getByRole('listbox', { name: '搜索结果' });
    const response = page.waitForResponse('**/data/global-search-index.json');
    try {
      await input.click();
      await input.fill(data.sampleModule.title);
      await expect(results.getByText(/正在加载全站/)).toBeVisible();
      await input.press(key);
      await expect(results).toBeHidden();
      if (key === 'Tab') await expect(input).not.toBeFocused();
    } finally {
      release();
    }
    const index = await response;
    await index.finished();
    // Let the async loader commit the index into React before checking the dismissed state.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(results).toBeHidden();
    await expect(input).toHaveValue(data.sampleModule.title);

    await input.click();
    await expect(results.getByRole('option').first()).toBeVisible();
    await expect(results.getByText(/正在加载全站/)).toBeHidden();
  });
}

test('Enter opens the first matching career and selects its tab on a narrow screen', async ({ page }) => {
  const career = data.careerPaths.find((entry) => entry.id === 'embedded-iot');
  expect(career).toBeTruthy();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(server.baseUrl);
  const input = page.getByRole('combobox', { name: '全站搜索' });
  await input.click();
  await input.fill(career.title);
  const option = page.getByRole('option').first();
  await expect(option).toContainText(career.title);
  await expect(option).toContainText('职业');
  const box = await option.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await input.press('Enter');
  await expect(page).toHaveURL(server.baseUrl + '/paths?tab=careers#' + career.id);
  await expect(page.getByRole('tab', { name: /职业方向/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#' + career.id).getByRole('heading', { name: career.title })).toBeInViewport();
});

test('Import validates all records and rolls back old and new keys on quota failure', async ({ page }) => {
  await page.goto(server.baseUrl);
  await page.evaluate(() => {
    localStorage.setItem('osg:prior', 'original');
    localStorage.setItem('unrelated', 'preserved');
  });
  await page.getByRole('button', { name: '备份' }).click();
  const dialog = page.getByRole('dialog', { name: '备份与同步' });
  const file = dialog.locator('input[type=file]');
  const upload = (records) => file.setInputFiles({
    name: 'progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(records)),
  });
  await upload({ 'osg:prior': 'x', 'osg:invalid': {} });
  await expect(dialog.getByRole('alert')).toContainText('格式无效');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('osg:prior'))).toBe('original');

  const progressKey = 'osg:module-python-basic:progress';
  const original = JSON.stringify({ 'lesson-1': { status: 'completed' } });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [progressKey, original]);
  await upload({ 'osg:prior': 'x', [progressKey]: JSON.stringify({ 'lesson-1': null }) });
  await expect(dialog.getByRole('alert')).toContainText('学习记录格式无效');
  expect(await page.evaluate((key) => localStorage.getItem(key), progressKey)).toBe(original);
  expect(await page.evaluate(() => localStorage.getItem('osg:prior'))).toBe('original');

  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'osg:large') {
        if (this.getItem('osg:prior') !== 'x' || this.getItem('osg:new') !== 'y') {
          throw new Error('Fixture did not reach a partially applied import');
        }
        throw new DOMException('Storage limit reached', 'QuotaExceededError');
      }
      return set.call(this, key, value);
    };
  });
  await upload({ 'osg:prior': 'x', 'osg:new': 'y', 'osg:large': '12345678' });
  await expect(dialog.getByRole('alert')).toContainText('Storage limit reached');
  await expect(dialog.getByRole('status')).toBeHidden();
  expect(await page.evaluate(() =>
    ['osg:prior', 'osg:new', 'osg:large', 'unrelated'].map((key) => localStorage.getItem(key))
  )).toEqual(['original', null, null, 'preserved']);
});
