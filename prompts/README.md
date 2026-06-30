# Prompts

此目录存放 OpenSkill Galaxy 各阶段开发使用的 AI 辅助提示词模板。

## 目录结构建议

```
prompts/
├── README.md               本说明文件
├── phase-1-portal.md       阶段 1: 总入口站
├── phase-2-template.md     阶段 2: 模块模板
├── phase-3-module.md       阶段 3: 模块创建
├── phase-5-expand.md       阶段 5: 内容扩充
├── phase-6-toolchain.md    阶段 6: 质量工具链
├── phase-7-lessons.md      阶段 7: 课程/搜索/CI
├── phase-8-question-bank.md 阶段 8: 题库扩充
└── phase-9-xxx.md          后续阶段
```

## 使用方式

每个提示词包含：
- 当前阶段目标
- 数据规范说明
- 命令执行步骤
- 校验要求

在 AI 对话开始时粘贴对应阶段的提示词，AI 将按照指定步骤执行。
