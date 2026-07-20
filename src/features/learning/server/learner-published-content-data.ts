import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/database/database.types";
import type { Locale } from "@/shared/i18n/config";

type ProjectionRpcResult = {
  data: unknown;
  error: unknown;
};

type LearnerProjectionRpcClient = {
  rpc(
    name:
      | "list_my_learning_courses"
      | "get_my_learning_course"
      | "get_my_learning_task",
    args: Record<string, unknown>,
  ): Promise<ProjectionRpcResult>;
};

function projectionRpcClient(
  client: SupabaseClient<Database>,
): LearnerProjectionRpcClient {
  // Generated types are refreshed only after the coordinated migration wave.
  // Keep this temporary boundary local instead of weakening shared DB types.
  return client as unknown as LearnerProjectionRpcClient;
}

export async function listMyLearningCourseProjection(
  client: SupabaseClient<Database>,
  locale: Locale,
): Promise<unknown> {
  const { data, error } = await projectionRpcClient(client).rpc(
    "list_my_learning_courses",
    { p_locale: locale },
  );
  if (error) {
    throw new Error("learning.dashboard_read_failed", { cause: error });
  }
  return data ?? [];
}

export async function getMyLearningCourseProjection(
  client: SupabaseClient<Database>,
  courseId: string,
  locale: Locale,
): Promise<unknown | null> {
  const { data, error } = await projectionRpcClient(client).rpc(
    "get_my_learning_course",
    { p_course_id: courseId, p_locale: locale },
  );
  if (error) {
    throw new Error("learning.course_workspace_read_failed", { cause: error });
  }
  return data;
}

export async function getMyLearningTaskProjection(
  client: SupabaseClient<Database>,
  taskId: string,
): Promise<unknown | null> {
  const { data, error } = await projectionRpcClient(client).rpc(
    "get_my_learning_task",
    { p_task_id: taskId },
  );
  if (error) {
    throw new Error("tasks.read_failed", { cause: error });
  }
  return data;
}
