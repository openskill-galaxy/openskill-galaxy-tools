import { test, expect } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';
import { clickOptionByKey } from '../../lib/helpers.mjs';

const slug = 'module-python-basic';
const { questions } = discoverModuleFixtures(slug);
const [first, second, third] = questions;
let server, base;
test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [slug, 'module-rust-basic'] });
  base = server.baseUrl + '/' + slug;
});
test.afterAll(async () => { await server?.close(); });

function overview(page) {
  return page.getByRole('region', { name: '我的练习' });
}
async function submit(page, q, correct = true) {
  const option = correct ? q.answer[0] : q.options.find((item) => !q.answer.includes(item.key)).key;
  await clickOptionByKey(page, option);
  await page.getByRole('button', { name: '提交本题' }).click();
  await expect(page.getByRole('main')).toContainText(correct ? '✓ 回答正确' : '✗ 回答错误');
}
async function saved(page, q) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'osg:' + slug + ':practice-result:' + q.id);
}

test('Correct answers return for spaced review and an early retry cannot extend the interval', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-04-10T06:00:00Z'));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(base + '/questions');
  await expect(overview(page)).toContainText('已作答 0 / ' + questions.length);
  await overview(page).getByRole('link', { name: '做一道未练题' }).click();
  await expect(page).toHaveURL(base + '/practice/' + first.slug + '?queue=new');
  await submit(page, first);
  const original = await saved(page, first);
  expect(original.interval).toBe(1);
  await page.getByRole('link', { name: '下一道未练题' }).click();
  await expect(page).toHaveURL(base + '/practice/' + second.slug + '?queue=new');
  await submit(page, second, false);
  await page.goto(base + '/practice/' + first.slug);
  await submit(page, first);
  expect((await saved(page, first)).nextReviewDate).toBe(original.nextReviewDate);
  await page.goto(base + '/questions');
  await expect(overview(page)).toContainText('已作答 2 / ' + questions.length + ' 道，最近一次答对 1 道');
  await page.getByLabel('作答记录').selectOption('correct');
  await expect(page.getByRole('link').filter({ hasText: first.stem })).toBeVisible();
  await expect(page.getByRole('link').filter({ hasText: second.stem })).toHaveCount(0);

  await page.clock.setFixedTime(new Date('2026-04-11T06:01:00Z'));
  await page.reload();
  await expect(overview(page)).toContainText('当前到期 2 道');
  await overview(page).getByRole('link', { name: '开始到期复习' }).click();
  await submit(page, first);
  expect((await saved(page, first)).interval).toBe(6);
  await page.getByRole('link', { name: '下一道到期题' }).click();
  await submit(page, second);
  await page.getByRole('link', { name: '本组已完成，返回题库' }).click();
  await expect(overview(page)).toContainText('当前到期 0 道');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('Legacy completed exams and mistakes populate the plan, skipped questions stay new, and another tab updates it', async ({ page, context }) => {
  await page.goto(base + '/questions');
  const previous = '2024-06-01T10:10:00Z';
  await page.evaluate(({ slug, previous, a, b, c }) => {
    const prefix = 'osg:' + slug + ':';
    localStorage.setItem(prefix + 'exams', JSON.stringify([{ examId:'old', startedAt:previous, finishedAt:previous,
      score:50, passed:false, durationSeconds:100, details:[
        {questionId:a.id, correct:true, userAnswer:a.answer}, {questionId:b.id, correct:false, userAnswer:[]},
      ] }]));
    localStorage.setItem(prefix + 'wrongs', JSON.stringify({ [c.id]:
      {questionId:c.id, lastAt:previous, wrongCount:1, lastAnswer:['?']} }));
  }, { slug, previous, a:first, b:second, c:third });
  await page.reload();
  await expect(overview(page)).toContainText('已作答 2 / ' + questions.length);
  await expect(overview(page)).toContainText('当前到期 2 道');
  const other = await context.newPage();
  await other.goto(base + '/questions/' + second.slug);
  await submit(other, second);
  await expect(overview(page)).toContainText('已作答 3 / ' + questions.length);
  await page.getByLabel('作答记录').selectOption('incorrect');
  await expect(page.getByRole('link').filter({ hasText: third.stem })).toBeVisible();
  await expect(page.getByRole('link').filter({ hasText: second.stem })).toHaveCount(0);
});

test('A full browser store is reported and pending practice is saved on the next successful submission', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.limitPractice && key.includes(':practice-result:')) throw new DOMException('Storage full','QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto(base + '/practice/' + first.slug + '?queue=new');
  await page.evaluate(() => { window.limitPractice = true; });
  await submit(page, first);
  await expect(page.getByText(/浏览器暂时无法保存练习记录/)).toBeVisible();
  expect(await saved(page, first)).toBeNull();
  await page.getByRole('link', { name: '下一道未练题' }).click();
  await page.evaluate(() => { window.limitPractice = false; });
  await submit(page, second);
  expect((await saved(page, first)).correct).toBe(true);
  expect((await saved(page, second)).correct).toBe(true);
  await expect(page.getByText(/浏览器暂时无法保存练习记录/)).toHaveCount(0);
});

