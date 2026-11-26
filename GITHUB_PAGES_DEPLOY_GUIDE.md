# OpenSkill Galaxy GitHub Pages 部署指南

## 仓库类型

OpenSkill Galaxy 使用两种 GitHub Pages 站点类型，托管于同一域名 `https://openskill-galaxy.github.io` 下：

### 1. 组织首页站点（Portal）

- **仓库名**: `openskill-galaxy/openskill-galaxy.github.io`
- **访问地址**: `https://openskill-galaxy.github.io/`
- **vite.config.ts `base`**: `"/"`
- **部署触发**: 主站现有工作流在推送到 `main` 或手动触发时运行；上传前会校验主站构建目录的统计、目录、健康报告及全站索引。
- **作用**: 总入口主站，聚合模块目录、学习路径、全局搜索与全站健康报告

### 2. 项目模块站点（60 个模块 + 模板）

- **仓库名**: `openskill-galaxy/module-xxx`
- **访问地址**: `https://openskill-galaxy.github.io/module-xxx/`
- **vite.config.ts `base`**: `"/module-xxx/"`
- **部署触发**: `.github/workflows/deploy.yml` + Pages `Build and deployment → Source → GitHub Actions`
- **作用**: 各学习模块独立 SPA 站点

---

## `vite.config.ts` 中 `base` 的配置契约

```ts
// 组织首页 (openskill-galaxy.github.io)
export default defineConfig({
  base: "/",
  ...
});

// 项目模块 (module-digital-logic)
export default defineConfig({
  base: "/module-digital-logic/",
  ...
});
```

> **关键**: 如果 `base` 设置错误，静态资源 JS/CSS 路径与深链路由将失效，导致页面白屏或 404。可通过 `node src/validate-module.mjs <module-path>` 自动校对 `base` 与 `slug` 是否一致。

---

## GitHub Actions Pages 部署配置（Node.js 22）

### 模块标准 `.github/workflows/deploy.yml`

以下为模板与学习模块使用的流程。主站单独维护自己的工作流，启用 npm 缓存并在构建后校验发布数据。

```yaml
name: Build and Deploy

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm install

      - name: Build site
        run: npm run build

      - name: Configure GitHub Pages
        if: github.ref == 'refs/heads/main'
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        if: github.ref == 'refs/heads/main'
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    if: github.ref == 'refs/heads/main'
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> 使用 `node src/propagate.mjs` 可将 `module-template/.github/workflows/deploy.yml` 同步至所有 60 个模块。

---

## 多仓发布时核验内容数据

主站、模板、工具和 60 个模块共 63 个独立仓库。挑选本次要发布的更改，确认各仓候选提交和部署分支。若工作区已有其他未提交更改，在干净的候选检出目录重现这一组提交；文档中的校验命令只读取数据，不会提交、推送或触发 Pages。

以下命令以工作区根目录为起点，使用 Node.js 22 或更新版本。

1. **核验本次构建。** 按内容维护流程重算受影响模块的统计、搜索索引和主站汇总，在候选工作区构建主站及模块。运行以下两项检查。第一项与主站工作流使用同一代码，只需要主站构建。第二项还会逐文件核对本地 `dist/data` 和 `public/data`，独立清点全部目录内容。

   ```sh
   node openskill-galaxy.github.io/scripts/check-release-data.mjs openskill-galaxy.github.io/dist/data
   node openskill-galaxy-tools/scripts/src/verify-catalog.mjs local
   ```

2. **按依赖顺序发布。** 保留原有用户数据格式、公开 ID 和链接。若本次涉及共享模板或工具，先确认各模块已包含所需修改，再发布受影响模块的候选提交。等待相应 Pages 工作流完成。此时在线主站仍可能显示旧汇总，用候选主站校验上线模块。加 `--expect-dist` 会进一步核对读到的模块数据与本地候选数据逐文件一致，能发现数量、ID 相同而正文仍是上一版的情况。

   ```sh
   node openskill-galaxy-tools/scripts/src/verify-catalog.mjs staged --expect-dist
   ```

3. **发布主站并复核线上结果。** 在候选主站与上线模块一致后，按原有流程发布主站。在对应 Pages 部署完成后，检查浏览器实际可取得的主站及模块 JSON。下列命令覆盖主站四项数据和所有模块的元数据及十一项内容/索引数组。代码与离线能力还应通过实际课程入口、练习和离线浏览验收。

   ```sh
   node openskill-galaxy-tools/scripts/src/verify-catalog.mjs live --expect-dist
   ```

独立排查线上汇总时，运行 `node openskill-galaxy-tools/scripts/src/verify-catalog.mjs live` 即可，无需拥有各模块的本地构建。镜像可通过 `--origin` 指定同样组织方式的站点根地址。用 `--json` 取得每项指标的有效模块数、全部差异和错误来源。默认同时清点 6 个模块，单次读取最多等待 15 秒；临时网络错误最多重试一次。可通过 `--concurrency` 与 `--timeout-ms` 调整。

- 退出码 **0** 表示本次核验范围内一致。退出码 **1** 表示已读数据存在差异。退出码 **2** 表示部分证据缺失、格式有误或参数有误；已经确认的差异仍列在输出中，受影响汇总的实际值为 `null`。
- 十类内容统一按已发布记录计数，`editorialStatus: "draft"` 的条目保留旧链接并排除在公开数量之外。旧条目没有该标记时按已发布清点。已提供的 `lessonMinutes` 对照公开讲义时长，已声明讲义分钟数的目录还逐节核验搜索索引中的估时，旧版 `estimatedHours` 不参与换算。
- `totalSearchIndexEntries` 来自各模块自己的 `search-index.json` 行数。主站 `global-search-index.json` 则按模块、类型、ID 和链接标识逐项核对公开课时与题目；两类索引有不同用途和计数口径。
- `staged` 与 `live` 读取各文件的时间可能跨越一次正在进行的 Pages 发布。若发现差异，结合逐文件错误与部署状态判断，在相关版本可访问后重跑。只读检查不会改动任何站点。

## SPA 404 路由恢复与跨站深链契约

GitHub Pages 初次打开深层路径时会返回该站的 `public/404.html`。主站保留域名根路径（`pathSegmentsToKeep = 0`），模块保留自己的第一层目录（`pathSegmentsToKeep = 1`）。

404 页面把剩余路径、完整查询串和锚点一起编码为 `__osg_route` 参数。站点首页在 React 挂载前用 `history.replaceState` 还原地址。主站搜索生成的 `?page=%2Flessons%2F…` 深链和原有书签仍可使用。

## Service Worker 与离线缓存

生产构建时，Vite 将页面入口、分包和内容 JSON 的清单与内容摘要写入 `dist/sw.js`。主站在 `/sw.js` 注册，模块在自己的 `/<slug>/sw.js` 注册。

首次联网打开某个站点后，浏览器会缓存该站的完整版本。安装完成后可断网打开该站尚未访问过的课程或功能。每个模块单独下载。若新版本下载中断，既有版本仍可使用。构建内容变化会自动更新摘要；用户已经打开的页面仍可读取上一版本的脚本分包。

### 2. `public/manifest.json` 与同源存储隔离

- 由于主站与 60 个模块共用同源域名 `https://openskill-galaxy.github.io`，每个模块必须配置独立的 PWA 作用域：
  - `"start_url": "/<slug>/"`
  - `"scope": "/<slug>/"`
