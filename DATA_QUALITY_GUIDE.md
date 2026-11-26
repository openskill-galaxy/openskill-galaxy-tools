# OpenSkill Galaxy 数据质量规范

本规范与 `scripts/src/schemas/module-schema.mjs`、`module-template/src/types.ts`、`module-template/src/data/loaders.ts` 及校验脚本保持严格一致。

## 模块数据文件结构

```text
public/data/
├── module.json             模块元信息与统计
├── courses.json            课程列表
├── lessons.json            课时列表
├── knowledge-points.json   知识点
├── questions.json          题库
├── exams.json              试卷
├── cases.json              实战案例
├── routes.json             学习路线
├── glossary.json           术语表
├── faqs.json               常见问题
├── tags.json               标签
└── search-index.json       搜索索引（工具自动生成，压缩单行 JSON）
```

---

## 各文件字段规范

知识点、案例、术语、FAQ 和标签可使用 `"editorialStatus": "draft"` 标记修订中的记录。保留原 ID 与链接，正常浏览、搜索和数量统计只包含公开条目。核对数据时应同时检查课程入口和历史收藏能否打开。

### module.json

由 `ModuleMetaSchema` 校验，`slug` 必须与仓库目录名一致，`stats` 必须与 10 个数据文件的公开条目数一致：

```json
{
  "id": "mod-digital-logic",
  "slug": "module-digital-logic",
  "title": "数字逻辑基础",
  "subtitle": "从布尔代数到时序电路",
  "description": "系统学习数字电路的组合逻辑、时序逻辑与状态机设计。",
  "version": "1.0.0",
  "license": "MIT",
  "authors": ["OpenSkill Galaxy"],
  "tags": ["数字逻辑", "硬件基础"],
  "estimatedHours": 24,
  "difficulty": "beginner",
  "updatedAt": "2026-11-21",
  "coverEmoji": "🔌",
  "repoUrl": "https://github.com/openskill-galaxy/module-digital-logic",
  "portalUrl": "https://openskill-galaxy.github.io/modules/module-digital-logic",
  "status": "stable",
  "stats": {
    "courses": 4,
    "lessons": 8,
    "knowledgePoints": 45,
    "questions": 24,
    "cases": 12,
    "exams": 3,
    "routes": 2,
    "glossary": 30,
    "faqs": 15,
    "tags": 20
  }
}
```

- `difficulty` 允许值：`beginner` | `intermediate` | `advanced` | `easy` | `medium` | `hard`
- `status` 可选值：`stable` | `beta` | `draft` | `archived`
- `repoUrl`、`portalUrl` 为可选 URL 字段

### courses.json

```json
{
  "id": "mod-digital-logic-c-1",
  "slug": "number-systems-and-codes",
  "title": "数制与编码",
  "summary": "学习二进制、八进制、十六进制及其转换。",
  "order": 1,
  "difficulty": "easy",
  "estimatedHours": 4,
  "lessons": ["mod-digital-logic-l-1", "mod-digital-logic-l-2"],
  "tags": ["数制", "编码"]
}
```

- 必填字段：`id`、`slug`（非空）、`title`、`summary`、`difficulty`（`easy` | `medium` | `hard`）、`tags`、`estimatedHours`（> 0）、`lessons`（课时 ID 数组）、`order`。
- 注意：使用 `summary` 与 `lessons`，**不要**使用旧字段 `description` 或 `lessonIds`。

### lessons.json

```json
{
  "id": "mod-digital-logic-l-1",
  "slug": "binary-decimal-conversion",
  "courseId": "mod-digital-logic-c-1",
  "title": "二进制与十进制转换",
  "summary": "掌握二进制数位权展开与短除法转换。",
  "order": 1,
  "contentMarkdown": "## 二进制\n\n二进制是计算机中最基础的数制...",
  "knowledgePoints": ["kp-1", "kp-2"],
  "estimatedMinutes": 45
}
```

- 必填字段：`id`、`slug`（非空）、`courseId`（必须存在于 `courses.json`）、`title`、`summary`、`order`、`contentMarkdown`、`knowledgePoints`、`estimatedMinutes`（> 0）。
- **重要约束**：`knowledgePoints` 数组**必须填 `knowledge-points.json` 中的有效 `.id`**（如 `"kp-1"`），严禁填写中文展示名（如 `"二进制"`），否则 `LessonPage.tsx` 无法关联知识点且 `check-references.mjs` 会报错。

### knowledge-points.json

```json
{
  "id": "kp-1",
  "slug": "binary-number-system",
  "title": "二进制数制",
  "summary": "二进制是计算机基础数制。",
  "courseId": "mod-digital-logic-c-1",
  "tags": ["数制"],
  "difficulty": "easy",
  "contentMarkdown": "## 二进制\n\n二进制由 0 和 1 组成...",
  "relatedQuestions": ["mod-digital-logic-q-1"],
  "relatedCases": ["case-1"],
  "glossary": ["g-1"]
}
```

