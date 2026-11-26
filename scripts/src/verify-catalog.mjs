#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isPublished } from './utils/editorial.mjs';
import { getModuleDirs, getPortalDir } from './utils/workspace.mjs';

const metrics = [
  ['courses', 'courses', 'totalCourses'], ['lessons', 'lessons', 'totalLessons'],
  ['knowledge-points', 'knowledgePoints', 'totalKnowledgePoints'], ['questions', 'questions', 'totalQuestions'],
  ['exams', 'exams', 'totalExams'], ['cases', 'cases', 'totalCases'], ['routes', 'routes', 'totalRoutes'],
  ['glossary', 'glossary', 'totalGlossary'], ['faqs', 'faqs', 'totalFaqs'], ['tags', 'tags', 'totalTags'],
  ['search-index', 'searchIndexEntries', 'totalSearchIndexEntries'],
];
const usage = `node src/verify-catalog.mjs local|staged|live [--origin URL] [--expect-dist] [--json]
  local   核对待发布的 dist/data、源码数据和独立模块
  staged  核对本地主站 dist/data 与已经上线的模块
  live    核对线上主站与线上模块
  --expect-dist  比较本次读取的线上文件和本地 dist/data
  --concurrency N  模块并发数（默认 6，上限 16）
  --timeout-ms N   单文件读取超时（默认 15000）
  退出码 0 一致，1 数据差异，2 核验不完整或参数错误。`;

function records(value, keyOf) {
  if (!Array.isArray(value)) throw new Error('需要 JSON 数组');
  const seen = new Set();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('条目不是对象');
    const key = keyOf(row);
    if (typeof key !== 'string' || !key.trim()) throw new Error('条目标识缺失');
    if (seen.has(key)) throw new Error('条目标识重复 ' + key);
    seen.add(key);
  }
  return value;
}

function moduleSlug(row) {
  if (!/^module-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) || row.slug === 'module-template') {
    throw new Error('模块目录名称无效 ' + row.slug);
  }
  return row.slug;
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象');
  return value;
}

function positiveInt(value, name, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(name + ' 参数超出范围');
  return n;
}

