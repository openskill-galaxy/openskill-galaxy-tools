import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-data-analyst';
const { cases } = discoverModuleFixtures(slug);
const baseline = cases.find((item) => item.id === 'case-data-analyst-workshop');
const ledger = cases.find((item) => item.id === baseline.nextCaseId);
const decision = cases.find((item) => item.id === ledger.nextCaseId);
const generalSlug = 'module-python-basic';
const generalCase = discoverModuleFixtures(generalSlug).cases.find((item) => !item.reviewRubric?.length);
let server;
let caseUrl;

test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [slug, generalSlug] });
  caseUrl = server.baseUrl + '/' + slug + '/cases/';
});
test.afterAll(async () => { await server?.close(); });

async function exportedDocument(page, label) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  const download = await pending;
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

test('A legacy submission can be assessed against each criterion and handed to an independent reviewer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const key = 'osg:' + slug + ':case-work:' + baseline.id;
  await page.goto(caseUrl);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ answer: '原作：全站 13/100。', reviewed: true })), key);
  await page.getByRole('link').filter({ hasText: baseline.title }).click();
  const answer = page.getByLabel('我的作答', { exact: true });
  await expect(answer).toHaveValue('原作：全站 13/100。');
  await expect(page.getByRole('status').filter({ hasText: '已记录' })).toHaveText('已记录 0 / 3 项');
  const completed = page.getByRole('checkbox');
  await expect(completed).toBeDisabled();
  await page.getByText('查看参考思路', { exact: true }).click();

  for (const [i, criterion] of baseline.reviewRubric.entries()) {
    const group = page.getByRole('group', { name: criterion.title });
    await group.getByLabel('自评判断').selectOption(i === 2 ? 'revise' : 'met');
    await expect(completed).toBeDisabled();
    await group.getByLabel('证据或差距').fill('此项专用记录 ' + criterion.title);
  }
  await completed.check();
  await page.reload();
  await expect(page.getByRole('checkbox')).toBeChecked();
  const group = page.getByRole('group', { name: baseline.reviewRubric[2].title });
  await expect(group.getByLabel('自评判断')).toHaveValue('revise');
  await expect(group.getByLabel('证据或差距')).toContainText('此项专用记录');
  const self = await exportedDocument(page, '导出作品（Markdown）');
  expect(self.text).toContain('自评判断：需改进');
  expect(self.text).toContain('此项专用记录');
  const handoff = await exportedDocument(page, '导出独立评阅表（Markdown）');
  expect(handoff.name).toBe(baseline.slug + '-review.md');
  expect(handoff.text).toContain(baseline.backgroundMarkdown);
  expect(handoff.text).toContain('原作：全站 13/100。');
  expect(handoff.text).not.toContain('此项专用记录');
  for (const criterion of baseline.reviewRubric) expect(handoff.text).toContain(criterion.requirement);
  expect(handoff.text.match(/复核结论/g)).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await answer.fill('补上可复算的两渠道基线。');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(group.getByLabel('证据或差距')).toContainText('此项专用记录');
  await page.getByRole('link', { name: '下一阶段 · ' + ledger.title }).click();
  await expect(page.getByLabel('我的作答', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: '下一阶段 · ' + decision.title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(decision.title);
  await page.getByRole('link', { name: '上一阶段 · ' + ledger.title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ledger.title);
});

test('An evidence-only draft survives reloading and the order ledger reconciles to the final memo', async ({ page }) => {
  await page.goto(caseUrl + ledger.slug);
  const group = page.getByRole('group', { name: ledger.reviewRubric[0].title });
  await group.getByLabel('证据或差距').fill('按订单号和版本核对。');
  await page.reload();
  await expect(group.getByLabel('证据或差距')).toHaveValue('按订单号和版本核对。');
  const copy = await exportedDocument(page, '导出作品（Markdown）');
  expect(copy.text).toContain('按订单号和版本核对。');
  await expect(page.getByRole('button', { name: '导出独立评阅表（Markdown）' })).toBeDisabled();

  const csv = await page.locator('main pre code').first().innerText();
  const events = csv.trim().split('\n').slice(1).map((line) => line.split(','));
  const final = new Map();
  for (const [id, channel, version, status] of events) {
    if (!final.has(id) || Number(version) > final.get(id).version) final.set(id, { channel, version: Number(version), status });
  }
  const paid = [...final.values()].filter((event) => event.status === 'paid');
  const a = paid.filter((event) => event.channel === 'A').length;
  const b = paid.filter((event) => event.channel === 'B').length;
  expect([events.length, final.size, a, b]).toEqual([21, 19, 12, 6]);
  expect(10 * a / 40 + 90 * b / 60).toBe(12);
  await page.getByRole('link', { name: '下一阶段 · ' + decision.title }).click();
  await page.getByText('查看参考思路', { exact: true }).click();
  await expect(page.getByRole('main')).toContainText('−1 个百分点');
  await expect(page.getByRole('main')).toContainText('+6 个百分点');
});

test('Invalid rubric backup cannot replace an existing project, and valid notes can be restored', async ({ page }) => {
  await page.goto(caseUrl + baseline.slug);
  const answer = page.getByLabel('我的作答', { exact: true });
  await answer.fill('原稿');
  await page.getByRole('button', { name: '本地 JSON 备份', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const key = 'osg:' + slug + ':case-work:' + baseline.id;
  const criterion = baseline.reviewRubric[0].id;
  async function upload(review) {
    const serialized = JSON.stringify({ answer: '从备份恢复的作答', reviewed: false, criteria: { [criterion]: review } });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'work.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ [key]: serialized })),
    });
  }
  await upload({ status: ['met'], evidence: '错误类型不能自动转换成已达到' });
  await expect(dialog).toContainText('学习记录格式无效');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).answer, key)).toBe('原稿');
  await upload({ status: 'met', evidence: '可复算的数字' });
  await expect(answer).toHaveValue('从备份恢复的作答');
  await expect(page.getByRole('group', { name: baseline.reviewRubric[0].title }).getByLabel('证据或差距')).toHaveValue('可复算的数字');
});

