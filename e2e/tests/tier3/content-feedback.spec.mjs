import { expect, test } from '@playwright/test';
import { discoverModuleFixtures } from '../../lib/fixtures.mjs';
import { startPreviewServer } from '../../lib/server.mjs';

const python = discoverModuleFixtures('module-python-basic');
const algorithm = discoverModuleFixtures('module-algorithm-interview');
const privateValue = 'private-study-detail-5631';
let server;
test.use({ serviceWorkers: 'block' });
test.beforeAll(async () => { server = await startPreviewServer({ moduleSlugs: [python.meta.slug, algorithm.meta.slug] }); });
test.afterAll(async () => { await server?.close(); });

test('Only the public entry, module and canonical URL are included in a GitHub draft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const contacted = [];
  page.on('request', (req) => { if (new URL(req.url()).hostname === 'github.com') contacted.push(req.url()); });
  const examples = [
    [python, 'lessons', 'lessons', '讲义', python.lessons[0]],
    [python, 'questions', 'questions', '题目', python.questions[0]],
    [python, 'practice', 'questions', '题目', python.questions[0]],
    [algorithm, 'cases', 'cases', '案例', algorithm.cases[0]],
  ];
  for (const [module, route, section, label, item] of examples) {
    const path = '/' + module.meta.slug + '/' + route + '/' + encodeURIComponent(item.slug);
    await page.goto(server.baseUrl + path + '?q=' + privateValue + '#private-anchor');
    const link = page.getByRole('main').getByRole('link', { name: label + '纠错' });
    await expect(link).toBeVisible();
    if (section === 'cases') await page.getByLabel('我的作答').fill(privateValue + '-answer');
    const url = new URL(await link.getAttribute('href'));
    const canonical = new URL('/' + module.meta.slug + '/' + section + '/' + encodeURIComponent(item.slug), module.meta.portalUrl);
    expect(url.origin + url.pathname).toBe(module.meta.repoUrl + '/issues/new');
    const body = url.searchParams.get('body');
    expect(body).toContain(item.title ?? item.stem);
    expect(body).toContain(module.meta.title);
    expect(body).toContain('条目 ID：' + item.id);
    expect(body).toContain('页面：' + canonical.href + '\n');
    expect(body).not.toContain(privateValue);
    expect(body).not.toContain('private-anchor');
    expect(body).not.toContain('127.0.0.1');
    expect([...url.searchParams.keys()]).toEqual(['title', 'body']);
    expect(await link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(await link.getAttribute('rel')).toContain('noreferrer');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
  expect(contacted).toEqual([]);
});

test('A private page reports only the module; missing or third party repositories retain normal navigation', async ({ page }) => {
  const base = server.baseUrl + '/' + python.meta.slug;
  await page.goto(base + '/wrong?private=' + privateValue);
  const generic = page.getByRole('contentinfo').getByRole('link', { name: '反馈模块问题' });
  await expect(generic).toBeVisible();
  const body = new URL(await generic.getAttribute('href')).searchParams.get('body');
  expect(body).toContain('页面：' + python.meta.portalUrl + python.meta.slug + '/\n');
  expect(body).not.toContain('wrong');
  expect(body).not.toContain(privateValue);

  let repo;
  await page.route('**/data/module.json', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), repoUrl: repo } });
  });
  for (repo of [undefined, 'https://gitlab.com/example/course', 'https://github.com.example.com/example/course']) {
    await page.goto(base + '/lessons/' + python.lessons[0].slug);
    await expect(page.locator('main h1').first()).toHaveText(python.lessons[0].title);
    await expect(page.getByRole('link', { name: '讲义纠错' })).toHaveCount(0);
    await expect(generic).toHaveCount(0);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: '常见问题' })).toBeVisible();
  }
});