- 必填字段：`id`、`slug`（非空且路由内唯一，建议使用 URL 安全的英文 slug）、`title`、`summary`、`tags`、`difficulty`（`easy` | `medium` | `hard`）、`contentMarkdown`、`relatedQuestions`、`relatedCases`、`glossary`。
- `courseId` 为可选字段；如果填写，必须存在于 `courses.json`。

### questions.json

```json
{
  "id": "mod-digital-logic-q-1",
  "slug": "q-binary-10",
  "type": "single",
  "difficulty": "easy",
  "chapter": "mod-digital-logic-c-1",
  "knowledge_points": ["kp-1"],
  "stem": "十进制数 10 对应的二进制是？",
  "options": [
    { "key": "A", "text": "1010" },
    { "key": "B", "text": "1001" },
    { "key": "C", "text": "1100" },
    { "key": "D", "text": "1011" }
  ],
  "answer": ["A"],
  "explanation": "10 ÷ 2 = 5 余 0，依次除 2 取余逆序排列得到 1010。",
  "wrong_reason": {
    "B": "余数顺序混淆",
    "C": "高位权值计算错误",
    "D": "末位余数有误"
  },
  "related_questions": ["mod-digital-logic-q-2"],
  "tags": ["数制转换"],
  "estimated_time": 2,
  "source_type": "curated-generated"
}
```

**题型 (`type`) 规范：**
- **Schema 与模板 UI 均完整支持（生产推荐）**：
  - `single` — 单选题：`options` 至少 2 项（结构为 `{ "key": "A", "text": "..." }`），`answer` 为长度为 1 的字符串数组（如 `["A"]`）且必须匹配 `options[].key`
  - `multiple` — 多选题：`options` 至少 2 项，`answer` 为非空字符串数组（如 `["A", "B"]`）且每项匹配 `options[].key`
  - `judge` — 判断题：`options` 为 `[]`，`answer` 必须为 `["T"]` 或 `["F"]`
  - `short` — 简答题：`options` 为 `[]`，`answer` 为非空字符串数组（参考答案要点）
- **仅 Zod Schema 预留（通用模板 `QuestionPlayer.tsx` 尚未提供专用交互控件，若使用会由 `audit-questions.mjs` 给出提示）**：
  - `fill`、`calculation`、`case_analysis`

**其他约束：**
- `slug` 必填且非空；`explanation` 必填且非空；`estimated_time` 必须为正数。
- `chapter` 必须匹配 `courses.json` 的 `id`（或 `lessons.json` 的 `id`）。
- `knowledge_points` 中的 ID 必须存在于 `knowledge-points.json`。
- `difficulty` 允许值：`easy` | `medium` | `hard`（建议分布：`easy` ~35%、`medium` ~45%、`hard` ~20%）。

### exams.json

```json
{
  "id": "mod-digital-logic-exam-1",
  "slug": "final-exam",
  "title": "数制与编码单元测验",
  "summary": "本章基础概念与综合应用测验。",
  "difficulty": "medium",
  "questionIds": ["mod-digital-logic-q-1", "mod-digital-logic-q-2"],
  "timeLimitMinutes": 60,
  "passingScore": 60
}
```

- 必填字段：`id`、`slug`、`title`、`summary`、`difficulty`、`questionIds`（每项必须存在于 `questions.json`）、`timeLimitMinutes`（> 0）、`passingScore`（0–100）。

### cases.json

```json
{
  "id": "case-1",
  "slug": "elevator-floor-encoding",
  "title": "电梯楼层编码设计",
  "summary": "设计 4 层电梯楼层显示与 BCD 编码逻辑。",
  "difficulty": "medium",
  "tags": ["电梯控制"],
  "backgroundMarkdown": "某大楼共 4 层...",
  "tasksMarkdown": "1. 设计楼层编码...",
  "referenceMarkdown": "参考方案使用...",
  "knowledgePoints": ["kp-1"],
  "estimatedMinutes": 30
}
```

- 必填字段：`id`、`slug`（非空且路由内唯一）、`title`、`summary`、`difficulty`、`tags`、`backgroundMarkdown`、`tasksMarkdown`、`referenceMarkdown`、`knowledgePoints`（`kp` ID 数组）、`estimatedMinutes`（> 0，单位为分钟）。

### routes.json（学习路线）

`routes.json` 用于定义模块内的**学习路线**（非前端自定义页面路由）：

```json
{
  "id": "mod-digital-logic-route-1",
  "slug": "foundations-path",
  "title": "数字逻辑基础入门路线",
  "summary": "从数制编码到组合/时序电路的循序渐进路线。",
  "steps": [
    {
      "order": 1,
      "title": "数制与编码",
      "description": "掌握进制转换与常用编码。",
      "courseId": "mod-digital-logic-c-1",
      "lessonId": "mod-digital-logic-l-1",
      "knowledgePointId": "kp-1"
    }
  ]
}
```

- `steps[].courseId`、`steps[].lessonId`、`steps[].knowledgePointId` 均为可选字段，填写时必须匹配目标文件 `id`。

