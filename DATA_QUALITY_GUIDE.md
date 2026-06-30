# OpenSkill Galaxy 数据质量规范

## 模块数据文件结构

```
public/data/
├── module.json             模块元信息
├── courses.json            课程列表
├── lessons.json            课时列表
├── knowledge-points.json   知识点
├── questions.json          题库
├── exams.json              试卷
├── cases.json              案例
├── routes.json             自定义路由
├── glossary.json           术语表
├── faqs.json               常见问题
├── tags.json               标签
└── search-index.json       搜索索引（自动生成）
```

---

## 各文件字段规范

### courses.json

```json
{
  "id": "course-1",
  "title": "数制与编码",
  "order": 1,
  "moduleId": "module-digital-logic",
  "description": "学习二进制、八进制、十六进制及其转换",
  "category": "基础理论",
  "objectives": ["掌握数制转换", "理解BCD码"],
  "lessonIds": ["lesson-1", "lesson-2", "lesson-3", "lesson-4"],
  "estimatedHours": 4,
  "difficulty": "easy",
  "tags": ["数制", "编码"]
}
```

### lessons.json

```json
{
  "id": "lesson-1",
  "courseId": "course-1",
  "title": "二进制与十进制转换",
  "order": 1,
  "contentMarkdown": "## 二进制\n\n二进制是计算机中最基础的数制...",
  "knowledgePoints": ["二进制", "位权"],
  "durationMinutes": 45,
  "tags": ["二进制"]
}
```

### knowledge-points.json

```json
{
  "id": "kp-1",
  "slug": "二进制",
  "title": "二进制",
  "summary": "二进制是计算机基础数制",
  "courseId": "course-1",
  "tags": ["数制"],
  "difficulty": "easy",
  "contentMarkdown": "## 二进制\n\n二进制...",
  "relatedQuestions": ["q-1", "q-2"],
  "relatedCases": [],
  "glossary": ["g-1", "g-2"]
}
```

### questions.json

```json
{
  "id": "q-1",
  "type": "single_choice",
  "difficulty": "easy",
  "chapter": "course-1",
  "knowledge_points": ["二进制"],
  "stem": "十进制数 10 对应的二进制是？",
  "options": [
    { "label": "A", "text": "1010" },
    { "label": "B", "text": "1001" },
    { "label": "C", "text": "1100" },
    { "label": "D", "text": "1011" }
  ],
  "answer": "A",
  "explanation": "10 ÷ 2 = 5 余 0...",
  "wrong_reason": {
    "B": "未正确取余...",
    "C": "混淆了...",
    "D": "计算错误..."
  },
  "related_questions": ["q-2"],
  "tags": ["数制转换"],
  "estimated_time": 2,
  "source_type": "curated-generated"
}
```

**题型 (type) 可取值：**
- `single_choice` — 单选题，选项 4 个，answer 为单个选项字母
- `multiple_choice` — 多选题，选项 4 个，answer 为数组 `["A","B"]`
- `true_false` — 判断题，answer 为 `true` 或 `false`
- `fill_blank` — 填空题，answer 为字符串或数组
- `short_answer` — 简答题，须含 `scoringPoints`
- `calculation` — 计算题，须含 `steps`
- `case_analysis` — 案例分析题，须含 `background`、`questions`、`referenceAnswer`

**难度 (difficulty) 分布建议：**
- `easy` — 约 35%
- `medium` — 约 45%
- `hard` — 约 20%

### exams.json

```json
{
  "id": "exam-1",
  "title": "数制与编码单元测验",
  "description": "本章基础概念测试",
  "durationMinutes": 60,
  "difficulty": "medium",
  "questionIds": ["q-1", "q-2", "q-5", "q-10"],
  "totalScore": 100,
  "passScore": 60,
  "tags": ["数制", "编码"],
  "rules": ["独立完成", "闭卷"]
}
```

### cases.json

```json
{
  "id": "case-1",
  "title": "电梯楼层编码设计",
  "backgroundMarkdown": "某大楼共4层...",
  "tasksMarkdown": "1. 设计楼层编码...",
  "referenceMarkdown": "参考方案使用...",
  "knowledgePoints": ["编码器", "BCD码"],
  "relatedQuestions": ["q-50"],
  "difficulty": "medium",
  "estimatedHours": 2,
  "tags": ["电梯控制"]
}
```

### routes.json

```json
{
  "id": "route-1",
  "path": "/custom-path",
  "title": "自定义页面路径",
  "type": "page"
}
```

### glossary.json

```json
{
  "id": "g-1",
  "term": "二进制",
  "definition": "由 0 和 1 两个数码表示的数制",
  "aliases": ["Binary"]
}
```

### faqs.json

```json
{
  "id": "faq-1",
  "question": "如何理解触发器的建立时间？",
  "answer": "建立时间 Tsu...",
  "category": "FPGA实验"
}
```

### tags.json

```json
{
  "id": "tag-1",
  "name": "二进制",
  "count": 15
}
```

---

## ID 命名规则

| 文件 | ID 前缀 | 示例 |
|------|---------|------|
| courses | `course-` | `course-1` |
| lessons | `lesson-` | `lesson-1` |
| knowledge-points | `kp-` | `kp-1` |
| questions | `q-` | `q-1` |
| exams | `exam-` | `exam-1` |
| cases | `case-` | `case-1` |
| routes | `route-` | `route-1` |
| glossary | `g-` | `g-1` |
| faqs | `faq-` | `faq-1` |
| tags | `tag-` | `tag-1` |

ID 从 1 开始递增，不重复、不跳跃。

---

## 引用完整性规则

1. `lessons.json` 中的 `courseId` → 必须存在于 `courses.json`
2. `knowledge-points.json` 中的 `courseId` → 必须存在于 `courses.json`
3. `knowledge-points.json` 中的 `relatedQuestions` → 必须存在于 `questions.json`
4. `questions.json` 中的 `chapter` → 必须存在于 `courses.json`（作为 id）
5. `questions.json` 中的 `related_questions` → 必须存在于 `questions.json`
6. `exams.json` 中的 `questionIds` → 必须存在于 `questions.json`
7. `cases.json` 中的 `knowledgePoints` → 必须存在于 `knowledge-points.json`
8. `cases.json` 中的 `relatedQuestions` → 必须存在于 `questions.json`
9. `courses.json` 中的 `lessonIds` → 必须存在于 `lessons.json`

---

## 去重规则

1. 每个文件中所有 `id` 必须唯一
2. `knowledge-points.json` 中 `title`（slug）建议唯一
3. `glossary.json` 中 `term` 建议唯一
4. `faqs.json` 中 `question` 建议唯一
5. `questions.json` 中 `stem` 建议唯一（防止重复录入）

---

## search-index.json 生成规则

由 `build-search-index.mjs` 自动生成，包含：

- 题目 (questions) — 题干+选项文本+知识点
- 知识点 (knowledge-points) — 标题+摘要
- 课程 (courses) — 标题+描述
- 课时 (lessons) — 标题
- 案例 (cases) — 标题
- 术语 (glossary) — 术语+定义
- FAQ (faqs) — 问题+回答

搜索索引用于前端 Fuse.js 模糊搜索，**不手动编辑，每次数据变更后重新生成**。
