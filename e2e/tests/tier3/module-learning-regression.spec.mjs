import { expect, test } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const slug = 'module-python-basic';
const fixture = discoverModuleFixtures(slug);
const exam = fixture.exams[0];
const [first, second] = exam.questionIds.map((id) => fixture.questions.find((q) => q.id === id));
let server;
let base;

test.beforeAll(async () => {
  server = await startPreviewServer({ moduleSlugs: [slug] });
  base = server.baseUrl + '/' + slug;
});

test.afterAll(async () => {
  await server?.close();
});

test('Exam answers survive leaving and reloading; history opens the selected attempt', async ({ page }) => {
  const examUrl = base + '/exams/' + exam.slug;
  const main = page.getByRole('main');
  await page.goto(examUrl);
  const wrong = first.options.find((option) => !first.answer.includes(option.key));
  const option = main.getByRole('button', { name: wrong.key + ' ' + wrong.text, exact: true });
  await option.focus();
  await page.keyboard.press('Enter');
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await main.getByRole('button', { name: '下一题' }).click();
  await page.goto(base + '/courses');
  await page.goto(examUrl);
  await page.reload();
  await expect(main).toContainText('第 2 /');
  await expect(main).toContainText('已答 1/');
  await main.getByRole('button', { name: '提前交卷' }).click();
  await expect(main.getByText('逐题评分与答题回顾')).toBeVisible();
  const firstResult = page.url();
  await page.goto(base + '/wrong');
  await expect(main).toContainText(first.stem);
  await expect(main).toContainText('共 1 道错题');
  await page.goto(examUrl);
  const correct = first.options.find((item) => item.key === first.answer[0]);
  await main.getByRole('button', { name: correct.key + ' ' + correct.text, exact: true }).click();
  await main.getByRole('button', { name: '提前交卷' }).click();
  await expect(main.getByText('逐题评分与答题回顾')).toBeVisible();
  const secondResult = page.url();
  expect(secondResult).not.toBe(firstResult);
  await page.goto(base + '/exams');
  const history = main.locator('section').filter({ hasText: '模考历史记录' });
  await history.getByRole('link', { name: exam.title }).nth(1).click();
  await expect(page).toHaveURL(firstResult);
  await expect(main.locator('header p.text-4xl')).toHaveText('0 分');
  await page.reload();
  await expect(main.locator('header p.text-4xl')).toHaveText('0 分');
});

test('Returning to an expired draft grades the saved answer once at the original deadline', async ({ page }) => {
  await page.goto(base + '/exams/' + exam.slug);
  await page.getByRole('main').locator('button.option-btn').first().waitFor();
  await page.evaluate(({ slug, exam, first }) => {
    const key = 'osg:' + slug + ':exam-draft:' + exam.id;
    const draft = JSON.parse(sessionStorage.getItem(key));
    draft.startedAt = new Date(Date.now() - (exam.timeLimitMinutes + 10) * 60_000).toISOString();
    draft.answers[first.id] = first.answer;
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, { slug, exam, first });
  await page.reload();
  await expect(page.getByText('逐题评分与答题回顾')).toBeVisible();
  await page.reload();
  await expect(page.getByText('逐题评分与答题回顾')).toBeVisible();
  const records = await page.evaluate((slug) => JSON.parse(localStorage.getItem('osg:' + slug + ':exams')), slug);
  expect(records).toHaveLength(1);
  expect(records[0].durationSeconds).toBe(exam.timeLimitMinutes * 60);
  expect(records[0].details[0]).toMatchObject({ questionId: first.id, correct: true });
});

test('Review opens a due question when a newer mistake is scheduled for later', async ({ page }) => {
  await page.goto(base + '/wrong');
  await page.evaluate(({ first, second, slug }) => {
    const times = ['2025-09-03T00:00:00Z', '2025-09-01T00:00:00Z'];
    const wrongs = [first, second].map((q, i) => [q.id, {
      questionId: q.id, wrongCount: 1, lastAt: times[i], lastAnswer: [],
      nextReviewDate: i === 0 ? '2099-01-01T00:00:00Z' : times[i],
    }]);
    localStorage.setItem('osg:' + slug + ':wrongs', JSON.stringify(Object.fromEntries(wrongs)));
  }, { first, second, slug });
  await page.reload();
  await page.getByRole('link', { name: /一键开启复习/ }).click();
  await expect(page.getByRole('main')).toContainText(second.stem);
});

test('Small screens expose every course and lesson, and a worked lesson opens its practice question', async ({ page }) => {
  const moduleSlug = 'module-digital-logic';
  const fx = discoverModuleFixtures(moduleSlug);
  const preview = await startPreviewServer({ moduleSlugs: [moduleSlug] });
  try {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(preview.baseUrl + '/' + moduleSlug + '/');
    const graph = page.getByRole('heading', { name: '课程结构', exact: true }).locator('../..');
    for (const item of [...fx.courses, ...fx.lessons]) {
      const link = graph.getByRole('link', { name: item.title, exact: true });
      await expect(link).toBeVisible();
      const bounds = await link.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    }
    const lesson = fx.lessons.find((item) => item.practiceQuestionIds?.length);
    const question = fx.questions.find((item) => item.id === lesson.practiceQuestionIds[0]);
    await graph.getByRole('link', { name: lesson.title, exact: true }).click();
    await page.getByRole('link', { name: question.stem, exact: true }).click();
    await expect(page).toHaveURL(preview.baseUrl + '/' + moduleSlug + '/practice/' + question.slug);
    await expect(page.getByRole('main')).toContainText(question.stem);
  } finally {
    await preview.close();
  }
});

test('Module search releases the keyboard on Tab and selects the first suggestion on Enter', async ({ page }) => {
  await page.goto(base + '/');
  const input = page.getByRole('combobox', { name: '全站搜索' });
  await input.fill(fixture.lessons[0].title);
  const options = page.getByRole('listbox', { name: '搜索匹配结果' });
  await expect(options).toBeVisible();
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'module-result-0');
  await input.press('Tab');
  await expect(options).toBeHidden();
  await input.focus();
  await input.press('Escape');
  await expect(options).toBeHidden();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(fixture.lessons[0].title);
});
