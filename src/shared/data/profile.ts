import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { requirePrincipal } from "@/shared/auth/principal";
import { err, ok, fromSupabase, mapPostgrestError, type DataError, type Result } from "./result";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  DEFAULT_ORGANIZATION_ID,
  getPublicCatalogCourse,
  listMyLearningHistory,
  requestEnrollment,
  updateOwnProfile,
} from "./rpc";

/**
 * WS-3 · the learner's own account: profile, notification preferences,
 * enrolment requests, learning history and certificates.
 *
 * These belong together because they are all "my account" reads scoped by RLS
 * to the signed-in learner. WS-3 owns exactly three files in this folder
 * (`profile.ts`, `questions.ts`, `notifications.ts`), so the history,
 * certificate and enrolment helpers live here rather than in a fourth file
 * nobody owns.
 *
 * Every function returns Result<T> and validates its payload with zod at the
 * boundary (MASTER_PLAN §13.2). Nothing here throws into a page.
 */

/* ── Shared error refinement ────────────────────────────────────────────── */

/**
 * `mapPostgrestError` (WS-0) does not know two codes these RPCs raise:
 *
 *  - `40001` — the optimistic-concurrency check failed ("… is stale").
 *  - `22023` — argument validation, raised with a German-unfriendly English text.
 *
 * WS-0 owns `result.ts`, so WS-3 refines the mapped error here instead of
 * editing it. Logged as I-014 in plan/status/ISSUES.md.
 */
export function refineDataError(error: DataError): DataError {
  if (error.code === "40001") {
    return {
      code: error.code,
      message: "Der Datensatz wurde zwischenzeitlich geändert. Bitte lade die Seite neu.",
      retryable: true,
    };
  }
  return error;
}

function fail<T>(result: Result<T>): Result<T> {
  return result.ok ? result : err(refineDataError(result.error));
}

/** A PostgrestError straight off a table query, mapped and refined. */
export function failPostgrest(error: PostgrestError): Result<never> {
  return err(refineDataError(mapPostgrestError(error)));
}

export function shapeError(what: string): Result<never> {
  return err({ code: "SHAPE", message: `${what} konnte nicht gelesen werden.`, retryable: false });
}

/* ── Profile ────────────────────────────────────────────────────────────── */

const ProfileSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  locale: z.string(),
  timezone: z.string(),
  state: z.string(),
  avatar_object_key: z.string().nullable(),
  row_version: z.number(),
  updated_at: z.string(),
});

export type LearnerProfile = z.infer<typeof ProfileSchema> & { email: string | null };

export async function getMyProfile(): Promise<Result<LearnerProfile>> {
  const principal = await requirePrincipal().catch(() => null);
  if (!principal) {
    return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });
  }

  const supabase = await createServerClient();
  const [profileResponse, userResponse] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", principal.userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (profileResponse.error) return failPostgrest(profileResponse.error);
  const parsed = ProfileSchema.safeParse(profileResponse.data);
  if (!parsed.success) return shapeError("Das Profil");
  return ok({ ...parsed.data, email: userResponse.data.user?.email ?? null });
}

export async function saveMyProfile(args: {
  displayName: string;
  locale: string;
  timezone: string;
  expectedVersion: number;
}): Promise<Result<unknown>> {
  return fail(
    await updateOwnProfile({
      displayName: args.displayName,
      locale: args.locale,
      timezone: args.timezone,
      expectedVersion: args.expectedVersion,
      idempotencyKey: `profile:${crypto.randomUUID()}`,
    })
  );
}

/** Supabase Auth handles the password itself — no RPC, no service role. */
export async function changeMyPassword(newPassword: string): Promise<Result<true>> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return err({
      code: error.code ?? "AUTH",
      message: "Das Passwort konnte nicht geändert werden. Prüfe die Passwortregeln.",
      retryable: true,
    });
  }
  return ok(true);
}

/* ── Enrolment ──────────────────────────────────────────────────────────── */

const EnrollmentSchema = z.object({
  id: z.string(),
  course_id: z.string(),
  cohort_id: z.string().nullable(),
  state: z.string(),
  request_note: z.string().nullable(),
  decision_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
  row_version: z.number(),
});

export type Enrollment = z.infer<typeof EnrollmentSchema>;

