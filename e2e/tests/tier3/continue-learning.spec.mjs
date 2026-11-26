import { expect, test } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const python = discoverModuleFixtures('module-python-basic');
const digital = discoverModuleFixtures('module-digital-logic');
let server;

test.use({ serviceWorkers: 'block' });
test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [python.meta.slug, digital.meta.slug] });
});
test.afterAll(async () => { await server?.close(); });

const panel = (page) => page.getByRole('region', { name: '继续学习' });
const row = (page, module) => panel(page).getByRole('link').filter({ hasText: module.meta.title });
function openLesson(page, module, lesson) {
  return page.goto(`${server.baseUrl}/${module.meta.slug}/?page=${encodeURIComponent('/lessons/' + lesson.slug)}`);
}

test('Read in two modules, resume the newest unfinished lesson, then advance from a completed lesson', async ({ context, page }) => {
  const [first, second] = python.lessons;
  const logic = digital.lessons[0];
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(server.baseUrl);
  await expect(page.getByRole('heading', { name: '按方向探索' })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);

  const reader = await context.newPage();
  await openLesson(reader, python, first);
  await expect(row(page, python)).toContainText(first.title);
  await expect(row(page, python)).toContainText(`已完成 0 / ${python.lessons.length} 课时`);
  await reader.getByRole('button', { name: '开始学习' }).click();
  await reader.getByRole('button', { name: '标记完成' }).click();
  await expect(row(page, python)).toContainText(second.title);
  await expect(row(page, python)).toContainText('学习下一课');

  await openLesson(reader, digital, logic);
  await expect(panel(page).getByRole('link').first()).toContainText(digital.meta.title);
  await expect(row(page, python)).toContainText(`已完成 1 / ${python.lessons.length} 课时`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await row(page, digital).click();
  await expect(page).toHaveURL(`${server.baseUrl}/${digital.meta.slug}/lessons/${logic.slug}`);
  await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(logic.title);
  await expect(page.getByRole('button', { name: '开始学习' })).toBeVisible();
});

test('Resolve shared legacy IDs, respect per-module reset and scoped progress, and ignore stale lesson IDs', async ({ page }) => {
  const stored = {
    'osg-mt:progress': JSON.stringify({
      [python.lessons[0].id]: { status: 'completed' },
      [digital.lessons[0].id]: { status: 'in-progress' },
      deletedLesson: { status: 'completed' },
    }),
    [`osg:${digital.meta.slug}:skip-legacy`]: 'true',
    'osg:module-algorithm-interview:last-lesson': '{broken json',
    'osg:module-android-kotlin:progress': '{"old":{"status":"in-progress"}}',
  };
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, stored);
  await page.goto(server.baseUrl);
  await expect(panel(page).getByRole('link')).toHaveCount(1);
  await expect(row(page, python)).toContainText(python.lessons[1].title);
  await expect(row(page, python)).toContainText(`已完成 1 / ${python.lessons.length} 课时`);
  expect(await page.evaluate(() => localStorage.getItem('osg-mt:progress'))).toBe(stored['osg-mt:progress']);
  expect(await page.evaluate((slug) => localStorage.getItem(`osg:${slug}:progress`), python.meta.slug)).toBeNull();
});

test('All lessons complete opens review; an unavailable index can be retried without losing records', async ({ page }) => {
  const key = `osg:${python.meta.slug}:progress`;
  const value = JSON.stringify(Object.fromEntries(python.lessons.map((lesson, idx) => [
    lesson.id, { lessonId: lesson.id, status: 'completed', updatedAt: new Date(Date.UTC(2025, 0, idx + 1)).toISOString() },
  ])));
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key, value });
  const indexUrl = '**/data/global-search-index.json';
  await page.route(indexUrl, (route) => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
  await page.goto(server.baseUrl);
  await expect(panel(page).getByRole('status')).toContainText('暂时无法读取课时目录');
  await page.unroute(indexUrl);
  await panel(page).getByRole('button', { name: '重试' }).click();
  await expect(row(page, python)).toContainText('复习课时');
  await expect(row(page, python)).toContainText(python.lessons.at(-1).title);
  await expect(row(page, python)).toContainText(`已完成 ${python.lessons.length} / ${python.lessons.length} 课时`);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(value);
});
