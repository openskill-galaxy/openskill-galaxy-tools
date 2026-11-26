import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { discoverModuleFixtures, discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';
import { WORKSPACE_ROOT } from '../../lib/workspace.mjs';

const moduleSlugs = ['module-python-basic', 'module-database-sql'];
const activities = moduleSlugs.flatMap((moduleSlug) => {
  const titles = JSON.parse(readFileSync(join(WORKSPACE_ROOT, moduleSlug, 'activities/catalog.json'), 'utf8'));
  return discoverModuleFixtures(moduleSlug).lessons.filter((lesson) => titles[lesson.id]).map((lesson) => ({
    moduleSlug, lesson, title: titles[lesson.id],
  }));
});
const portal = discoverPortalFixtures();
let server;
test.use({ serviceWorkers: 'block', viewport: { width: 320, height: 720 } });
test.beforeAll(async () => { server = await startPreviewServer({ moduleSlugs }); });
test.afterAll(async () => { await server?.close(); });
const panel = (page) => page.getByRole('region', { name: '可运行实作' });

test('The directory loads on expansion and all ten links scroll to the live activity at 320px', async ({ page }) => {
  const indexRequests = [];
  const runtimeRequests = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/global-search-index.json')) indexRequests.push(request.url());
    if (/\/(python-runtime|sqlite-runtime|pyodide)\//.test(request.url())) runtimeRequests.push(request.url());
  });
  await page.goto(server.baseUrl + '/modules');
  const summary = page.getByText('找可运行实作', { exact: true });
  await expect(summary).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  expect(indexRequests).toHaveLength(0);
  await summary.click();
  await expect(page).toHaveURL(/activities=1/);
  await expect(panel(page).getByRole('link')).toHaveCount(10);
  expect(activities.filter((a) => a.moduleSlug === moduleSlugs[0])).toHaveLength(7);
  expect(activities.filter((a) => a.moduleSlug === moduleSlugs[1])).toHaveLength(3);
  expect(indexRequests).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  for (const activity of activities) {
    const link = panel(page).getByRole('link').filter({ hasText: activity.title });
    await expect(link).toContainText(activity.lesson.title);
    await link.click();
    await expect(page).toHaveURL(server.baseUrl + '/' + activity.moduleSlug + '/lessons/' + activity.lesson.slug + '#lesson-activity');
    const heading = page.locator('#lesson-activity h2').filter({ hasText: activity.title });
    await expect(heading).toBeInViewport({ ratio: 1 });
    const clearOfHeader = await heading.evaluate((el) => {
      const header = document.querySelector('header.sticky');
      return el.getBoundingClientRect().top >= (header?.getBoundingClientRect().bottom ?? 0);
    });
    expect(clearOfHeader).toBe(true);
    await expect(page.locator('#lesson-activity textarea').first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.goBack();
    await expect(panel(page).getByRole('link')).toHaveCount(10);
  }
  expect(runtimeRequests).toHaveLength(0);
});

test('Filters, shared URLs, empty results and failed index retries work at 320px', async ({ page, context }) => {
  let fail = true;
  await page.route('**/global-search-index.json', (route) => fail ? route.fulfill({ status: 503, body: '' }) : route.continue());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value) => { window.lastSharedUrl = value; },
    } });
  });
  await page.goto(server.baseUrl + '/modules?activities=1');
  await expect(panel(page).getByText(/暂时无法载入实作/)).toBeVisible();
  fail = false;
  await panel(page).getByRole('button', { name: '重新加载实作' }).click();
  await expect(panel(page).getByRole('link')).toHaveCount(10);
  await page.getByRole('group', { name: '按难度筛选' }).getByRole('button', { name: '入门' }).click();
  await expect(panel(page).getByRole('link')).toHaveCount(7);
  await page.getByRole('button', { name: '重置筛选' }).click();
  await expect(panel(page).getByRole('link')).toHaveCount(10);

  const sql = portal.modules.find((module) => module.slug === moduleSlugs[1]);
  const category = portal.categories.find((item) => item.id === sql.category);
  await page.getByRole('button', { name: new RegExp('^' + category.name + '\\s*\\d+$') }).click();
  await expect(panel(page).getByRole('link')).toHaveCount(3);
  const keyword = page.getByRole('searchbox', { name: '过滤模块、标签' });
  await keyword.fill(sql.title);
  await panel(page).getByRole('button', { name: '复制目录链接' }).click();
  await expect(panel(page).getByText('已复制目录链接')).toBeVisible();
  const copiedUrl = await page.evaluate(() => window.lastSharedUrl);
  expect(copiedUrl).toBe(page.url());
  const shared = await context.newPage();
  await shared.goto(copiedUrl);
  await expect(panel(shared).getByRole('link')).toHaveCount(3);
  await expect(shared.getByRole('searchbox', { name: '过滤模块、标签' })).toHaveValue(sql.title);
  await shared.close();

  await keyword.fill('no-module-123');
  await expect(panel(page).getByRole('status')).toContainText('当前筛选下没有可运行实作');
  await expect(panel(page).getByRole('link')).toHaveCount(0);
  await page.getByRole('button', { name: '重置筛选' }).click();
  await expect(panel(page).getByRole('link')).toHaveCount(10);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await panel(page).getByRole('button', { name: '复制目录链接' }).click();
  await expect(panel(page).getByRole('textbox', { name: '复制此地址' })).toHaveValue(page.url());
  await page.getByText('找可运行实作', { exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/activities=/);
});
