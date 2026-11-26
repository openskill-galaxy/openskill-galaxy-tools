import { z } from 'zod';

const Difficulty = z.enum(['easy', 'medium', 'hard']);
const ModuleDifficulty = z.enum(['beginner', 'intermediate', 'advanced', 'easy', 'medium', 'hard']);
const QuestionType = z.enum(['single', 'multiple', 'judge', 'short', 'fill', 'calculation', 'case_analysis']);

export const ModuleMetaStatsSchema = z.object({
  courses: z.number().int().nonnegative(),
  lessons: z.number().int().nonnegative(),
  knowledgePoints: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  cases: z.number().int().nonnegative(),
  exams: z.number().int().nonnegative(),
  routes: z.number().int().nonnegative(),
  glossary: z.number().int().nonnegative(),
  faqs: z.number().int().nonnegative(),
  tags: z.number().int().nonnegative(),
});

export const ModuleMetaSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  license: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string()),
  estimatedHours: z.number().positive(),
  difficulty: ModuleDifficulty,
  updatedAt: z.string().min(1),
  coverEmoji: z.string().min(1),
  repoUrl: z.string().url().optional(),
  portalUrl: z.string().url().optional(),
  status: z.enum(['stable', 'beta', 'draft', 'archived']).optional(),
  stats: ModuleMetaStatsSchema,
});

export const CourseSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()),
  estimatedHours: z.number().positive(),
  lessons: z.array(z.string()),
  order: z.number(),
});

export const LessonSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  order: z.number(),
  contentMarkdown: z.string(),
  knowledgePoints: z.array(z.string()),
  practiceQuestionIds: z.array(z.string().min(1)).optional(),
  estimatedMinutes: z.number().positive(),
});

export const KnowledgePointSchema = z.object({
  editorialStatus: z.literal('draft').optional(),
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  courseId: z.string().optional(),
  tags: z.array(z.string()),
  difficulty: Difficulty,
  contentMarkdown: z.string(),
  relatedQuestions: z.array(z.string()),
  relatedCases: z.array(z.string()),
  glossary: z.array(z.string()),
});

export const QuestionOptionSchema = z.object({
  key: z.string().min(1),
  text: z.string(),
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  type: QuestionType,
  difficulty: Difficulty,
  chapter: z.string(),
  knowledge_points: z.array(z.string()),
  stem: z.string().min(1),
  options: z.array(QuestionOptionSchema),
  answer: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(1),
  wrong_reason: z.record(z.string()).optional(),
  related_questions: z.array(z.string()).optional(),
  tags: z.array(z.string()),
  estimated_time: z.number().positive(),
  source_type: z.string().optional(),
}).superRefine((q, ctx) => {
  if (q.type === 'single' || q.type === 'multiple') {
    if (q.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: `${q.type} question requires at least 2 options`,
      });
    }
    const keys = new Set(q.options.map((o) => o.key));
    for (const ans of q.answer) {
      if (!keys.has(ans)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer'],
          message: `answer '${ans}' does not match any option key [${[...keys].join(', ')}]`,
        });
      }
    }
    if (q.type === 'single' && q.answer.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer'],
        message: `single question must have exactly 1 answer (got ${q.answer.length})`,
      });
    }
  } else if (q.type === 'judge') {
    for (const ans of q.answer) {
      if (ans !== 'T' && ans !== 'F') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer'],
          message: `judge question answer '${ans}' must be 'T' or 'F'`,
        });
      }
    }
  }
});

export const ExamSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  difficulty: Difficulty,
  questionIds: z.array(z.string()),
  timeLimitMinutes: z.number().positive(),
  passingScore: z.number().min(0).max(100),
});

export const CaseSchema = z.object({
  nextCaseId: z.string().min(1).optional(),
  reviewRubric: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().trim().min(1),
    requirement: z.string().trim().min(1),
  })).min(1).refine((items) => new Set(items.map((item) => item.id)).size === items.length,
    'Review criteria must have distinct ids').optional(),
  editorialStatus: z.literal('draft').optional(),
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()),
  backgroundMarkdown: z.string(),
  tasksMarkdown: z.string(),
  referenceMarkdown: z.string(),
  knowledgePoints: z.array(z.string()),
  estimatedMinutes: z.number().positive(),
});

export const LearningRouteStepSchema = z.object({
  order: z.number(),
  title: z.string(),
  description: z.string(),
  courseId: z.string().optional(),
  lessonId: z.string().optional(),
  knowledgePointId: z.string().optional(),
});

export const LearningRouteSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  steps: z.array(LearningRouteStepSchema),
});

export const GlossaryTermSchema = z.object({
  editorialStatus: z.literal('draft').optional(),
  id: z.string().min(1),
  term: z.string().min(1),
  definition: z.string(),
  aliases: z.array(z.string()).optional(),
});

export const FaqItemSchema = z.object({
  editorialStatus: z.literal('draft').optional(),
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
  category: z.string(),
});

export const TagSchema = z.object({
  editorialStatus: z.literal('draft').optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
});

export const Schemas = {
  courses: CourseSchema,
  lessons: LessonSchema,
  'knowledge-points': KnowledgePointSchema,
  questions: QuestionSchema,
  exams: ExamSchema,
  cases: CaseSchema,
  routes: LearningRouteSchema,
  glossary: GlossaryTermSchema,
  faqs: FaqItemSchema,
  tags: TagSchema,
};
