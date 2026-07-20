import "server-only";

import { cache } from "react";

import { hasPermission } from "@/shared/auth/authorization";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import type { Locale } from "@/shared/i18n/config";

import {
  adminCourseRowSchema,
  adminCourseListRowsSchema,
  contentArchiveImpactSchema,
  projectAdminCourseDetail,
  projectAdminCourseListItem,
  projectContentVersion,
  type ContentArchiveImpactResult,
  type ContentVersionProjection,
  type PreviewRole,
} from "./model";

const courseListProjection = `
  id,
  organization_id,
  slug,
  state,
  default_locale,
  estimated_minutes,
  row_version,
  updated_at,
  course_localizations!course_localizations_course_id_fkey(locale, title, summary, description_html, learning_outcomes),
  content_versions!content_versions_course_id_fkey(id, version_number, state),
  stages!stages_course_id_fkey(
    id,
    tasks!tasks_stage_course_fk(id)
  )
`;

const courseProjection = `
  id,
  organization_id,
  slug,
  state,
  default_locale,
  estimated_minutes,
  row_version,
  updated_at,
  course_localizations!course_localizations_course_id_fkey(locale, title, summary, description_html, learning_outcomes),
  content_versions!content_versions_course_id_fkey(
    id,
    version_number,
    state,
    change_summary,
    row_version,
    snapshot,
    created_at,
    updated_at,
    published_at,
    published_by,
    content_reviews!content_reviews_content_version_id_fkey(
      id,
      decision,
      comment,
      created_at,
      reviewer_id,
      content_fingerprint,
      expected_content_version_row_version
    )
  ),
  stages!stages_course_id_fkey(
    id,
    content_version_id,
    position,
    state,
    row_version,
    stage_localizations!stage_localizations_stage_id_fkey(locale, title, description_html),
    tasks!tasks_stage_course_fk(
      id,
      content_version_id,
      position,
      task_kind,
      state,
      target_url,
      expected_minutes,
      hint_penalty_basis_points,
      row_version,
      task_localizations!task_localizations_task_id_fkey(locale, title, instructions_html, hint_text),
      task_options!task_options_task_id_fkey(id, labels, position),
      task_assessments!task_assessments_task_id_fkey(question_translations, selection_mode, minimum_selections, maximum_selections),
      task_hints!task_hints_task_id_fkey(id, position, content_translations)
    )
  ),
  media_assets!media_assets_course_id_fkey(id, stage_id, media_kind, mime_type, byte_size, state, created_at)
`;

function requireContentManage(principal: Principal): void {
  if (!hasPermission(principal, "content.manage")) {
    throw new Error("content_studio.forbidden");
  }
}

function requireContentPublish(principal: Principal): void {
  if (!hasPermission(principal, "content.publish")) {
    throw new Error("content_studio.publish_forbidden");
  }
}

export const ADMIN_COURSES_PAGE_SIZE = 20;

export async function readAdminCourseList(
  principal: Principal,
  locale: Locale,
  page: number,
) {
  requireContentManage(principal);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("content_studio.invalid_page");
  const client = await createServerClient();
  const offset = (page - 1) * ADMIN_COURSES_PAGE_SIZE;
  const { count, data, error } = await client
    .from("courses")
    .select(courseListProjection, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + ADMIN_COURSES_PAGE_SIZE - 1);
  if (error) throw new Error("content_studio.course_list_read_failed", { cause: error });
  const rows = adminCourseListRowsSchema.parse(data);
  if (count === null) throw new Error("content_studio.course_count_missing");
  return {
    courses: rows.map((row) => projectAdminCourseListItem(row, locale)),
    page,
    total: count,
    totalPages: Math.max(1, Math.ceil(count / ADMIN_COURSES_PAGE_SIZE)),
  };
}

const readCourseRow = cache(async (courseId: string) => {
  const client = await createServerClient();
  const { data, error } = await client
    .from("courses")
    .select(courseProjection)
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw new Error("content_studio.course_read_failed", { cause: error });
  return data ? adminCourseRowSchema.parse(data) : null;
});

export async function readAdminCourse(
  principal: Principal,
  courseId: string,
  locale: Locale,
) {
  requireContentManage(principal);
  const row = await readCourseRow(courseId);
  return row ? projectAdminCourseDetail(row, locale) : null;
}

export async function readAdminContentVersion(
  principal: Principal,
  courseId: string,
  contentVersionId: string,
  locale: Locale,
  role: PreviewRole,
): Promise<ContentVersionProjection | null> {
  requireContentManage(principal);
  const row = await readCourseRow(courseId);
  if (!row) return null;
  return projectContentVersion(row, contentVersionId, locale, role);
}

export async function readContentArchiveImpact(
  principal: Principal,
  contentVersionId: string,
  courseId: string,
  expectedRowVersion: number,
): Promise<ContentArchiveImpactResult> {
  requireContentPublish(principal);
  const client = await createServerClient();
  const { data, error } = await client.rpc("get_content_archive_impact", {
    p_content_version_id: contentVersionId,
  });
  if (error?.code === "42501") return { status: "forbidden" };
  if (error) return { status: "failed" };
  const parsed = contentArchiveImpactSchema.safeParse(data);
  if (
    !parsed.success
    || parsed.data.content_version_id !== contentVersionId
    || parsed.data.course_id !== courseId
    || parsed.data.row_version !== expectedRowVersion
  ) {
    return { status: "failed" };
  }
  return { status: "ready", impact: parsed.data };
}
