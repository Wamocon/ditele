import { z } from "zod";

export const TaskLocalizedTextSchema = z.object({
  en: z.string().trim().min(1),
  de: z.string().trim().min(1).optional(),
  ru: z.string().trim().min(1).optional(),
});

export type TaskLocalizedText = z.infer<typeof TaskLocalizedTextSchema>;

export const TaskLocaleSchema = z.enum(["en", "de", "ru"]);
export type TaskLocale = z.infer<typeof TaskLocaleSchema>;

export const TaskOptionSchema = z.object({
  id: z.string().min(1),
  label: TaskLocalizedTextSchema,
});

export const TaskAssessmentSchema = z.object({
  id: z.string().min(1),
  question: TaskLocalizedTextSchema,
  selectionMode: z.enum(["single", "multiple"]),
  options: z.array(TaskOptionSchema).min(2),
});

export const LearnerTaskSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  courseId: z.string().min(1),
  groupId: z.string().min(1),
  stageId: z.string().min(1),
  title: TaskLocalizedTextSchema,
  instructions: TaskLocalizedTextSchema,
  targetUrl: z.string().url().optional(),
  hintId: z.string().min(1).optional(),
  hint: TaskLocalizedTextSchema.optional(),
  beforeVideoUrl: z.string().url().optional(),
  afterVideoUrl: z.string().url().optional(),
  assessment: TaskAssessmentSchema.optional(),
  activatedAt: z.string().datetime().optional(),
  access: z.enum(["available", "inactive", "blocked"]),
});

export type LearnerTask = z.infer<typeof LearnerTaskSchema>;

export function taskText(value: TaskLocalizedText, locale: TaskLocale): string {
  return value[locale] ?? value.en;
}
