# OpenSkill Galaxy — Module Data Quality Tools

工具链用于检查、修复、统计和索引 OpenSkill Galaxy 模块的静态 JSON 数据。

## 工具列表

| 脚本 | 功能 | 命令 |
|------|------|------|
| `count-module.mjs` | 统计模块数据规模 | `node src/count-module.mjs <module-path>` |
| `check-duplicates.mjs` | 检查重复 id | `node src/check-duplicates.mjs <module-path>` |
| `check-references.mjs` | 检查跨文件引用完整性 | `node src/check-references.mjs <module-path>` |
| `validate-module.mjs` | 综合校验 | `node src/validate-module.mjs <module-path>` |
| `normalize-module.mjs` | 标准化 JSON | `node src/normalize-module.mjs <module-path>` |
| `build-search-index.mjs` | 生成搜索索引 | `node src/build-search-index.mjs <module-path>` |
| `report-module.mjs` | 生成质量报告 | `node src/report-module.mjs <module-path>` |

## 使用方法

```bash
cd 05-scripts
npm install

# 对任意模块执行校验
node src/validate-module.mjs ../03-modules/module-digital-logic

# 生成搜索索引
node src/build-search-index.mjs ../03-modules/module-digital-logic

# 生成质量报告
node src/report-module.mjs ../03-modules/module-digital-logic
```

## 适配新模块

本工具链是通用的，只要模块的 `public/data/` 目录包含标准 JSON 文件即可使用。
