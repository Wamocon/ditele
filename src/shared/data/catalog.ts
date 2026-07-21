import "server-only";

import { z } from "zod";

import { getPublicCatalog, getPublicCatalogCourse } from "./rpc";
import { ok, err, type Result } from "./result";

/**
 * WS-1 owns this file. Public catalog reads — the only data a guest can see.
 *
 * Both RPCs are granted to `anon` (RPC_CONTRACTS.md §2). Everything else the
 * catalog might want — stages, tasks, ratings — is RLS-denied to anon, so it is
 * simply not on these screens. See §"Verified against the live database" below.
 *
 * ⚠️ Two things the contracts file gets wrong, verified against the live
 * database on 2026-07-21 and reported as I-008:
 *   1. `get_public_catalog_course` returns an **array**, not a single object.
 *   2. An unknown slug returns `200 []`, not an error. "Not found" is `data: null`
 *      from `getCatalogCourse`, never an `ok: false`.
 */

/* ── Schemas ─────────────────────────────────────────────────────────────── */

const LocalizedMapSchema = z.record(z.string(), z.string().nullable()).nullable();

const CatalogCourseSchema = z.object({
  course_id: z.string(),
  slug: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  resolved_locale: z.string().nullable(),
  default_locale: z.string().nullable(),
  estimated_minutes: z.number().nullable(),
  version_number: z.number().nullable(),
  published_at: z.string().nullable(),
  task_count: z.number().nullable(),
  title_localizations: LocalizedMapSchema.optional(),
  summary_localizations: LocalizedMapSchema.optional(),
});

const CourseLocalizationSchema = z.object({
  locale: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  description_html: z.string().nullable(),
  learning_outcomes: z.array(z.string()).nullable(),
});

const CatalogCourseDetailSchema = z.object({
  course_id: z.string(),
  slug: z.string(),
  default_locale: z.string().nullable(),
  estimated_minutes: z.number().nullable(),
  version_number: z.number().nullable(),
  published_at: z.string().nullable(),
  task_count: z.number().nullable(),
  localizations: z.array(CourseLocalizationSchema).nullable(),
});

export type CatalogCourse = z.infer<typeof CatalogCourseSchema>;
export type CourseLocalization = z.infer<typeof CourseLocalizationSchema>;
export type CatalogCourseDetail = z.infer<typeof CatalogCourseDetailSchema>;

/* ── Reads ───────────────────────────────────────────────────────────────── */

export interface CatalogQuery {
  locale: string;
  /** Free-text match on title and summary. */
  search?: string;
  /** §5.5 rule 2. The RPC returns the complete set, so this slices in memory. */
  limit?: number;
  offset?: number;
}

export interface CatalogPage {
  courses: CatalogCourse[];
  /** Rows after filtering, before the limit/offset slice — drives pagination. */
  total: number;
}

/**
 * The public course list.
 *
 * ⚠️ `get_public_catalog` has no `p_limit`/`p_offset` (RPC_CONTRACTS.md §0.4);
 * it returns every published course. Search and paging are applied here, in
 * memory, so callers can page from day one and the RPC can gain real pagination
 * later without any page changing.
 */
export async function listCatalogCourses(query: CatalogQuery): Promise<Result<CatalogPage>> {
  const response = await getPublicCatalog(query.locale);
  if (!response.ok) return response;

  const parsed = z.array(CatalogCourseSchema).safeParse(response.data);
  if (!parsed.success) {
    return err({
      code: "SHAPE",
      message: "Der Kurskatalog konnte nicht gelesen werden.",
      retryable: false,
    });
  }

  const needle = query.search?.trim().toLowerCase() ?? "";
  const filtered = needle
    ? parsed.data.filter((course) =>
        `${course.title ?? ""} ${course.summary ?? ""}`.toLowerCase().includes(needle)
      )
    : parsed.data;

  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.max(1, query.limit ?? 24);

  return ok({ courses: filtered.slice(offset, offset + limit), total: filtered.length });
}

/**
 * One course by slug. `data: null` means no published course carries that slug —
 * the page turns that into `notFound()`, never into an error banner.
 */
export async function getCatalogCourse(slug: string): Promise<Result<CatalogCourseDetail | null>> {
  const response = await getPublicCatalogCourse({ slug });
  if (!response.ok) {
    // An unknown slug is `200 []`, so PGRST116 here means the RPC itself
    // returned nothing at all — treat it as "not found", not as a failure.
    if (response.error.code === "PGRST116") return ok(null);
    return response;
  }

  // The RPC returns a one-element array despite the contract sheet saying object.
  const rows = Array.isArray(response.data) ? response.data : [response.data];
  if (rows.length === 0) return ok(null);

  const parsed = CatalogCourseDetailSchema.safeParse(rows[0]);
  if (!parsed.success) {
    return err({
      code: "SHAPE",
      message: "Der Kurs konnte nicht gelesen werden.",
      retryable: false,
    });
  }
  return ok(parsed.data);
}

/* ── Locale resolution ───────────────────────────────────────────────────── */

/**
 * `get_public_catalog_course` returns every localization and no resolved title
 * (RPC_CONTRACTS.md §2). Resolve in this order: requested locale → the course's
 * own `default_locale` → German → whatever exists.
 */
export function resolveLocalization(
  course: CatalogCourseDetail,
  locale: string
): CourseLocalization | null {
  const all = course.localizations ?? [];
  return (
    all.find((l) => l.locale === locale) ??
    all.find((l) => l.locale === course.default_locale) ??
    all.find((l) => l.locale === "de") ??
    all[0] ??
    null
  );
}