/** null when the learner has never requested this course. */
export async function getMyEnrollmentForCourse(courseId: string): Promise<Result<Enrollment | null>> {
  const principal = await requirePrincipal().catch(() => null);
  if (!principal) {
    return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("*")
    .eq("course_id", courseId)
    .eq("learner_id", principal.userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return failPostgrest(error);
  const row = (data ?? [])[0];
  if (!row) return ok(null);

  const parsed = EnrollmentSchema.safeParse(row);
  if (!parsed.success) return shapeError("Die Kursanfrage");
  return ok(parsed.data);
}

export async function requestCourseEnrollment(args: {
  courseId: string;
  requestNote: string;
}): Promise<Result<unknown>> {
  const principal = await requirePrincipal().catch(() => null);
  const organizationId = principal?.organizationId ?? DEFAULT_ORGANIZATION_ID;
  return fail(
    await requestEnrollment({
      courseId: args.courseId,
      organizationId,
      idempotencyKey: `enroll:${args.courseId}`,
      ...(args.requestNote.trim() ? { requestNote: args.requestNote.trim() } : {}),
    })
  );
}

/* ── Course summary for the enrol screen ────────────────────────────────── */

const CatalogLocalizationSchema = z.object({
  locale: z.string(),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  description_html: z.string().nullable().optional(),
  learning_outcomes: z.array(z.string()).nullable().optional(),
});

const CatalogCourseSchema = z.object({
  course_id: z.string(),
  slug: z.string(),
  default_locale: z.string(),
  estimated_minutes: z.number().nullable(),
  version_number: z.number().nullable(),
  published_at: z.string().nullable(),
  task_count: z.number().nullable(),
  localizations: z.array(CatalogLocalizationSchema),
});

export interface CourseSummary {
  courseId: string;
  slug: string;
  title: string;
  summary: string;
  estimatedMinutes: number | null;
  taskCount: number | null;
  learningOutcomes: string[];
}

/**
 * `get_public_catalog_course` returns no resolved title — the locale has to be
 * picked out of `localizations[]` with a fallback to `default_locale`
 * (RPC_CONTRACTS.md §2).
 *
 * ⚠️ It also returns a **one-element array**, not the single object
 * RPC_CONTRACTS.md §2 describes. Measured against the live database; see
 * ISSUES.md I-015. Both shapes are accepted here so a corrected RPC would not
 * break this page.
 */
export async function getCourseSummary(courseId: string, locale: string): Promise<Result<CourseSummary>> {
  const result = await getPublicCatalogCourse({ courseId });
  if (!result.ok) return fail(result);

  const payload = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!payload) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });

  const parsed = CatalogCourseSchema.safeParse(payload);
  if (!parsed.success) return shapeError("Der Kurs");

  const course = parsed.data;
  const byLocale = (wanted: string) => course.localizations.find((l) => l.locale === wanted);
  const chosen = byLocale(locale) ?? byLocale(course.default_locale) ?? course.localizations[0];

  return ok({
    courseId: course.course_id,
    slug: course.slug,
    title: chosen?.title ?? course.slug,
    summary: chosen?.summary ?? "",
    estimatedMinutes: course.estimated_minutes,
    taskCount: course.task_count,
    learningOutcomes: chosen?.learning_outcomes ?? [],
  });
}

/* ── Learning history ───────────────────────────────────────────────────── */

const HistoryEventSchema = z.object({
  event_id: z.string(),
  event_kind: z.string(),
  occurred_at: z.string(),
  ordinal: z.number().nullable(),
  course_id: z.string().nullable(),
  cohort_id: z.string().nullable(),
  task_id: z.string().nullable(),
  question_id: z.string().nullable(),
  course_title: z.string().nullable(),
  task_title: z.string().nullable(),
});

export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

export interface HistoryPage {
  events: HistoryEvent[];
  /** Pass both back as `before*` to fetch the next page. Null = end of list. */
  nextBeforeEventId: string | null;
  nextBeforeOccurredAt: string | null;
  hasMore: boolean;
}

/**
 * The only paginated RPC on this deployment, and it is **keyset**, not offset
 * (RPC_CONTRACTS.md §0.4). Hold `snapshotAt` constant across a paging session
 * for a stable view. Student-only — trainer and admin get 42501.
 */
export async function listMyHistory(args: {
  locale: string;
  limit?: number;
  beforeEventId?: string;
  beforeOccurredAt?: string;
  snapshotAt?: string;
}): Promise<Result<HistoryPage>> {
  const limit = args.limit ?? 20;
  const result = await listMyLearningHistory({
    locale: args.locale,
    // One extra row tells us whether another page exists without a count query.
    limit: limit + 1,
    ...(args.beforeEventId !== undefined ? { beforeEventId: args.beforeEventId } : {}),
    ...(args.beforeOccurredAt !== undefined ? { beforeOccurredAt: args.beforeOccurredAt } : {}),
    ...(args.snapshotAt !== undefined ? { snapshotAt: args.snapshotAt } : {}),
  });
  if (!result.ok) return fail(result);

  const parsed = z.array(HistoryEventSchema).safeParse(result.data);
  if (!parsed.success) return shapeError("Der Verlauf");

  const hasMore = parsed.data.length > limit;
  const events = hasMore ? parsed.data.slice(0, limit) : parsed.data;
  const last = events[events.length - 1];

  return ok({
    events,
    hasMore,
    nextBeforeEventId: hasMore && last ? last.event_id : null,
    nextBeforeOccurredAt: hasMore && last ? last.occurred_at : null,
  });
}

/* ── Certificates ───────────────────────────────────────────────────────── */

const CertificateSchema = z.object({
  id: z.string(),
  certificate_type: z.string(),
  course_id: z.string().nullable(),
  state: z.string(),
  issued_at: z.string().nullable(),
  available_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  media_asset_id: z.string().nullable(),
});

export type Certificate = z.infer<typeof CertificateSchema>;

export async function listMyCertificates(args: { limit?: number; offset?: number } = {}): Promise<
  Result<{ items: Certificate[]; total: number }>
> {
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  const supabase = await createServerClient();

  const result = await fromSupabase<{ rows: unknown[]; count: number }>(async () => {
    const { data, error, count } = await supabase
      .from("certificates")
      .select("*", { count: "exact" })
      .order("issued_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    return { data: error ? null : { rows: data ?? [], count: count ?? 0 }, error };
  });
  if (!result.ok) return fail(result);

  const parsed = z.array(CertificateSchema).safeParse(result.data.rows);
  if (!parsed.success) return shapeError("Die Zertifikate");
  return ok({ items: parsed.data, total: result.data.count });
}
