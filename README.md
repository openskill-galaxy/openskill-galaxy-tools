# OpenSkill Galaxy Tools

维护开放技能星河主站、模块模板和 60 个模块的公共工具。使用 Node.js 22，按发布顺序核对本地、已上线模块和最终主站。

## 仓库结构

- **`scripts/`** — 跨平台（macOS / Linux / Windows，Node.js 22+ ESM）数据校验、搜索索引、模板同步、健康报告与构建脚本
- **`DATA_QUALITY_GUIDE.md`** — 模块 JSON 数据契约与引用完整性规范
- **`MODULE_WORKFLOW.md`** — 新建与维护学习模块的完整工作流
- **`GITHUB_PAGES_DEPLOY_GUIDE.md`** — GitHub Pages、SPA 路由恢复、Service Worker 与 PWA 清单部署规范
- [学习者需求与产品覆盖调查](docs/LEARNER_NEEDS_REVIEW_2026-11.md) — 国内外对照、公开题量核查、已验收功能与待验证需求
- [浏览器与工具回归](e2e/README.md) — 使用 Playwright WebKit 复验学习流程、窄屏、主题和离线能力。

## 工作区路径自动识别

所有脚本均通过 `scripts/src/utils/workspace.mjs` 自动识别工作区根目录，默认采用 **63 仓扁平多仓目录**：
- `<root>/openskill-galaxy.github.io`（主入口 Portal）
- `<root>/module-template`（模块模板）
- `<root>/openskill-galaxy-tools`（本工具仓）
- `<root>/module-*`（60 个学习模块）

同时也向后兼容旧版分组子目录（`<root>/00-平台与协作/...`）。如需显式指定根目录，可设置环境变量 `OSG_ROOT=/path/to/openskill-galaxy`。

## 常用脚本命令

```bash
cd scripts
npm install

# 1. 单模块或全量校验（支持 --all / --include-template / --json）
node src/count-module.mjs ../../module-digital-logic
node src/validate-module.mjs ../../module-digital-logic
node src/validate-module.mjs --all
node src/check-duplicates.mjs --all
node src/check-references.mjs --all
node src/audit-questions.mjs

# 2. npm run 快捷命令（透传参数需加 --）
npm run validate -- ../../module-digital-logic
npm run references -- --all
npm run duplicates -- --all

# 3. 搜索索引与 PWA 优化
node src/build-search-index.mjs ../../module-digital-logic
node src/optimize-pwa-and-search.mjs --dry-run --bump-sw

# 4. 全站统计、全局索引与健康报告
node src/fix-stats.mjs
node src/build-global-index.mjs
node src/build-health-report.mjs
# 核对已构建的主站与各模块数据；线上只读核验使用 live
node src/verify-catalog.mjs local
node src/verify-catalog.mjs live

# 5. 依赖安装、批量构建与模板同步
node src/install-all.mjs --include-platform --dry-run
node src/buildall.mjs --include-platform --dry-run
node src/propagate.mjs --check
node src/propagate.mjs --dry-run

# 6. 批量 Git 推送（默认拒绝直接执行，需 --dry-run 或显式 --confirm）
node src/git-push-all.mjs --dry-run
node src/git-push-all.mjs --confirm --no-push --message "chore: sync updates"
```

更多脚本参数与废弃脚本说明请参见 [`scripts/README.md`](./scripts/README.md)。

## 如何配合 module-template 创建新模块

1. 克隆 `openskill-galaxy/module-template` 到扁平目录 `<root>/module-xxx`
2. 修改 `vite.config.ts` 中的 `base` 为 `"/module-xxx/"`
3. 修改 `package.json` 中的 `"name": "openskill-module-xxx"`
4. 更新 `index.html` 的 `<title>`、`<meta name="description">` 与 `<meta property="og:title">` / `og:description`
5. 更新 `public/manifest.json`（`short_name`、`name`、`description`、`start_url: "/module-xxx/"`、`scope: "/module-xxx/"`）
6. 生成模块 JSON 数据到 `public/data/`，完善 `public/data/module.json`（`"id": "mod-xxx"`、`"slug": "module-xxx"`、`repoUrl`、`portalUrl`）并通过 `fix-stats.mjs` 同步 `stats`
7. 运行 `validate-module.mjs ../../module-xxx`、`optimize-pwa-and-search.mjs`（或 `build-search-index.mjs`）和 `npm run build`
8. 推送到 `openskill-galaxy/module-xxx` 并开启 GitHub Pages（GitHub Actions 模式）
9. 在 `openskill-galaxy.github.io/public/data/modules.json` 中注册条目，并运行 `fix-stats.mjs`、`build-global-index.mjs` 与 `build-health-report.mjs` 刷新主站聚合数据
