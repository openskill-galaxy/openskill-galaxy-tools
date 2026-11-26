import { expect, test } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';

test('Python activities run editable code, report mismatches, and reuse the installed interpreter offline', async ({ page }) => {
  let withholdWasm = true;
  const server = await startPreviewServer({
    moduleSlugs: ['module-python-basic'],
    isUnavailable: (pathname) => withholdWasm && pathname.endsWith('/pyodide.asm.wasm'),
  });
  const downloads = [];
  page.on('request', (request) => {
    if (request.url().includes('/python-runtime/')) downloads.push(request.url());
  });
  try {
    await page.goto(server.baseUrl + '/module-python-basic/courses');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.goto(server.baseUrl + '/module-python-basic/lessons/lesson-1-2');
    await page.getByRole('link', { name: '本讲编程练习 ↓' }).click();
    const activity = page.locator('#python-practice');
    const editor = activity.getByLabel('Python 代码');
    const check = activity.getByRole('button', { name: '检查全部样例' });
    await expect(editor).toBeVisible();
    expect(downloads).toEqual([]);
    await check.click();
    await expect(activity.getByRole('status')).toContainText('首次运行需要联网');
    withholdWasm = false;
    await expect(editor).toBeEditable();
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('通过 1 / 3 个样例');
    await expect(activity).toContainText('输出不符');
    expect(new Set(downloads).size).toBe(5);
    const solution = 'print(" ".join(sorted(set(input().lower().split()))))';
    await editor.fill(solution);
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('通过 3 / 3 个样例');
    await page.reload();
    await expect(editor).toHaveValue(solution);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await server.close();
    await page.goto(server.baseUrl + '/module-python-basic/lessons/lesson-4-1');
    await editor.fill('import json\norders = json.loads(input())\nprint(sum(order["amount"] for order in orders if order["status"] == "paid"))');
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('通过 3 / 3 个样例');
    await activity.getByText('使用自己的输入', { exact: true }).click();
    await activity.getByLabel('标准输入').fill('[{"status":"paid","amount":123}]');
    await activity.getByRole('button', { name: '运行我的输入' }).click();
    await expect(activity.locator('pre')).toHaveText('123');
  } finally {
    await server.close();
  }
});

test('Python activities report syntax errors, stop long-running code, and recover', async ({ page }) => {
  const server = await startPreviewServer({ moduleSlugs: ['module-python-basic'] });
  try {
    await page.goto(server.baseUrl + '/module-python-basic/lessons/lesson-1-2');
    const activity = page.locator('#python-practice');
    const editor = activity.getByLabel('Python 代码');
    const check = activity.getByRole('button', { name: '检查全部样例' });
    await editor.fill('if True print(1)');
    await check.click();
    await expect(activity).toContainText('SyntaxError');
    await expect(activity.getByRole('status')).toHaveText('通过 0 / 3 个样例');
    await editor.fill('while True:\n    pass');
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('正在运行 Python…');
    await activity.getByRole('button', { name: '停止运行' }).click();
    await expect(editor).toBeEditable();
    await expect(activity.getByRole('status')).toContainText('已停止');
    await check.click();
    await expect(activity.getByRole('status')).toContainText('运行超过 5 秒', { timeout: 15000 });
    await editor.fill('print(" ".join(sorted(set(input().lower().split()))))');
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('通过 3 / 3 个样例');
  } finally {
    await server.close();
  }
});
