import { z } from "zod";

import { CatalogCourseSchema, CatalogLocaleSchema } from "./catalog";

export const CourseRecommendationInputSchema = z.object({
  locale: CatalogLocaleSchema,
  learningGoal: z.string().trim().min(10).max(600),
  experienceLevel: z.enum(["new", "some_experience", "experienced"]),
  weeklyMinutes: z.number().int().min(30).max(2400),
});

export type CourseRecommendationInput = z.infer<typeof CourseRecommendationInputSchema>;

export const CourseRecommendationSchema = z.object({
  course: CatalogCourseSchema,
  reason: z.string().trim().min(1).max(600),
  source: z.enum(["rules", "approved_ai_gateway"]),
  correlationId: z.string().min(1),
});

export type CourseRecommendation = z.infer<typeof CourseRecommendationSchema>;

export interface CourseRecommendationGateway {
  recommend(input: CourseRecommendationInput): Promise<unknown>;
}

export async function recommendCourse(
  gateway: CourseRecommendationGateway,
  input: unknown,
): Promise<CourseRecommendation> {
  const parsed = CourseRecommendationInputSchema.parse(input);
  const result = await gateway.recommend(parsed);

  return CourseRecommendationSchema.parse(result);
}
