import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';

let server;
test.beforeAll(async () => { server = await startPreviewServer({ moduleSlugs: ['module-python-basic'] }); });
test.afterAll(async () => { await server?.close(); });

test('On a narrow screen, the lesson outline opens by keyboard and focuses the selected heading', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(server.baseUrl + '/module-python-basic/lessons/lesson-1-1');

  const toggle = page.getByRole('button', { name: '本讲目录' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const outline = page.getByRole('navigation', { name: '讲义目录导航' });
  const section = outline.getByRole('button', { name: /CPython 如何执行/ });
  await expect(section).toBeVisible();
  await section.focus();
  await page.keyboard.press('Enter');

  const heading = page.getByRole('heading', { name: /CPython 如何执行/ });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const header = await page.locator('header.app-bar').boundingBox();
  const target = await heading.boundingBox();
  expect(target.y).toBeGreaterThanOrEqual(header.y + header.height);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('navigation', { name: '模块导航' })
    .getByRole('link', { name: '课程列表' })).toHaveAttribute('aria-current', 'page');
});
