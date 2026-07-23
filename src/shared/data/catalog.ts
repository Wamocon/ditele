import "server-only";

import { createServerClient } from "@/shared/database/server";
import type { Tables } from "@/shared/database/database.types";
import { fromSupabase, type Result } from "./result";

/**
 * Public catalog reads (clean schema — see ditele_schema.md).
 *
 * A course row on the new schema carries everything the public pages show:
 * `title`, `description`, `cover_image_url` and the two video URLs. There are no
 * localizations, versions, stages or task counts any more — the catalog is a
 * flat list of `courses` whose `state` is `active`.
 *
 * Anonymous visitors are allowed to read active courses by the `courses_public_read`
 * RLS policy; the `courses` table has no trainer-only columns, so `select("*")`
 * is safe here.
 */

/** A public catalog course. Only `state = 'active'` rows are ever returned. */
export type CatalogCourse = Tables<"courses">;

/** All active courses, ordered by title. Empty array when there are none. */
export async function listActiveCourses(): Promise<Result<CatalogCourse[]>> {
  const supabase = await createServerClient();
  return fromSupabase(async () =>
    supabase
      .from("courses")
      .select("*")
      .eq("state", "active")
      .order("title", { ascending: true })
  );
}

/**
 * A single active course by its URL slug.
 *
 * Returns `PGRST116` ("Nicht gefunden.") when no active course has that slug —
 * an unknown or non-active slug is a 404, not a failure, so the detail page
 * turns that specific code into `notFound()` and renders `ErrorState` only for a
 * real error.
 */
export async function getActiveCourseBySlug(slug: string): Promise<Result<CatalogCourse>> {
  const supabase = await createServerClient();
  return fromSupabase(async () =>
    supabase
      .from("courses")
      .select("*")
      .eq("slug", slug)
      .eq("state", "active")
      .maybeSingle()
  );
}
