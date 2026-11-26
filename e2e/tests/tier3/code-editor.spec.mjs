import { expect, test } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';

let server;
test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: ['module-digital-logic'] });
});
test.afterAll(async () => { await server?.close(); });
const lessonUrl = () => server.baseUrl + '/module-digital-logic/lessons/lesson-1-1';

test('Code editor permits indentation and keyboard navigation in both directions', async ({ page }) => {
  await page.goto(lessonUrl());
  const editor = page.getByRole('textbox', { name: '代码编辑器' }).first();
  await editor.fill('x');
  await editor.press('End');
  await editor.press('Tab');
  await expect(editor).toHaveValue('x  ');
  await editor.press('Escape');
  await editor.press('Tab');
  await expect(editor).not.toBeFocused();
  await editor.focus();
  await editor.press('Shift+Tab');
  await expect(editor).not.toBeFocused();
  await expect(editor).toHaveValue('x  ');
});

test('JavaScript console reports syntax and asynchronous errors and preserves literal markup', async ({ page }) => {
  await page.goto(lessonUrl());
  const editor = page.getByRole('textbox', { name: '代码编辑器' }).first();
  const run = page.getByRole('button', { name: '运行代码 ▶' }).first();
  const output = page.frameLocator('iframe[title="Code Sandbox Output"]').first().locator('#output');
  await editor.fill('const a = ;');
  await run.click();
  await expect(output).toContainText('语法错误');
  await editor.fill('console.log("</script>", "example"); setTimeout(() => {throw new Error("timer-failed")}, 0); Promise.reject(new Error("promise-failed"));');
  await run.click();
  await expect(output).toContainText('</script> example');
  await expect(output).toContainText(/timer-failed|回调执行失败，浏览器未提供详细信息/);
  await expect(output).toContainText('promise-failed');
});


test('TypeScript remains readable and HTML previews the current markup', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.route('**/data/lessons.json', async (route) => {
      const response = await route.fetch();
      const lessons = await response.json();
      const lesson = lessons.find((entry) => entry.slug === 'lesson-1-1');
      lesson.contentMarkdown = [
        '```typescript', 'const n: number = 3;', '```',
        '```html', '<strong>示例</strong>', '```',
      ].join('\n');
      await route.fulfill({ response, json: lessons });
    });
    await page.goto(lessonUrl());
    await expect(page.locator('pre code').filter({ hasText: 'const n: number = 3;' })).toBeVisible();
    const editor = page.getByRole('textbox', { name: '代码编辑器' });
    await expect(editor).toHaveCount(1);
    await expect(editor).toHaveValue('<strong>示例</strong>');
    await page.getByRole('button', { name: /运行代码/ }).click();
    await expect(page.frameLocator('iframe[title="Code Sandbox Output"]').locator('strong')).toHaveText('示例');
  } finally {
    await context.close();
  }
});
