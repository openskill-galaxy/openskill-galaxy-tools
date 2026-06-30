# OpenSkill Galaxy Tools

OpenSkill Galaxy 项目公共工具仓库，包含模块的提示词、数据校验脚本和文档。

## 仓库用途

- **scripts/** — 模块数据校验、搜索索引生成、质量报告工具集
- **prompts/** — 各阶段开发提示词模板
- **docs/** — 项目总体文档
- **generated-assets/** — 自动生成资源索引

## 如何使用 scripts 工具校验模块

```bash
cd scripts
npm install

# 统计模块数据规模
node src/count-module.mjs ../03-modules/module-digital-logic

# 综合校验
node src/validate-module.mjs ../03-modules/module-digital-logic

# 标准化 JSON 格式
node src/normalize-module.mjs ../03-modules/module-digital-logic
```

## 如何生成搜索索引

```bash
cd scripts
node src/build-search-index.mjs ../03-modules/module-digital-logic
```

输出到模块的 `public/data/search-index.json`。

## 如何生成质量报告

```bash
cd scripts
node src/report-module.mjs ../03-modules/module-digital-logic
```

输出到模块的 `reports/module-quality-report.md`。

## 如何维护 prompts

`prompts/` 目录存放各阶段开发的系统提示词，用于 AI 辅助开发和内容生成。
每个提示词按阶段编号命名，例如 `phase-8-prompt.md`。

## 如何维护 docs

`docs/` 目录存放项目级说明文档：
- 模块开发工作流
- 数据质量规范
- GitHub Pages 部署指南

## 如何配合 module-template 创建新模块

1. 克隆 `openskill-galaxy/module-template` 到 `03-modules/module-xxx`
2. 修改 `vite.config.ts` 中的 `base` 为 `/module-xxx/`
3. 生成模块 JSON 数据到 `public/data/`
4. 使用本仓库 scripts 工具校验：`validate-module.mjs`
5. 构建测试：`npm run build`
6. 推送到 `openskill-galaxy/module-xxx`
7. 在 `01-portal` 中添加模块入口
