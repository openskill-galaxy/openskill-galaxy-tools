import { test, expect } from '@playwright/test';
import { discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const data = discoverPortalFixtures();
const lessons = data.globalSearchIndex.filter((item) => item.type === 'lesson');
const smallest = Math.min(...lessons.map((item) => item.estimatedMinutes));
const sample = lessons.find((item) => item.estimatedMinutes === smallest);
let server;
test.use({ serviceWorkers: 'block' });
test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [sample.moduleSlug] });
});
test.afterAll(async () => { await server?.close(); });

test('Time-limited lessons honor module filters and open the advertised lesson', async ({ page }) => {
  let indexRequests = 0;
  page.on('request', req => { if (req.url().endsWith('/global-search-index.json')) indexRequests++; });
  await page.goto(server.baseUrl + '/modules');
  await expect(page.getByText('按可用时间找一讲', { exact: true })).toBeVisible();
  expect(indexRequests).toBe(0);
  await page.getByText('按可用时间找一讲', { exact: true }).click();
  const section = page.getByRole('region', { name: '按可用时间找一讲' });
  const count = lessons.filter((item) => item.estimatedMinutes <= 15).length;
  await expect(section.getByRole('status')).toContainText(count + ' 节讲义');
  await expect(section.getByRole('link')).toHaveCount(6);
  await section.getByRole('button', { name: '显示更多讲义' }).click();
  await expect(section.getByRole('link')).toHaveCount(12);
  const query = new URLSearchParams({ q: sample.moduleTitle, minutes: '15' });
  await page.goto(server.baseUrl + '/modules?' + query);
  const link = section.getByRole('link').filter({ hasText: sample.title });
  await expect(link).toContainText(sample.estimatedMinutes + ' 分钟');
  await link.click();
  await expect(page.locator('main h1').first()).toHaveText(sample.title);
  await page.goBack();
  await expect(section.getByRole('button', { name: '15 分钟以内' })).toHaveAttribute('aria-pressed', 'true');
  await section.getByRole('button', { name: '45 分钟以内' }).click();
  await expect(page).toHaveURL(/minutes=45/);
});

test('A failed lesson index can be retried and a filter with no matches has an actionable empty state', async ({ page }) => {
  let unavailable = true;
  await page.route('**/global-search-index.json', route =>
    unavailable ? route.fulfill({ status: 503, body: '' }) : route.continue());
  await page.goto(server.baseUrl + '/modules?minutes=15&q=zz-no-module');
  const section = page.getByRole('region', { name: '按可用时间找一讲' });
  await expect(section.getByText(/暂时无法载入讲义/)).toBeVisible();
  unavailable = false;
  await section.getByRole('button', { name: '重新加载讲义' }).click();
  await expect(section.getByRole('status')).toContainText('可增加时间或调整模块筛选');
  await expect(section.getByRole('link')).toHaveCount(0);
});
