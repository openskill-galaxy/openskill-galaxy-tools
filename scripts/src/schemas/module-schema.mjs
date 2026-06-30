import { z } from 'zod';

const Difficulty = z.enum(['easy', 'medium', 'hard']);
const QuestionType = z.enum(['single', 'multiple', 'judge', 'short', 'fill', 'calculation', 'case_analysis']);

export const CourseSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
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
  slug: z.string(),
  courseId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  order: z.number(),
  contentMarkdown: z.string(),
  knowledgePoints: z.array(z.string()),
  estimatedMinutes: z.number().positive(),
});

export const KnowledgePointSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
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
  key: z.string(),
  text: z.string(),
});

export const QuestionSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
  type: QuestionType,
  difficulty: Difficulty,
  chapter: z.string(),
  knowledge_points: z.array(z.string()),
  stem: z.string().min(1),
  options: z.array(QuestionOptionSchema),
  answer: z.array(z.string()),
  explanation: z.string(),
  wrong_reason: z.record(z.string()).optional(),
  related_questions: z.array(z.string()).optional(),
  tags: z.array(z.string()),
  estimated_time: z.number().positive(),
  source_type: z.string().optional(),
});

export const ExamSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
  title: z.string().min(1),
  summary: z.string(),
  difficulty: Difficulty,
  questionIds: z.array(z.string()),
  timeLimitMinutes: z.number().positive(),
  passingScore: z.number().min(0).max(100),
});

export const CaseSchema = z.object({
  id: z.string().min(1),
  slug: z.string(),
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
  slug: z.string(),
  title: z.string().min(1),
  summary: z.string(),
  steps: z.array(LearningRouteStepSchema),
});

export const GlossaryTermSchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  definition: z.string(),
  aliases: z.array(z.string()).optional(),
});

export const FaqItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
  category: z.string(),
});

export const TagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string(),
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