test('A received review stays with the submitted version and can be included in a separate export', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(caseUrl + baseline.slug);
  const answer = page.getByLabel('我的作答', { exact: true });
  const old = '第一版：我计算到渠道 A 转化率 40%。';
  const current = '第二版：已补全整体 13/100。';
  await answer.fill(old);
  const request = await exportedDocument(page, '导出独立评阅表（Markdown）');
  const named = request.text.replace('评阅人：', '评阅人：林老师')
    .replace('证据与修改建议：', '证据与修改建议：请同时指出渠道 B 的分母。')
    .replace('优先修改的部分：', '优先修改的部分：补全两渠道汇总。');
  await answer.fill(current);
  const exchange = page.getByRole('region', { name: '他人评阅' });
  const upload = async (text) => exchange.getByLabel('已填写的评阅表文件').setInputFiles({
    name: 'returned.md', mimeType: 'text/markdown', buffer: Buffer.from(text),
  });
  await upload(request.text);
  await expect(exchange.getByRole('status')).toContainText('尚无意见');
  await upload(named.replace(old, '我改写了学员提交的原稿。'));
  await expect(exchange.getByRole('status')).toContainText('送审原稿已被改动');
  await upload(named.replace(/openskill-review:v1 \S+/, 'openskill-review:v1 module-unrelated'));
  await expect(exchange.getByRole('status')).toContainText('其他案例');
  await upload(named.replace(/(openskill-review:v1 \S+ \S+ )[0-9a-f]{24}/, '$1' + 'f'.repeat(24)));
  await expect(exchange.getByRole('status')).toContainText('没有这个送审版本');
  await upload(named.replace('<!-- openskill-field:summary -->', ''));
  await expect(exchange.getByRole('status')).toContainText('栏目与送审版本不一致');
  await upload('\uFEFF' + named.replace(/\n/g, '\r\n'));
  await expect(exchange.getByRole('status')).toContainText('反馈已保存');
  await expect(answer).toHaveValue(current);
  await upload(named);
  await expect(exchange.getByRole('status')).toContainText('相同反馈已保存');
  const anonymous = request.text.replace('复查方式：','复查方式：再用按访问数加权的方法复算。');
  await upload(anonymous);
  await expect(exchange.getByRole('status')).toContainText('反馈已保存');
  await page.reload();
  await exchange.getByText(/历史稿件 · 2 份反馈/).click();
  await expect(exchange.getByRole('heading', { name: '林老师' })).toBeVisible();
  await expect(exchange.getByRole('heading', { name: '匿名评阅人' })).toBeVisible();
  await expect(exchange.getByText('证据与修改建议：请同时指出渠道 B 的分母。')).toBeVisible();
  await exchange.getByText('查看送审原稿').click();
  await expect(exchange.getByText(old, { exact: true })).toBeVisible();
  const plain = await exportedDocument(page, '导出作品（Markdown）');
  expect(plain.text).toContain(current);
  expect(plain.text).not.toContain(old);
  expect(plain.text).not.toContain('林老师');
  await page.getByLabel('作品导出时附上外部评语及对应送审原稿').check();
  const full = await exportedDocument(page, '导出作品（Markdown）');
  for (const expected of [current, old, '林老师','匿名','请同时指出渠道 B 的分母','再用按访问数加权']) {
    expect(full.text).toContain(expected);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('A case without a rubric accepts an overall review and restores it from a cross-site backup', async ({ page }) => {
  const url = server.baseUrl + '/' + generalSlug + '/cases/' + generalCase.slug;
  const key = 'osg:' + generalSlug + ':case-work:' + generalCase.id;
  const original = '第一版：按原始名称合并库存。';
  const revision = '第二版：先统一大小写，再合并库存。';
  const note = '用两种大小写的同一个商品名检查合并结果。';
  await page.goto(url);
  const exchange = page.getByRole('region', { name: '他人评阅' });
  await expect(exchange).toContainText('本案例采用综合意见');
  await expect(exchange.getByRole('button', { name: /导出独立评阅表/ })).toBeDisabled();
  const answer = page.getByLabel('我的作答', { exact: true });
  await answer.fill(original);
  const handoff = await exportedDocument(page, '导出独立评阅表（Markdown）');
  expect(handoff.text).toContain(original);
  expect(handoff.text).toContain('本案例采用综合意见');
  expect(handoff.text.match(/<!-- openskill-field:[\w-]+ -->/g)).toEqual([
    '<!-- openskill-field:name -->', '<!-- openskill-field:summary -->',
  ]);
  await answer.fill(revision);
  const picker = exchange.getByLabel('已填写的评阅表文件');
  await picker.setInputFiles({ name: 'blank.md', mimeType: 'text/markdown', buffer: Buffer.from(handoff.text) });
  await expect(exchange.getByRole('status')).toHaveText('评阅表尚无意见，请填写综合意见。');
  const returned = handoff.text.replace('优先修改的部分：', '优先修改的部分：' + note);
  await picker.setInputFiles({ name: 'review.md', mimeType: 'text/markdown', buffer: Buffer.from(returned) });
  await expect(exchange.getByRole('status')).toContainText('反馈已保存');
  await page.reload();
  await exchange.getByText(/历史稿件 · 1 份反馈/).click();
  await expect(exchange.getByText(note, { exact: false })).toBeVisible();
  await expect(answer).toHaveValue(revision);

  await page.getByRole('button', { name: '本地 JSON 备份', exact: true }).click();
  const backup = await exportedDocument(page, '导出进度备份 (.json)');
  const payload = JSON.parse(backup.text);
  const work = JSON.parse(payload[key]);
  expect(work.reviewVersions[0]).toMatchObject({ answer: original, rubric: [], feedback: [{ comments: {} }] });
  await page.evaluate((key) => localStorage.removeItem(key), key);
  await page.goto(server.baseUrl);
  await page.getByRole('button', { name: '备份', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const input = dialog.locator('input[type=file]');
  work.reviewVersions[0].feedback[0].comments = { invented: '原表没有这一项标准' };
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ [key]: JSON.stringify(work) })) });
  await expect(dialog.getByRole('alert')).toContainText('学习记录格式无效');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await input.setInputFiles({ name: backup.name, mimeType: 'application/json', buffer: Buffer.from(backup.text) });
  await expect(dialog.getByRole('status')).toContainText('已恢复');
  await expect(dialog).toHaveCount(0);
  await page.goto(url);
  await expect(answer).toHaveValue(revision);
  await exchange.getByText(/历史稿件 · 1 份反馈/).click();
  await exchange.getByText('查看送审原稿').click();
  await expect(exchange.getByText(original, { exact: true })).toBeVisible();
  await expect(exchange.getByText(note, { exact: false })).toBeVisible();
});
