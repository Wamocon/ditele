import "server-only";

import { createServerClient } from "@/shared/database/server";

import { projectExistingRating, type ExistingRating } from "./rating-model";

async function readOwnRating(
  column: "course_id" | "task_id",
  targetId: string,
): Promise<ExistingRating | null> {
  const client = await createServerClient();
  const { data, error } = await client
    .from("ratings")
    .select("score, comment, row_version")
    .eq(column, targetId)
    .maybeSingle();
  if (error) throw new Error("ratings.read_failed", { cause: error });
  return projectExistingRating(data);
}

export function readCourseRating(courseId: string): Promise<ExistingRating | null> {
  return readOwnRating("course_id", courseId);
}

export function readTaskRating(taskId: string): Promise<ExistingRating | null> {
  return readOwnRating("task_id", taskId);
}