async function readRemoteBytes(url, timeout) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-cache' });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      await response.body?.cancel();
      throw new Error('HTTP ' + response.status);
    } catch (error) {
      const transient = !response || response.ok || [408, 429, 500, 502, 503, 504].includes(response.status);
      if (attempt === 1 || !transient) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function audit(mode, options) {
  const origin = new URL(options.origin || 'https://openskill-galaxy.github.io/');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error('origin 需要 HTTP(S) 站点根地址');
  }
  if (!origin.pathname.endsWith('/')) origin.pathname += '/';
  const limit = positiveInt(options.concurrency, 'concurrency', 16);
  const timeout = positiveInt(options['timeout-ms'], 'timeout-ms', 120000);
  const checkDist = options['expect-dist'];
  const standalone = mode === 'live' && !checkDist;
  const dirs = new Map(standalone ? [] : getModuleDirs().map((m) => [m.name, m.path]));
  const result = { mode, origin: mode === 'local' ? null : origin.href, modules: 0, totals: {}, differences: [], errors: [] };
  function compare(key, declared, actual) {
    if (declared !== actual) result.differences.push({ key, declared: declared ?? null, actual: actual ?? null });
  }
  function countClaim(key, declared, actual) {
    if (!Number.isSafeInteger(declared) || declared < 0) result.errors.push({ key, message: '缺少非负整数统计' });
    else if (actual !== null) compare(key, declared, actual);
  }
  async function load(slug, name, validate) {
    const path = (slug ? slug + '/' : '') + 'data/' + name + '.json';
    try {
      const local = mode === 'local' || (mode === 'staged' && !slug);
      const dir = slug ? dirs.get(slug) : getPortalDir();
      let bytes;
      if (local) {
        if (!dir) throw new Error('缺少本地模块');
        bytes = await readFile(join(dir, 'dist/data', name + '.json'));
        const source = await readFile(join(dir, 'public/data', name + '.json'));
        if (!bytes.equals(source)) result.differences.push({ key: path, message: 'dist 与 public 的数据文件不同' });
      } else {
        const url = new URL(path, origin);
        bytes = await readRemoteBytes(url, timeout);
        if (checkDist) {
          if (!dir) throw new Error('缺少用于比对的本地模块');
          const candidate = await readFile(join(dir, 'dist/data', name + '.json'));
          if (!bytes.equals(candidate)) result.differences.push({ key: path, message: '线上文件与本次 dist 不同' });
        }
      }
      return validate(JSON.parse(bytes.toString('utf8')));
    } catch (error) {
      result.errors.push({ key: path, message: error.message });
      return null;
    }
  }

  const catalog = await load('', 'modules', (v) => {
    records(v, moduleSlug);
    if (!v.length) throw new Error('模块目录为空');
    return records(v, (r) => r.id);
  });
  if (!catalog) return result;
  result.modules = catalog.length;
  const slugs = new Set(catalog.map((m) => m.slug));
  if (!standalone) {
    for (const slug of dirs.keys()) if (!slugs.has(slug)) result.differences.push({ key: slug, message: '本地模块没有列入候选目录' });
  }
  const stats = await load('', 'platform-stats', object);
  const health = await load('', 'site-health-report', (v) => { object(v); records(v.modules, (r) => r.slug); return v; });
  const healthBySlug = new Map(health?.modules.map((m) => [m.slug, m]));
  if (health) {
    countClaim('health.moduleCount', health.moduleCount, catalog.length);
    if (health.totals) countClaim('health.totals.moduleCount', health.totals.moduleCount, catalog.length);
    for (const slug of healthBySlug.keys()) if (!slugs.has(slug)) result.differences.push({ key: slug, message: '健康报告含未注册模块' });
  }
  if (stats) countClaim('platform.moduleCount', stats.moduleCount, catalog.length);
  const globalIndex = await load('', 'global-search-index', (v) => records(v, (r) => {
    if (!r.id || typeof r.id !== 'string' || !['lesson', 'question'].includes(r.type) ||
        !r.moduleSlug || typeof r.slug !== 'string' || !r.slug) throw new Error('课时或题目索引标识无效');
    return [r.moduleSlug, r.type, r.id].join('/');
  }));
  const indexed = new Map();
  for (const row of globalIndex ?? []) {
    const key = row.moduleSlug + '/' + row.type;
    if (!indexed.has(key)) indexed.set(key, new Map());
    indexed.get(key).set(JSON.stringify([row.id, row.slug]), row);
  }
  for (const key of indexed.keys()) {
    if (!slugs.has(key.split('/')[0])) result.differences.push({ key, message: '全站索引含未注册模块' });
  }
  const counted = Object.fromEntries(metrics.map(([, , key]) => [key, { sum: 0, modules: 0 }]));
  async function checkModule(entry) {
    const slug = entry.slug;
    const meta = await load(slug, 'module', object);
    if (meta) {
      compare(slug + '.slug', meta.slug, slug);
      compare(slug + '.id', meta.id, entry.id);
    }
    const report = healthBySlug.get(slug);
    if (health && !report) result.differences.push({ key: slug, message: '健康报告缺少模块' });
    for (const [file, key, totalKey] of metrics) {
      const list = await load(slug, file, (v) => records(v, file === 'search-index'
        ? (r) => typeof r.id === 'string' && r.id && r.type ? r.type + '/' + r.id : ''
        : (r) => r.id));
      if (!list) continue;
      const visible = file === 'search-index' ? list : list.filter(isPublished);
      counted[totalKey].sum += visible.length;
      counted[totalKey].modules++;
      if (meta && file !== 'search-index') countClaim(slug + '.stats.' + key, meta.stats?.[key], visible.length);
      if (report) countClaim(slug + '.health.' + key, report.counts?.[key], visible.length);
      if (file === 'lessons' && (entry.lessonMinutes !== undefined || mode !== 'live')) {
        const complete = visible.length && visible.every((l) => Number.isFinite(l.estimatedMinutes) && l.estimatedMinutes > 0);
        const minutes = complete ? visible.reduce((sum, l) => sum + l.estimatedMinutes, 0) : undefined;
        compare(slug + '.lessonMinutes', entry.lessonMinutes, minutes);
      }
      if (globalIndex && (file === 'lessons' || file === 'questions')) {
        const indexKey = slug + '/' + (file === 'lessons' ? 'lesson' : 'question');
        const claims = indexed.get(indexKey) || new Map();
        const source = new Set(visible.map((r) => JSON.stringify([r.id, r.slug])));
        const absent = [...source].filter((k) => !claims.has(k));
        const stale = [...claims.keys()].filter((k) => !source.has(k));
        if (file === 'lessons') {
          for (const lesson of visible) {
            const row = claims.get(JSON.stringify([lesson.id, lesson.slug]));
            if (row && (entry.lessonMinutes !== undefined || row.estimatedMinutes !== undefined)) {
              compare(indexKey + '/' + lesson.id + '.estimatedMinutes', row.estimatedMinutes, lesson.estimatedMinutes);
            }
          }
        }
        if (absent.length || stale.length) result.differences.push({
          key: 'global-index/' + indexKey, missing: absent.length, stale: stale.length,
          missingExample: absent.slice(0, 2).map((key) => JSON.parse(key)), staleExample: stale.slice(0, 2).map((key) => JSON.parse(key)),
        });
      }
    }
  }
  let next = 0;
  async function worker() {
    while (next < catalog.length) await checkModule(catalog[next++]);
  }
  await Promise.all(Array.from({ length: Math.min(catalog.length, limit) }, worker));
  for (const [, , key] of metrics) {
    const { sum, modules } = counted[key];
    const actual = modules === catalog.length ? sum : null;
    result.totals[key] = { declared: stats?.[key] ?? null, actual, measuredModules: modules };
    if (stats) countClaim('platform.' + key, stats[key], actual);
    if (health?.totals) countClaim('health.totals.' + key, health.totals[key], actual);
  }
  result.differences.sort((a, b) => a.key.localeCompare(b.key));
  result.errors.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    origin: { type: 'string' }, 'expect-dist': { type: 'boolean' }, json: { type: 'boolean' },
    concurrency: { type: 'string', default: '6' }, 'timeout-ms': { type: 'string', default: '15000' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) console.log(usage);
  else {
    if (positionals.length !== 1 || !['local', 'staged', 'live'].includes(positionals[0])) throw new Error(usage);
    const mode = positionals[0];
    if (mode === 'local' && (values.origin || values['expect-dist'])) throw new Error('线上参数仅适用于 staged 或 live');
    const result = await audit(mode, values);
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log('核验 ' + mode + '，目录 ' + result.modules + ' 个模块');
      for (const [key, row] of Object.entries(result.totals)) {
        console.log(key + '  主站 ' + (row.declared ?? '?') + '  模块 ' + (row.actual ?? '未知') +
          '  已读 ' + row.measuredModules + '/' + result.modules);
      }
      console.log('数据差异 ' + result.differences.length + '，读取或格式问题 ' + result.errors.length);
      for (const item of [...result.errors.slice(0, 5), ...result.differences.slice(0, 8)]) console.log(JSON.stringify(item));
      if (result.errors.length > 5 || result.differences.length > 8) console.log('使用 --json 查看所有差异及来源');
    }
    process.exitCode = result.errors.length ? 2 : result.differences.length ? 1 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
