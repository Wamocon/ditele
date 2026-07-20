import "server-only";

import type { Principal } from "@/shared/auth/types";
import { hasPermission } from "@/shared/auth/authorization";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import { adminTaskRowsSchema, projectAdminTask } from "./model";

export const ADMIN_TASKS_PAGE_SIZE = 24;

const taskProjection = `
  id,
  course_id,
  stage_id,
  content_version_id,
  position,
  task_kind,
  state,
  target_url,
  expected_minutes,
  row_version,
  updated_at,
  task_localizations!task_localizations_task_id_fkey(locale, title),
  task_options!task_options_task_id_fkey(id),
  task_hints!task_hints_task_id_fkey(id),
  task_assessments!task_assessments_task_id_fkey(task_id),
  courses!tasks_course_id_fkey!inner(
    id,
    slug,
    course_localizations!course_localizations_course_id_fkey(locale, title)
  ),
  stages!tasks_stage_course_fk!inner(
    id,
    position,
    stage_localizations!stage_localizations_stage_id_fkey(locale, title)
  ),
  content_versions!tasks_version_course_fk(id, version_number, state)
`;

export async function readAdminTasks(
  principal: Principal,
  locale: Locale,
  page: number,
) {
  if (!hasPermission(principal, "content.manage")) {
    throw new Error("admin_tasks.forbidden");
  }
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("admin_tasks.invalid_page");
  }

  const client = await createServerClient();
  const offset = (page - 1) * ADMIN_TASKS_PAGE_SIZE;
  const { count, data, error } = await client
    .from("tasks")
    .select(taskProjection, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + ADMIN_TASKS_PAGE_SIZE - 1);
  if (error) throw new Error("admin_tasks.read_failed", { cause: error });
  if (count === null) throw new Error("admin_tasks.count_missing");

  return {
    items: adminTaskRowsSchema.parse(data).map((row) => projectAdminTask(row, locale)),
    page,
    total: count,
    totalPages: Math.max(1, Math.ceil(count / ADMIN_TASKS_PAGE_SIZE)),
  };
}