for (const moduleSlug of [slug, 'module-rust-basic']) {
  test('Chapter practice preserves the queue and links back to study material in ' + moduleSlug, async ({ page }) => {
    const fixture = discoverModuleFixtures(moduleSlug);
    const course = fixture.courses.find(item => fixture.questions.filter(q => q.chapter === item.id).length >= 2);
    const chapterQuestions = fixture.questions.filter(q => q.chapter === course.id);
    const [question, next] = chapterQuestions;
    const lesson = fixture.lessons.find(item => item.practiceQuestionIds?.includes(question.id));
    const moduleBase = server.baseUrl + '/' + moduleSlug;
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(moduleBase + '/courses/' + course.slug);
    await page.getByRole('link', { name: '本章练习 · ' + chapterQuestions.length + ' 道' }).click();
    await expect(page.getByLabel('练习章节')).toHaveValue(course.id);
    await expect(overview(page)).toContainText('已作答 0 / ' + chapterQuestions.length);
    await overview(page).getByRole('link', { name: '做一道未练题' }).click();
    const params = new URLSearchParams({ queue: 'new', chapter: course.id });
    await expect(page).toHaveURL(moduleBase + '/practice/' + question.slug + '?' + params);
    await submit(page, question, false);
    const reread = page.getByRole('link', { name: lesson ? '回看讲义 · ' + lesson.title : '复习本章 · ' + course.title });
    await expect(reread).toHaveAttribute('href', '/' + moduleSlug + (lesson ? '/lessons/' + lesson.slug : '/courses/' + course.slug));
    await page.getByRole('link', { name: '下一道未练题' }).click();
    await expect(page).toHaveURL(moduleBase + '/practice/' + next.slug + '?' + params);
    await page.goto(moduleBase + '/questions?' + new URLSearchParams({ chapter: course.id }));
    await expect(overview(page)).toContainText('已作答 1 / ' + chapterQuestions.length);
    await expect(overview(page)).toContainText('下次复习时间');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}

test('Completing the wrong-book queue returns to the notebook even if a correct question is due', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-04-10T06:00:00Z'));
  await page.goto(base + '/questions/' + first.slug);
  await submit(page, first, true);
  await page.goto(base + '/questions/' + second.slug);
  await submit(page, second, false);
  await page.clock.setFixedTime(new Date('2026-04-12T06:00:00Z'));
  await page.goto(base + '/wrong');
  await page.getByRole('link', { name: /一键开启复习/ }).click();
  await expect(page.getByRole('main')).toContainText(second.stem);
  await expect(page.getByRole('main')).toContainText('还剩 1 道');
  await submit(page, second);
  await page.getByRole('link', { name: '本组已完成，返回错题本' }).click();
  await expect(page).toHaveURL(base + '/wrong');
  await page.goto(base + '/questions');
  await expect(overview(page)).toContainText('当前到期 1 道');
});

test('A question filed under a lesson is included in its parent course and returns to that lesson', async ({ page }) => {
  const fixture = discoverModuleFixtures(slug);
  const course = fixture.courses.find(item => item.id === first.chapter);
  const lesson = fixture.lessons.find(item => item.courseId === course.id);
  await page.route('**/data/questions.json', async route => {
    const response = await route.fetch();
    const content = await response.json();
    const updated = content.map(q => q.id === first.id ? { ...q, chapter: lesson.id } : q);
    await route.fulfill({ response, json: updated });
  });
  await page.goto(base + '/courses/' + course.slug);
  const count = questions.filter(q => q.chapter === course.id).length;
  await page.getByRole('link', { name: '本章练习 · ' + count + ' 道' }).click();
  await overview(page).getByRole('link', { name: '做一道未练题' }).click();
  await expect(page.getByRole('main')).toContainText(first.stem);
  await submit(page, first, false);
  await page.getByRole('link', { name: '回看讲义 · ' + lesson.title, exact: true }).click();
  await expect(page).toHaveURL(base + '/lessons/' + lesson.slug);
});
