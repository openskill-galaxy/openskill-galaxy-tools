import { expect, test } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-database-sql';
const tasks = [
  {
    path: 'lesson-1-1', title: '按报名人去重', hint: '按组内的人员编号去重',
    sql: 'SELECT event, COUNT(DISTINCT person) AS n FROM signups GROUP BY event ORDER BY event',
  },
  {
    path: 'lesson-2-1', title: '统计每个分馆的在借册数', hint: '计数右表中非空的借阅编号',
    sql: `SELECT b.code, COUNT(l.id) AS n
FROM branches b LEFT JOIN loans l ON l.branch = b.code AND l.returned_on IS NULL
GROUP BY b.code ORDER BY b.code`,
  },
  {
    path: 'lesson-2-2', title: '筛选达到复购门槛的顾客', hint: 'HAVING 中同时检查笔数和金额',
    sql: `-- 只保留已支付订单
WITH paid AS (SELECT customer, amount FROM orders WHERE status = 'paid')
SELECT customer, COUNT(*), SUM(amount) AS total FROM paid
GROUP BY customer HAVING COUNT(*) >= 2 AND total >= 100 ORDER BY total DESC, customer;`,
  },
];

for (const task of tasks) {
  test(`SQLite: ${task.title} checks real result rows, hints and revisiting the query`, async ({ page }) => {
    const server = await startPreviewServer({ moduleSlugs: [slug] });
    try {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto(`${server.baseUrl}/${slug}/lessons/${task.path}`);
      await page.getByRole('link', { name: '本讲编程练习 ↓' }).click();
      const activity = page.locator('#sql-practice');
      const editor = activity.getByLabel('SQL 查询');
      const check = activity.getByRole('button', { name: '检查两组数据' });
      await expect(activity.getByRole('heading')).toContainText(task.title);
      await check.click();
      await expect(activity.getByRole('status')).toContainText('组数据');
      await expect(activity.getByRole('status')).not.toHaveText('通过 2 / 2 组数据');
      await expect(activity.getByText(task.hint, { exact: false })).toBeVisible();
      await editor.fill(task.sql);
      await check.click();
      await expect(activity.getByRole('status')).toHaveText('通过 2 / 2 组数据');
      await expect(activity.getByRole('table', { name: '实际结果' })).toHaveCount(2);
      await activity.getByText('对照输入与预期', { exact: true }).last().click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      await page.reload();
      await expect(editor).toHaveValue(task.sql);
      await expect(activity.getByText('此版本已通过两组数据')).toBeVisible();
      await editor.fill('SELECT 1 AS example;');
      await expect(activity.getByText('此版本已通过两组数据')).toHaveCount(0);
    } finally {
      await server.close();
    }
  });
}

test('SQLite loads on demand, recovers from an unavailable engine, and runs on a cold offline page', async ({ page }) => {
  let holdWasm = true;
  const server = await startPreviewServer({
    moduleSlugs: [slug],
    isUnavailable: path => holdWasm && path.endsWith('/sql-wasm.wasm'),
  });
  try {
    const files = new Set();
    page.on('request', request => {
      if (request.url().includes('/sqlite-runtime/')) files.add(request.url().split('/').at(-1));
    });
    const base = server.baseUrl + '/' + slug;
    await page.goto(base + '/lessons/lesson-3-2');
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('#sql-practice')).toHaveCount(0);
    await page.goto(base + '/lessons/' + tasks[0].path);
    const activity = page.locator('#sql-practice');
    const editor = activity.getByLabel('SQL 查询');
    await expect(editor).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    expect([...files]).toEqual([]);
    await editor.fill(tasks[0].sql);
    const check = activity.getByRole('button', { name: '检查两组数据' });
    await check.click();
    await expect(activity.getByRole('status')).toContainText('首次运行需要联网');
    holdWasm = false;
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('通过 2 / 2 组数据');
    expect([...files].sort()).toEqual(['sql-wasm.js', 'sql-wasm.wasm']);
    await server.close();
    await page.goto(base + '/lessons/' + tasks[1].path);
    await editor.fill(tasks[1].sql);
    await check.click();
    await expect(activity.getByRole('status')).toHaveText('通过 2 / 2 组数据');
  } finally {
    await server.close();
  }
});

test('SQLite shows syntax errors, can stop a long query and accepts an edited query', async ({ page }) => {
  const server = await startPreviewServer({ moduleSlugs: [slug] });
  try {
    await page.goto(server.baseUrl + '/' + slug + '/lessons/' + tasks[0].path);
    const activity = page.locator('#sql-practice');
    const editor = activity.getByLabel('SQL 查询');
    const run = activity.getByRole('button', { name: '运行示例' });
    await editor.fill('SELECT FROM signups;');
    await run.click();
    await expect(activity.getByRole('status')).toContainText('syntax error');
    await editor.fill('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT SUM(x) FROM n');
    await run.click();
    await activity.getByRole('button', { name: '停止查询' }).click();
    await expect(activity.getByRole('status')).toContainText('已停止');
    await run.click();
    await expect(activity.getByRole('status')).toContainText('查询超过 5 秒', { timeout: 15000 });
    await editor.fill('SELECT COUNT(*) AS n FROM signups');
    await run.click();
    await expect(activity.getByRole('table', { name: '实际结果' }).getByRole('cell', { name: '5' })).toBeVisible();
  } finally {
    await server.close();
  }
});
