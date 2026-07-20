import "server-only";

import type { LearnerDashboard } from "@/features/learning/model/learner-dashboard";
import { listMyLearningCourseProjection } from "@/features/learning/server/learner-published-content-data";
import { toLearnerDashboard } from "@/features/learning/server/learner-published-content";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

export async function readLearnerDashboard(
  locale: Locale,
): Promise<LearnerDashboard> {
  const client = await createServerClient();
  const projection = await listMyLearningCourseProjection(client, locale);
  return toLearnerDashboard(projection, locale);
}
