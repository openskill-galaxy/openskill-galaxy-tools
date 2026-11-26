# OpenSkill Galaxy — Scripts 工具集文档

本目录提供面向 **63 仓扁平工作区**（`openskill-galaxy.github.io`、`module-template`、`openskill-galaxy-tools`、`module-*`）的数据校验、题库审计、搜索索引、PWA 优化、模板同步、批量构建与全站健康报告脚本（Node.js 22+ ESM）。

所有脚本通过 `src/utils/workspace.mjs` 自动识别工作区根目录，也支持通过环境变量 `OSG_ROOT=/path/to/openskill-galaxy` 显式覆盖。

## 安装依赖

```bash
cd openskill-galaxy-tools/scripts
npm install
```

## 工具一览

### 1. 单模块 / 全量校验与报告

| 脚本 | 功能 | 用法 |
|------|------|------|
| `count-module.mjs` | 统计模块各 JSON 数量、题型分布、难度分布与最大文件体积 | `node src/count-module.mjs ../../module-digital-logic` |
| `check-duplicates.mjs` | 检查 10 个文件的 `id` 唯一性及 7 个可路由文件的 `slug` 唯一性（发现阻断重复退出 `1`） | `node src/check-duplicates.mjs <module-path> \| --all [--include-template] [--strict-tags] [--json]` |
| `check-references.mjs` | 检查全部 13 条跨文件引用路径及双向课程-课时一致性（发现缺失引用退出 `1`） | `node src/check-references.mjs <module-path> \| --all [--include-template] [--json]` |
| `validate-module.mjs` | 综合校验：`module.json`（`ModuleMetaSchema` + `stats`）、全量条目 Zod Schema、`vite.config.ts` `base`、`manifest.json`、`search-index.json`、去重、引用与题库审计（失败退出 `1`） | `node src/validate-module.mjs <module-path> \| --all [--include-template] [--strict-tags] [--allow-missing-search-index] [--json]` |
| `audit-questions.mjs` | 全量审计所有模块的题库选项键、答案合法性、解析完整性与试卷引题（发现问题退出 `1`） | `node src/audit-questions.mjs [--include-template] [--json]` |
| `audit-and-fix-content.mjs` | 内容深度审计（默认只读审计，发现问题退出 `1`；传入 `--fix` 仅安全修正非法难度字段） | `node src/audit-and-fix-content.mjs [<module-path>] [--include-template] [--fix]` |
| `normalize-module.mjs` | 标准化模块字段；自动尝试按标题/slug 映射 `lessons.knowledgePoints`（默认保留未匹配项，仅传 `--prune-refs` 时裁剪） | `node src/normalize-module.mjs <module-path> [--dry-run] [--prune-refs] [--fill-source-type]` |
| `report-module.mjs` | 生成单模块 `reports/module-quality-report.md` | `node src/report-module.mjs <module-path> [--dry-run]` |

### 2. 搜索索引、PWA、统计与健康报告

| 脚本 | 功能 | 用法 |
|------|------|------|
| `build-search-index.mjs` | 基于 `utils/search-index.mjs` 生成与前端 `search.ts` 路由一致的压缩单行 `search-index.json` | `node src/build-search-index.mjs <module-path> \| --all [--include-template] [--dry-run] [--pretty]` |
| `optimize-pwa-and-search.mjs` | 批量重建模块 `search-index.json`、个性化 `manifest.json` 并按需递增 `sw.js` 缓存版本号 | `node src/optimize-pwa-and-search.mjs [--dry-run] [--include-template] [--bump-sw] [--sw-version <N>]` |
| `fix-stats.mjs` | 根据实际 JSON 条数重算 `module.json.stats` 并清理主站 `modules.json` 冗余体量描述 | `node src/fix-stats.mjs [--dry-run]` |
| `build-global-index.mjs` | 聚合全站课程课时与题目生成主站 `global-search-index.json`（默认压缩 JSON） | `node src/build-global-index.mjs [--pretty] [--dry-run] [--output <path>]` |
| `build-health-report.mjs` | 聚合全站统计与真实校验（Schema/引用/去重/题库/配置）生成 `platform-stats.json` 与 `site-health-report.{json,md}` | `node src/build-health-report.mjs [--dry-run] [--output <dir>] [--strict]` |

### 3. 依赖安装、批量构建、模板同步与工程管理

| 脚本 | 功能 | 用法 |
|------|------|------|
| `install-all.mjs` | 并发检查并安装各仓 `node_modules`（任一失败退出 `1`） | `node src/install-all.mjs [--include-platform] [--only <modules\|portal\|template\|tools>] [--force] [--dry-run] [--concurrency <n>]` |
| `buildall.mjs` | 并发运行 `npm run build` 构建模块及平台项目（失败输出完整日志并退出 `1`） | `node src/buildall.mjs [--include-platform] [--concurrency <n>] [--filter <substr>] [--dry-run]` |
| `propagate.mjs` | 同步 `module-template` 的 `src/`（保留 4 个模块专属文件）、配置、`.github/workflows/deploy.yml` 及 SEO 元数据 | `node src/propagate.mjs [--dry-run] [--check]` |
| `cli-manage.mjs` | 统一工程维护入口（`sync` / `audit` / `build-portal` / `build-all` / `push`） | `node src/cli-manage.mjs <command> [options]` |
| `build-changelog.mjs` | 根据 `module-template` 提交历史生成工具仓 `CHANGELOG.md` | `node src/build-changelog.mjs [--output <path>] [--dry-run]` |
| `git-push-all.mjs` | 扫描所有本地 Git 仓变更并批量提交推送（无 `--dry-run` 时必须显式传入 `--confirm`） | `node src/git-push-all.mjs --dry-run` / `--confirm [--no-push] [--message "..."]` |

### 4. `package.json` 快捷脚本

```bash
npm run count -- ../../module-digital-logic
npm run duplicates -- ../../module-digital-logic
npm run references -- ../../module-digital-logic
npm run validate -- ../../module-digital-logic
npm run normalize -- ../../module-digital-logic --dry-run
npm run search-index -- ../../module-digital-logic
npm run report -- ../../module-digital-logic
```

### 5. 已废弃 / 危险历史脚本（日常请勿使用）

- `propagate-styles.mjs` — 已废弃的旧版包装脚本，现仅转发调用 `propagate.mjs`。
- `enrich-all-modules.mjs` — **破坏性历史脚本**（会用样板数据覆盖模块课程/课时/题库），未传入 `--confirm-overwrite` 时拒绝运行并退出 `1`。
- `migrate-all-modules.mjs` — **破坏性历史脚本**（会写入旧版双字段与不兼容 `search-index.json`），未传入 `--confirm-overwrite` 时拒绝运行并退出 `1`。
