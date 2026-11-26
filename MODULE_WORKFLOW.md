# OpenSkill Galaxy 模块开发工作流

本文档描述在 **63 仓扁平工作区**（`<root>/openskill-galaxy.github.io`、`<root>/module-template`、`<root>/openskill-galaxy-tools`、`<root>/module-*`）下创建、校验、同步与发布学习模块的完整流程。

## 从 module-template 创建新模块

1. 在工作区根目录克隆模板：

```bash
cd /path/to/openskill-galaxy
git clone https://github.com/openskill-galaxy/module-template.git module-xxx
cd module-xxx
```

2. 修改 `vite.config.ts` 中的 `base`：

```ts
// 例如 Python 基础模块
base: "/module-python-basic/"
```

3. 修改 `package.json` 中的 `name` 与 `description`：

```json
{
  "name": "openskill-module-python-basic",
  "description": "Python 编程基础学习模块"
}
```

4. 更新 `index.html` 中的 `<title>`、`<meta name="description">`、`<meta property="og:title">` 与 `<meta property="og:description">`（后续也可由 `propagate.mjs` 基于 `module.json` 自动生成并保留非占位配置）。

5. 更新 `public/manifest.json`（或由 `optimize-pwa-and-search.mjs` 自动个性化）：

```json
{
  "short_name": "Python基础",
  "name": "OpenSkill Galaxy — Python 编程基础",
  "start_url": "/module-python-basic/",
  "scope": "/module-python-basic/"
}
```

6. 修改 `public/data/module.json`（注意 `id` 使用 `mod-<name>`，`slug` 与仓库目录名一致）：

```json
{
  "id": "mod-python-basic",
  "slug": "module-python-basic",
  "title": "Python 编程基础",
  "subtitle": "从零掌握 Python 语法与实战",
  "description": "系统学习 Python 核心语法、函数式编程、面向对象与工程实践。",
  "version": "1.0.0",
  "license": "MIT",
  "authors": ["OpenSkill Galaxy"],
  "tags": ["Python", "编程基础"],
  "estimatedHours": 30,
  "difficulty": "beginner",
  "updatedAt": "2026-11-22",
  "coverEmoji": "🐍",
  "repoUrl": "https://github.com/openskill-galaxy/module-python-basic",
  "portalUrl": "https://openskill-galaxy.github.io/modules/module-python-basic",
  "status": "stable"
}
```

## 维护模块静态数据

正式课程内容保存在各模块的 `public/data/` 下。部分仓库的 `scripts/generate-data.mjs` 是初始样本生成器，运行会覆盖同名 JSON。日常修订直接编辑数据文件，再生成搜索索引与统计。

`public/data/` 目录包含以下 12 个 JSON 文件（字段定义详见 [`DATA_QUALITY_GUIDE.md`](./DATA_QUALITY_GUIDE.md)）：

- `module.json` — 模块元信息与 `stats`
- `courses.json` — 课程列表
- `lessons.json` — 课时列表（`knowledgePoints` 必须填 `kp` ID）
- `knowledge-points.json` — 知识点
- `questions.json` — 题库（`single` / `multiple` / `judge` / `short`）
- `exams.json` — 试卷
- `cases.json` — 案例
- `routes.json` — 学习路线
- `glossary.json` — 术语表
- `faqs.json` — 常见问题
- `tags.json` — 标签
- `search-index.json` — 搜索索引（工具自动生成）

## 同步 stats、生成搜索索引与运行集中式校验

在独立模块目录运行 `node scripts/validate-data.mjs`，可离线校验本模块的引用、公开条目数和搜索索引。该脚本随模板同步。全站索引生成、跨模块校验和完整数据模式检查位于 `openskill-galaxy-tools/scripts`。

```bash
cd openskill-galaxy-tools/scripts
npm install

# 1. 重算 module.json.stats
node src/fix-stats.mjs

# 2. 生成单模块 search-index.json（或使用 optimize-pwa-and-search.mjs 全站刷新）
node src/build-search-index.mjs ../../module-xxx

# 3. 综合校验（Schema 全量 + stats 一致性 + vite base/manifest + 去重 + 13 条引用路径 + 题库审计）
node src/validate-module.mjs ../../module-xxx

# 4. 单独排查工具
node src/count-module.mjs ../../module-xxx
node src/check-duplicates.mjs ../../module-xxx
node src/check-references.mjs ../../module-xxx
node src/report-module.mjs ../../module-xxx

# 5. 安全标准化（默认建议先 --dry-run；不会盲目删改 lessons.knowledgePoints 中的名称引用）
node src/normalize-module.mjs ../../module-xxx --dry-run
```

## 本地构建与模板同步

```bash
# 单模块构建
cd module-xxx
npm install
npm run build

# 全站模板同步检查与批量构建（在 openskill-galaxy-tools/scripts 下）
node src/propagate.mjs --check
node src/buildall.mjs --include-platform
```

构建产物位于 `dist/` 目录，GitHub Pages 部署要求 Node.js 22（见 `.github/workflows/deploy.yml`）。

## 推送 GitHub Pages

1. 创建仓库并推送：

```bash
gh repo create openskill-galaxy/module-xxx --public --source=. --remote=origin --push
```

2. 在 GitHub 仓库 `Settings → Pages` 中选择 `Source → GitHub Actions`。
3. 推送到 `main` 后自动触发 `.github/workflows/deploy.yml`（详见 [`GITHUB_PAGES_DEPLOY_GUIDE.md`](./GITHUB_PAGES_DEPLOY_GUIDE.md)）。

## 接入主站 `openskill-galaxy.github.io`

1. 在 `openskill-galaxy.github.io/public/data/modules.json` 中注册新模块条目，并在 `categories.json` 确认所属分类。
2. 在 `openskill-galaxy-tools/scripts` 下运行全站聚合脚本更新主站数据：

```bash
node src/fix-stats.mjs
node src/optimize-pwa-and-search.mjs
node src/build-global-index.mjs
node src/build-health-report.mjs
```

3. 校验主站构建（`cd openskill-galaxy.github.io && npm run build`），确认无误后推送主站仓库（主站通过自身 `.github/workflows/deploy.yml` 在 GitHub Actions 自动构建发布）。

## 完整部署检查清单

- [ ] 克隆 `module-template` 到扁平目录 `module-xxx`，设置 `vite.config.ts` `base` 与 `package.json` `name`
- [ ] 生成并校验 11 个数据 JSON 与 `search-index.json`
- [ ] `node src/validate-module.mjs ../../module-xxx` 退出码为 `0`
- [ ] `node src/propagate.mjs --check` 确认模板与 CI 工作流一致
- [ ] `npm run build`（`tsc -b && vite build`）通过
- [ ] 创建 GitHub 仓库并开启 GitHub Pages（GitHub Actions 模式），确认部署 HTTP 200
- [ ] 注册到 `openskill-galaxy.github.io/public/data/modules.json` 并刷新 `global-search-index.json`、`platform-stats.json` 与 `site-health-report.{json,md}`