- 模块客户端的 `localStorage` 持久化键同样必须按模块 `BASE_URL` / `slug` 命名空间隔离（如 `osg:<slug>:`），避免不同模块之间互相覆盖进度、收藏或错题本，且禁止调用全局 `localStorage.clear()`。

---

## 如何开启 Pages

### 方法一：GitHub CLI（Bash / zsh）

```bash
# 创建 Pages 站点
gh api -X POST repos/openskill-galaxy/module-xxx/pages -f build_type=workflow

# 如果已存在，改为 PUT
gh api -X PUT repos/openskill-galaxy/module-xxx/pages -f build_type=workflow
```

### 方法二：手动操作

1. 进入 GitHub 仓库 → `Settings → Pages`
2. `Build and deployment → Source` 选择 **GitHub Actions**

---

## 常见故障排查

| 现象 | 常见原因 | 修复方式 |
|------|----------|----------|
| 页面白屏 / 资源 404 | `vite.config.ts` 中 `base` 未设为 `"/<slug>/"` | 修正 `base` 并运行 `validate-module.mjs` 验证 |
| 直接刷新子路由 404 | `public/404.html` 缺失或 `pathSegmentsToKeep` 不为 `1` | 通过 `propagate.mjs` 同步模板 `public/404.html` |
| PWA 安装冲突或打开错误模块 | `manifest.json` `start_url`/`scope` 仍为 `"."` | 运行 `optimize-pwa-and-search.mjs` 个性化 manifest |
| `pull_request` 报部署权限错 | `configure-pages` / `deploy` 缺少 `if: github.ref == 'refs/heads/main'` | 通过 `propagate.mjs` 同步 `.github/workflows/deploy.yml` |
| SW 注册在深链报错 | 使用了 `'./sw.js'` 相对路径 | 改为基于 `BASE_URL` / `/sw.js` 的注册路径 |

---

## 检查部署状态

### GitHub CLI（Bash / zsh）

```bash
# 查看最近工作流运行
gh run list --repo openskill-galaxy/module-xxx --limit 5

# 实时跟踪当前运行
gh run watch --repo openskill-galaxy/module-xxx

# 查看 Pages 配置
gh api repos/openskill-galaxy/module-xxx/pages
```

### HTTP 状态验证（Bash / zsh）

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://openskill-galaxy.github.io/module-xxx/
# 返回 200 表示部署成功
```

*(Windows PowerShell 用户请使用 `Invoke-WebRequest -UseBasicParsing https://openskill-galaxy.github.io/module-xxx/ | Select-Object StatusCode`，因 PowerShell 默认将 `curl` 映射为 `Invoke-WebRequest` 别名，不支持 `-s -o -w` 参数。)*
