import { expect, test } from '@playwright/test';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-python-basic';
let server;
test.beforeAll(async () => { server = await startPreviewServer({ moduleSlugs: [slug] }); });
test.afterAll(async () => { await server?.close(); });

const exercises = [
  {
    path: 'lesson-1-1', title: '计算每日平均阅读页数', samples: 4,
    error: 'pages = list(map(int, input().split()))\nprint(f"{sum(pages)/len(pages):.1f}" if sum(pages) else "暂无记录")',
    hint: '两天各读零页仍然有记录',
    solution: `def mean_pages(pages: list[int]) -> float | None:
    return sum(pages) / len(pages) if pages else None

average = mean_pages([int(x) for x in input().split()])
print("暂无记录" if average is None else f"{average:.1f}")`,
  },
  {
    path: 'lesson-1-2', title: '整理活动标签', samples: 3,
    error: 'print(" ".join(dict.fromkeys(input().lower().split())))',
    hint: '集合的遍历顺序不保证是字母顺序',
    solution: 'print(" ".join(sorted(set(input().lower().split()))))',
  },
  {
    path: 'lesson-2-1', title: '为两个账户分别累计积分', samples: 3,
    error: `a, b = map(int, input().split())
for token in input().split():
    account, amount = token.split(":")
    print((a if account == "A" else b) + int(amount))`,
    hint: '同一闭包的第二次调用',
    solution: `def make_counter(start):
    def change(amount):
        nonlocal start
        start += amount
        return start
    return change

a, b = map(int, input().split())
accounts = {"A": make_counter(a), "B": make_counter(b)}
for token in input().split():
    account, amount = token.split(":")
    print(accounts[account](int(amount)))`,
  },
  {
    path: 'lesson-2-2', title: '按批次处理记录', samples: 3,
    error: `size = int(input())
group = []
for record in input().split():
    group.append(record)
    if len(group) == size:
        print(*group)
        group = []`,
    hint: '最后的单条记录也要产出',
    solution: `def batches(records, size):
    batch = []
    for item in records:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch

size = int(input())
for batch in batches(iter(input().split()), size):
    print(*batch)`,
  },
  {
    path: 'lesson-3-1', title: '按仓库和货号汇总库存变动', samples: 3,
    error: `totals = {}
for _ in range(int(input())):
    warehouse, sku, delta = input().split()
    totals[warehouse, sku] = int(delta)
for key in sorted(totals):
    print(*key, totals[key])`,
    hint: '同一个键再次出现时',
    solution: `from dataclasses import dataclass
from collections import Counter

@dataclass(frozen=True, order=True)
class StockKey:
    warehouse: str
    sku: str

totals = Counter()
for _ in range(int(input())):
    warehouse, sku, delta = input().split()
    totals[StockKey(warehouse, sku)] += int(delta)
for key in sorted(totals):
    print(key.warehouse, key.sku, totals[key])`,
  },
  {
    path: 'lesson-3-2', title: '读取项目的测试目录配置', samples: 3,
    error: `import sys, tomllib
cfg = tomllib.loads(sys.stdin.read())
paths = cfg.get("tool", {}).get("pytest", {}).get("ini_options", {}).get("testpaths")
print("\\n".join(paths) if paths else "未配置")`,
    hint: '空列表也代表键已设置',
    solution: `import sys, tomllib

config = tomllib.loads(sys.stdin.read())
paths = config.get("tool", {}).get("pytest", {}).get("ini_options", {}).get("testpaths")
if paths is None:
    print("未配置")
elif not paths:
    print("无目录")
else:
    print(*paths, sep="\\n")`,
  },
  {
    path: 'lesson-4-1', title: '从 JSON 汇总已支付订单', samples: 3,
    error: 'import json\nprint(sum(max(x["amount"], 0) for x in json.loads(input()) if x["status"] == "paid"))',
    hint: '退款的金额已经是负数',
    solution: 'import json\nprint(sum(x["amount"] for x in json.loads(input()) if x["status"] == "paid"))',
  },
];

for (const exercise of exercises) {
  test(`Python practice: ${exercise.title} checks typical mistakes, independent inputs and progress`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`${server.baseUrl}/${slug}/lessons/${exercise.path}`);
    await page.getByRole('link', { name: '本讲编程练习 ↓' }).click();
    const activity = page.locator('#python-practice');
    await expect(activity.getByRole('heading')).toContainText(exercise.title);
    const editor = activity.getByLabel('Python 代码');
    const check = activity.getByRole('button', { name: '检查全部样例' });
    const challenge = activity.getByRole('button', { name: '用一组新输入检验' });
    await editor.fill(exercise.error);
    await check.click();
    await expect(activity.getByText(exercise.hint, { exact: false })).toBeVisible();
    await expect(activity.getByRole('status')).toContainText('个样例');
    await expect(activity.getByRole('status')).not.toHaveText(`通过 ${exercise.samples} / ${exercise.samples} 个样例`);
    await expect(challenge).toHaveCount(0);

    await editor.fill(exercise.solution);
    await check.click();
    await expect(activity.getByRole('status')).toHaveText(`通过 ${exercise.samples} / ${exercise.samples} 个样例`);
    await challenge.click();
    await expect(activity.getByRole('status')).toHaveText('新输入通过');
    const badge = activity.getByText('此版本已通过公开样例和新输入', { exact: true });
    await page.reload();
    await expect(editor).toHaveValue(exercise.solution);
    await expect(badge).toBeVisible();
    const progress = await page.evaluate(() => localStorage.getItem('osg:module-python-basic:progress'));
    expect(Object.values(JSON.parse(progress || '{}')).some((entry) => entry.status === 'completed')).toBe(false);
    await editor.fill(exercise.solution + '\n# 修改版本');
    await expect(badge).toHaveCount(0);
    await expect(challenge).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}

test('A program matching only the published outputs receives the new-input diagnostic', async ({ page }) => {
  await page.goto(`${server.baseUrl}/${slug}/lessons/lesson-1-2`);
  const activity = page.locator('#python-practice');
  await activity.getByLabel('Python 代码').fill('print({"Python web PYTHON api": "api python web", "JS js JS": "js"}.get(input(), ""))');
  await activity.getByRole('button', { name: '检查全部样例' }).click();
  await expect(activity.getByRole('status')).toHaveText('通过 3 / 3 个样例');
  await activity.getByRole('button', { name: '用一组新输入检验' }).click();
  await expect(activity.getByRole('status')).toHaveText('新输入未通过');
  await expect(activity.getByText('alpha beta delta', { exact: true })).toBeVisible();
  await expect(activity.getByText(/这一组同时有混合大小写/)).toBeVisible();
  await expect(activity.getByText('此版本已通过全部公开样例', { exact: true })).toBeVisible();
  await expect(activity.getByText('此版本已通过公开样例和新输入', { exact: true })).toHaveCount(0);
});
