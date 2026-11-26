import { expect, test } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-python-basic';
const fixture = discoverModuleFixtures(slug);
const [full, fast] = fixture.routes;
const byLesson = new Map(fixture.lessons.map((lesson) => [lesson.id, lesson]));
const lessons = full.steps.map((step) => byLesson.get(step.lessonId));
const fastLessons = fast.steps.map((step) => byLesson.get(step.lessonId));
let server;
let base;

test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [slug] });
  base = server.baseUrl + '/' + slug;
});

test.afterAll(async () => { await server?.close(); });

test('A route resumes the next lesson, counts explicit completion and shares it with overlapping routes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const route = page.getByRole('region', { name: full.title });
  const shortRoute = page.getByRole('region', { name: fast.title });
  const routeUrl = base + '/routes#' + full.slug;
  const first = lessons[0];
  const shared = fastLessons[0];
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);

  await page.goto(routeUrl);
  await expect(route).toContainText(`待完成讲义约 ${minutes} 分钟`);
  await route.getByRole('link', { name: '学习第 1 步 · ' + first.title }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(first.title);
  await page.goBack();
  await expect(route).toContainText(`已完成 0 / ${lessons.length} 节讲义`);

  await shortRoute.getByRole('link', { name: '学习第 1 步 · ' + shared.title }).click();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.goBack();
  const resume = shortRoute.getByRole('link', { name: '继续第 1 步 · ' + shared.title });
  await expect(resume).toBeVisible();
  await expect(shortRoute).toContainText(`已完成 0 / ${fastLessons.length} 节讲义`);
  await resume.click();
  await page.getByRole('button', { name: '标记完成', exact: true }).click();
  await page.goBack();
  await page.reload();

  await expect(route).toContainText(`已完成 1 / ${lessons.length} 节讲义`);
  await expect(route).toContainText(`待完成讲义约 ${minutes - shared.estimatedMinutes} 分钟`);
  await expect(shortRoute).toContainText(`已完成 1 / ${fastLessons.length} 节讲义`);
  await expect(shortRoute.getByRole('link', { name: '学习第 2 步 · ' + fastLessons[1].title })).toBeVisible();
  await expect(route.getByRole('link', { name: '学习第 1 步 · ' + first.title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('A finished route keeps lessons available for rereading without a next-step prompt', async ({ page }) => {
  await page.addInitScript(({ slug, ids }) => {
    const progress = Object.fromEntries(ids.map((lessonId) => [
      lessonId, { lessonId, status: 'completed', updatedAt: '2026-01-01T00:00:00Z' },
    ]));
    localStorage.setItem('osg:' + slug + ':progress', JSON.stringify(progress));
  }, { slug, ids: fastLessons.map((lesson) => lesson.id) });
  await page.goto(base + '/routes#' + fast.slug);

  const route = page.getByRole('region', { name: fast.title });
  await expect(route.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(route.getByRole('link', { name: /^(学习|继续)第/ })).toHaveCount(0);
  await expect(route).not.toContainText('待完成讲义约');
  await route.getByRole('link', { name: fastLessons[0].title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(fastLessons[0].title);
});