### glossary.json

```json
{
  "id": "g-1",
  "term": "二进制",
  "definition": "由 0 和 1 两个数码表示的数制。",
  "aliases": ["Binary"]
}
```

### faqs.json

```json
{
  "id": "faq-1",
  "question": "如何理解触发器的建立时间？",
  "answer": "建立时间 Tsu 是指时钟有效沿到达前输入信号必须保持稳定的最短时间。",
  "category": "时序逻辑"
}
```

### tags.json

```json
{
  "id": "tag-1",
  "name": "二进制",
  "slug": "binary",
  "description": "二进制数制与编码相关内容"
}
```

- 必填字段：`id`、`name`、`slug`（非空）；`description` 为可选字段。
- 模块内 `TagFilter` 组件支持按标签过滤内容，列表中各实体（`courses`/`knowledge-points`/`questions`/`cases`）的 `tags` 字段通常存放标签展示名。

---

## ID 命名规则

OpenSkill Galaxy 同时支持模块前缀 ID 与短 ID，主站 `SearchBox.tsx` 会优先通过 `item.id.startsWith(module.id + "-")` 或 `moduleSlug` 归属模块：

| 文件 | 常见前缀格式 | 示例 |
|------|--------------|------|
| `courses` | `mod-<name>-c-` / `course-` | `mod-digital-logic-c-1` |
| `lessons` | `mod-<name>-l-` / `lesson-` | `mod-digital-logic-l-1` |
| `knowledge-points` | `kp-` / `mod-<name>-kp-` | `kp-1` |
| `questions` | `mod-<name>-q-` / `q-` | `mod-digital-logic-q-1` |
| `exams` | `mod-<name>-exam-` / `exam-` | `mod-digital-logic-exam-1` |
| `cases` | `case-` / `mod-<name>-case-` | `case-1` |
| `routes` | `mod-<name>-route-` / `route-` | `mod-digital-logic-route-1` |
| `glossary` | `g-` | `g-1` |
| `faqs` | `faq-` | `faq-1` |
| `tags` | `tag-` | `tag-0` / `tag-1` |

---

## 引用完整性规则（`check-references.mjs` 全量检查）

1. `courses.json` `lessons[]` → `lessons.json` `id`
2. `lessons.json` `courseId` → `courses.json` `id`（必填，且与 `courses.lessons` 双向一致）
3. `lessons.json` `knowledgePoints[]` → `knowledge-points.json` `id`
4. `knowledge-points.json` `courseId`（存在时）→ `courses.json` `id`
5. `knowledge-points.json` `relatedQuestions[]` → `questions.json` `id`
6. `knowledge-points.json` `relatedCases[]` → `cases.json` `id`
7. `knowledge-points.json` `glossary[]` → `glossary.json` `id`
8. `questions.json` `chapter` → `courses.json` `id` 或 `lessons.json` `id`（必填）
9. `questions.json` `knowledge_points[]` → `knowledge-points.json` `id`
10. `questions.json` `related_questions[]` → `questions.json` `id`
11. `exams.json` `questionIds[]` → `questions.json` `id`
12. `cases.json` `knowledgePoints[]` → `knowledge-points.json` `id`
13. `routes.json` `steps[].{courseId, lessonId, knowledgePointId}` → 对应 `courses` / `lessons` / `knowledge-points` `id`

> 注：各实体上的自由文本 `tags[]` 不要求全部登记在 `tags.json` 中，不作为引用错误拦截。

---

## 唯一性规则（`check-duplicates.mjs`）

1. 10 个数组文件中的 `id` 必须文件内唯一。
2. 7 个可路由实体文件（`courses`、`lessons`、`knowledge-points`、`questions`、`exams`、`cases`、`routes`）的 `slug` 必须非空且文件内唯一（SPA 详情页按 `slug` 精确查找，重复会导致条目不可达）。
3. `tags.json` 的 `slug` 必须非空；重复 `tags.json` slug 默认输出警告，传入 `--strict-tags` 时作为错误拦截。

---

## search-index.json 生成规则

由 `build-search-index.mjs` 或 `optimize-pwa-and-search.mjs`（共用 `utils/search-index.mjs`）自动生成压缩单行 JSON：

- `course` → `/courses/${slug}`
- `lesson` → `/lessons/${slug}`
- `knowledge`（来自 `knowledge-points.json`，`type` 为 `"knowledge"`）→ `/knowledge/${slug}`
- `question` → `/questions/${slug}`（`title` 截断至 60 字符，`summary` 取解析前 120 字符）
- `case` → `/cases/${slug}`
- `route` → `/routes#${slug}`
- `glossary` → `/knowledge#glossary-${id}`
- `faq` → `/faq#${id}`

> 说明：模块前端 `src/search/search.ts` 在运行态也会基于已加载的 `ModuleData` 构建内存 Fuse.js 索引；`public/data/search-index.json` 同时作为静态产物纳入全站统计与健康校验，请勿手动编辑，每次数据变更后通过工具重新生成。
