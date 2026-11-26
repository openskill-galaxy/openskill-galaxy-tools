import { expect, test } from '@playwright/test';
import { discoverModuleFixtures, discoverPortalFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-python-basic';
const fx = discoverModuleFixtures(slug);
const portal = discoverPortalFixtures();
const path = portal.learningPaths.find((item) => item.modules.includes(fx.meta.id));
const pathModules = portal.modules.filter((m) => path.modules.includes(m.id) || path.modules.includes(m.slug));
const total = fx.lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0);
const course = fx.courses[0];
const courseMinutes = fx.lessons.filter((l) => course.lessons.includes(l.id)).reduce((sum, l) => sum + l.estimatedMinutes, 0);
const time = (minutes) => {
  if (minutes < 60) return `约 ${minutes} 分钟`;
  return `约 ${Math.floor(minutes / 60)} 小时${minutes % 60 ? ' ' + minutes % 60 + ' 分钟' : ''}`;
};
let server;
test.use({ serviceWorkers: 'block' });
test.beforeAll(async () => { server = await startPreviewServer({ moduleSlugs: [slug] }); });
test.afterAll(async () => { await server?.close(); });

test('Portal, path, module and course estimates reflect the same underlying lessons', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const base = server.baseUrl;
  const main = page.getByRole('main');
  await page.goto(base + '/modules/' + slug);
  const label = main.getByText('讲义预计用时', { exact: true });
  await expect(label.locator('..')).toContainText(time(total));
  await page.goto(base + '/paths#' + path.slug);
  const section = main.locator('section').filter({ has: page.getByRole('heading', { name: path.title, exact: true }) });
  const pathTotal = pathModules.reduce((sum, m) => sum + m.lessonMinutes, 0);
  await expect(section.getByText('讲义' + time(pathTotal), { exact: true })).toBeVisible();
  await expect(section.getByText(`建议周期 ${path.estimatedMonths} 个月`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.goto(base + '/' + slug + '/');
  await expect(main.getByText('讲义' + time(total), { exact: true })).toBeVisible();
  await page.goto(base + '/' + slug + '/courses');
  await expect(main.getByRole('link').filter({ hasText: course.title })).toContainText('讲义' + time(courseMinutes));
  await page.goto(base + '/' + slug + '/courses/' + course.slug);
  await expect(main).toContainText('讲义' + time(courseMinutes));
  await page.goto(base + '/' + slug + '/about');
  await expect(main.getByText('讲义预计用时', { exact: true }).locator('..')).toContainText(time(total));
});

test('Incomplete legacy data shows unknown study time rather than old hours or a partial sum', async ({ page }) => {
  const base = server.baseUrl;
  const main = page.getByRole('main');
  await page.route('**/data/modules.json', async (route) => {
    const response = await route.fetch();
    const modules = await response.json();
    for (const item of modules) delete item.lessonMinutes;
    await route.fulfill({ response, json: modules });
  });
  await page.goto(base + '/modules/' + slug);
  await expect(main.getByText('讲义预计用时', { exact: true }).locator('..')).toContainText('暂无估时');
  await page.goto(base + '/paths#' + path.slug);
  await expect(main.locator('section[id="' + path.slug + '"]').getByText('讲义暂无估时', { exact: true })).toBeVisible();

  await page.route('**/data/lessons.json', async (route) => {
    const response = await route.fetch();
    const lessons = await response.json();
    delete lessons.find((item) => course.lessons.includes(item.id)).estimatedMinutes;
    await route.fulfill({ response, json: lessons });
  });
  await page.goto(base + '/' + slug + '/courses/' + course.slug);
  await expect(main).toContainText('讲义暂无估时');
  await page.goto(base + '/' + slug + '/about');
  await expect(main.getByText('讲义预计用时', { exact: true }).locator('..')).toContainText('暂无估时');
});
