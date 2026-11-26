import { test, expect } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';

test('Offline reading survives portal activation, a new deep link and a cold page', async ({ context }) => {
  const slug = 'module-python-basic';
  const { lessons } = discoverModuleFixtures(slug);
  const server = await startPreviewServer({ moduleSlugs: [slug] });
  try {
    const modulePage = await context.newPage();
    await modulePage.goto(`${server.baseUrl}/${slug}/`);
    await modulePage.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const cacheNames = () => modulePage.evaluate(() => caches.keys());
    const ownCache = (await cacheNames()).find((name) => name.startsWith(`openskill-galaxy-${slug}-`));
    expect(ownCache).toBeTruthy();

    // Seed one older portal cache and one unrelated application cache on the same origin.
    await modulePage.evaluate(async () => {
      await caches.open('openskill-galaxy-portal-v1');
      await caches.open('other-application');
    });
    const portalPage = await context.newPage();
    await portalPage.goto(server.baseUrl);
    await portalPage.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect.poll(cacheNames).not.toContain('openskill-galaxy-portal-v1');
    const remaining = await cacheNames();
    expect(remaining).toContain(ownCache);
    expect(remaining).toContain('other-application');
    expect(remaining).not.toContain('openskill-galaxy-portal-v1');

    await server.close();
    await modulePage.close();
    await portalPage.close();
    const coldPage = await context.newPage();
    await coldPage.goto(`${server.baseUrl}/${slug}/lessons/${lessons[0].slug}`);
    await expect(coldPage.getByRole('heading', { level: 1 })).toHaveText(lessons[0].title);
    await coldPage.goto(`${server.baseUrl}/paths`);
    await expect(coldPage.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(coldPage.locator('main')).toContainText('学习路径');
  } finally {
    await server.close();
  }
});

test('A direct GitHub Pages link preserves literal separators, query values and anchors', async ({ page }) => {
  const server = await startPreviewServer({ moduleSlugs: ['module-python-basic'] });
  try {
    for (const path of ['/modules', '/module-python-basic/search']) {
      const query = '?q=A%2BB%26C~and~D&label=x%2Fy#results';
      await page.goto(server.baseUrl + path + query);
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveURL(server.baseUrl + path + query);
    }
  } finally {
    await server.close();
  }
});
