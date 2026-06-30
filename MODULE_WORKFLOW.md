# OpenSkill Galaxy 模块开发工作流

## 从 module-template 创建新模块

1. 克隆模板：

```bash
git clone https://github.com/openskill-galaxy/module-template.git 03-modules/module-xxx
cd 03-modules/module-xxx
```

2. 修改 `vite.config.ts` 中的 `base`：

```ts
// 例如 Python 基础模块
base: "/module-python-basic/"
```

3. 修改 `package.json` 中的 `name`：

```json
"name": "openskill-module-python-basic"
```

4. 修改 `index.html` 中的 `<title>`。

5. 修改 `public/data/module.json`：

```json
{
  "id": "module-python-basic",
  "title": "Python 编程基础",
  "slug": "module-python-basic"
}
```

## 如何生成模块静态数据

`public/data/` 目录包含以下 JSON 文件：

- `module.json` — 模块元信息
- `courses.json` — 课程列表
- `lessons.json` — 课时列表
- `knowledge-points.json` — 知识点
- `questions.json` — 题库
- `exams.json` — 试卷
- `cases.json` — 案例
- `routes.json` — 自定义路由
- `glossary.json` — 术语表
- `faqs.json` — 常见问题
- `tags.json` — 标签

## 如何运行校验工具

```bash
cd 05-scripts
npm install

# 综合校验（推荐）
node src/validate-module.mjs ../03-modules/module-xxx

# 单独检查
node src/count-module.mjs ../03-modules/module-xxx
node src/check-duplicates.mjs ../03-modules/module-xxx
node src/check-references.mjs ../03-modules/module-xxx

# 标准化（修复 JSON 格式）
node src/normalize-module.mjs ../03-modules/module-xxx

# 生成搜索索引
node src/build-search-index.mjs ../03-modules/module-xxx

# 生成质量报告
node src/report-module.mjs ../03-modules/module-xxx
```

每个模块也可以在 `scripts/validate-data.mjs` 中定义独立的 CI 校验。

## 如何构建

```bash
cd 03-modules/module-xxx
npm install
npm run build
```

构建产物在 `dist/` 目录。

## 如何推送 GitHub Pages

1. 创建仓库：

```bash
gh repo create openskill-galaxy/module-xxx --public --source=. --remote=origin --push
```

2. 手动在 GitHub 仓库 Settings → Pages 中选择 Source → GitHub Actions。

3. 推送后自动触发 `.github/workflows/deploy.yml`。

## 如何把模块加入 01-portal

1. 修改 `01-portal/public/data/modules.json`，添加新模块条目。
2. 在 `01-portal/public/data/categories.json` 中确认分类。
3. 重新构建并推送 `01-portal`。

## 完整部署检查清单

- [ ] 克隆模板，修改 base
- [ ] 生成 JSON 数据
- [ ] 运行 `validate-module.mjs` 通过
- [ ] 运行 `npm run build` 通过
- [ ] 创建 GitHub 仓库并推送
- [ ] 开启 GitHub Pages（Actions 模式）
- [ ] 等待部署成功（HTTP 200）
- [ ] 加入 01-portal 首页
