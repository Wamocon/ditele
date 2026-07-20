import "server-only";

import type { LearnerCourseWorkspace } from "@/features/learning/model/course-workspace";
import { getMyLearningCourseProjection } from "@/features/learning/server/learner-published-content-data";
import { toLearnerCourseWorkspace } from "@/features/learning/server/learner-published-content";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

export async function readLearnerCourseWorkspace(
  courseId: string,
  locale: Locale,
): Promise<LearnerCourseWorkspace | null> {
  const client = await createServerClient();
  const projection = await getMyLearningCourseProjection(
    client,
    courseId,
    locale,
  );
  return projection === null ? null : toLearnerCourseWorkspace(projection);
}
