# OpenSkill Galaxy GitHub Pages 部署指南

## 仓库类型

OpenSkill Galaxy 使用两种 Pages 站点类型：

### 组织首页站点

- **仓库名**: `openskill-galaxy/openskill-galaxy.github.io`
- **访问地址**: `https://openskill-galaxy.github.io/`
- **vite.config.ts base**: `base: "/"`
- **部署**: 推送到 `main` 分支即触发
- **作用**: 总入口站，聚合所有模块链接

### 项目站点

- **仓库名**: `openskill-galaxy/module-xxx`
- **访问地址**: `https://openskill-galaxy.github.io/module-xxx/`
- **vite.config.ts base**: `base: "/module-xxx/"`
- **部署**: `.github/workflows/deploy.yml` + Pages 设为 Actions 模式
- **作用**: 各学习模块独立站点

---

## vite.config.ts 中 base 的区别

```ts
// 组织首页
export default defineConfig({
  base: "/",
  ...
})

// 项目模块
export default defineConfig({
  base: "/module-digital-logic/",
  ...
})
```

> **关键**: 如果 base 设置错误，静态资源的路径会不正确，导致页面空白或 404。

---

## GitHub Actions Pages 部署

### 配置文件

位置：`.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 如何开启 Pages

### 方法一：GitHub CLI

```powershell
# 创建 Pages 站点
gh api -X POST repos/openskill-galaxy/module-xxx/pages -f build_type=workflow

# 如果已存在，改为 PUT
gh api -X PUT repos/openskill-galaxy/module-xxx/pages -f build_type=workflow
```

### 方法二：手动操作

1. 进入 GitHub 仓库
2. Settings → Pages
3. Build and deployment → Source → **GitHub Actions**
4. 不需要设置分支，使用 Actions 配置

---

## 常见错误

### 1. 页面空白（白屏）

**原因**: `vite.config.ts` 中 `base` 设置错误。

**修复**: 项目模块应使用 `base: "/module-xxx/"`，注意首尾都有 `/`。

### 2. 资源 404

**原因**: base 路径不匹配，CSS/JS 加载路径错误。

**修复**: 检查 `dist/index.html` 中资源路径前缀，确保与 base 一致。

### 3. Pages 部署失败

**原因**: 
- Actions 配置没有 `permissions`
- `upload-pages-artifact` 的 `path` 不是 `./dist`
- 缺少 `actions/configure-pages@v5`

**修复**: 按照上方 deploy.yml 模板配置。

### 4. 推送后没有触发 Actions

**原因**: 
- 分支名不是 `main`
- Actions 被禁用
- `.github/workflows/` 路径大小写错误

**修复**: 确认分支名和目录结构。

### 5. workflow dispatch 没有 build 选项

**原因**: 没有添加 workflow_dispatch 事件。

**修复**: 在 `on:` 中添加 `workflow_dispatch:`。

---

## 如何检查部署状态

### 用 GitHub CLI

```powershell
# 查看最近运行
gh run list --repo openskill-galaxy/module-xxx --limit 5

# 等待当前运行完成
gh run watch --repo openskill-galaxy/module-xxx

# 查看 Pages 信息
gh api repos/openskill-galaxy/module-xxx/pages
```

### 手动检查

1. GitHub 仓库 → Actions 标签页
2. 点击最新工作流运行
3. 查看 build 和 deploy job 日志
4. 部署成功后，访问 `https://openskill-galaxy.github.io/module-xxx/`

### HTTP 状态验证

```powershell
curl -s -o /dev/null -w "%{http_code}" https://openskill-galaxy.github.io/module-xxx/
# 返回 200 表示部署成功
```
