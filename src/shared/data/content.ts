import "server-only";

import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, err, mapPostgrestError, type Result } from "./result";
import { newCorrelationId, DEFAULT_ORGANIZATION_ID } from "./rpc";
import {
  CONTENT_LOCALES,
  type AdminCourseDetail,
  type AdminCourseRow,
  type ContentVersionState,
  type ContentVersionSummary,
  type CourseLocalization,
  type RecordState,
  type ScenarioOption,
  type SkillOption,
  type StudioStage,
  type StudioTask,
  type StudioWorkspace,
  type TaskInventoryRow,
} from "@/features/content/model";

/**
 * WS-5 — admin content authoring.
 *
 * Two write paths, and mixing them up is the mistake to avoid:
 *
 *  1. **Authoring** — plain DML on `courses`, `course_localizations`,
 *     `content_versions`, `stages`, `stage_localizations`, `tasks`,
 *     `task_localizations`, `task_hints`, `task_options`, `task_assessments`,
 *     `task_option_answers`, `task_skill_mappings`. All verified writable by an
 *     admin session (`scripts/ws5-probe2.mjs`). The RLS policies join through the
 *     parent row to the course, so **the parent must exist before the child**.
 *
 *  2. **Lifecycle** — `submit_content_for_review`, `decide_content_review`,
 *     `publish_content_version`, `archive_content_version`. These are the only
 *     way a version changes state, they run the readiness assertions, and they
 *     write their own `audit_events` rows (which the app itself cannot — I-015).
 *
 * Every lifecycle call needs the version's **current** `row_version`; each call
 * bumps it. Read it immediately before calling, never cache it across a request.
 */

/** `length(p_idempotency_key) between 16 and 200` is enforced by every lifecycle RPC. */
function contentKey(operation: string, versionId: string, rowVersion: number): string {
  return `content-${operation}-${versionId}-${rowVersion}`.slice(0, 200);
}

type Row = Record<string, unknown>;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const asNumber = (value: unknown): number => (typeof value === "number" ? value : 0);
const asNullableNumber = (value: unknown): number | null =>
  typeof value === "number" ? value : null;
const asBoolean = (value: unknown): boolean => value === true;
const asMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Row)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
};
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

function localizedTitle(rows: Row[], id: string, key: string, locale: string): string {
  const forId = rows.filter((row) => row[key] === id);
  const match =
    forId.find((row) => row.locale === locale) ??
    forId.find((row) => row.locale === "de") ??
    forId[0];
  return asString(match?.title);
}

/* ── Reads: course list ───────────────────────────────────────────────── */

export interface CourseListQuery {
  search?: string;
  state?: string;
  locale: string;
  limit?: number;
  offset?: number;
}

export interface CourseListResult {
  rows: AdminCourseRow[];
  total: number;
}

export async function listAdminCourses(query: CourseListQuery): Promise<Result<CourseListResult>> {
  const supabase = await createServerClient();
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;

  let coursesQuery = supabase
    .from("courses")
    .select("id, slug, state, default_locale, estimated_minutes, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (query.state) coursesQuery = coursesQuery.eq("state", query.state as RecordState);

  const { data: courseRows, error, count } = await coursesQuery;
  if (error) return err(mapPostgrestError(error));

  const courses = (courseRows ?? []) as Row[];
  const ids = courses.map((row) => asString(row.id));
  if (ids.length === 0) return ok({ rows: [], total: count ?? 0 });

  const [localizations, versions, tasks] = await Promise.all([
    supabase.from("course_localizations").select("course_id, locale, title").in("course_id", ids),
    supabase
      .from("content_versions")
      .select("id, course_id, version_number, state")
      .in("course_id", ids)
      .order("version_number", { ascending: false }),
    supabase.from("tasks").select("id, course_id").in("course_id", ids),
  ]);

  const localizationRows = (localizations.data ?? []) as Row[];
  const versionRows = (versions.data ?? []) as Row[];
  const taskRows = (tasks.data ?? []) as Row[];

  const rows: AdminCourseRow[] = courses.map((course) => {
    const id = asString(course.id);
    const courseVersions = versionRows.filter((version) => version.course_id === id);
    const latest = courseVersions[0];
    return {
      id,
      slug: asString(course.slug),
      state: asString(course.state) as RecordState,
      defaultLocale: asString(course.default_locale),
      estimatedMinutes: asNullableNumber(course.estimated_minutes),
      updatedAt: asString(course.updated_at),
      title: localizedTitle(localizationRows, id, "course_id", query.locale) || asString(course.slug),
      versionCount: courseVersions.length,
      latestVersionId: latest ? asString(latest.id) : null,
      latestVersionNumber: latest ? asNumber(latest.version_number) : null,
      latestVersionState: latest ? (asString(latest.state) as ContentVersionState) : null,
      taskCount: taskRows.filter((task) => task.course_id === id).length,
    };
  });

  // The search runs on the resolved title, which only exists after the join
  // above, so it cannot be pushed into the SQL query.
  const needle = query.search?.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        (row) => row.title.toLowerCase().includes(needle) || row.slug.toLowerCase().includes(needle)
      )
    : rows;

  return ok({ rows: filtered.slice(offset, offset + limit), total: filtered.length });
}

/* ── Reads: course detail ─────────────────────────────────────────────── */

export async function getAdminCourse(courseId: string): Promise<Result<AdminCourseDetail>> {
  const supabase = await createServerClient();
  const { data: course, error } = await supabase
    .from("courses")
    .select("id, slug, state, default_locale, estimated_minutes, hero_image_url, updated_at")
    .eq("id", courseId)
    .maybeSingle();
  if (error) return err(mapPostgrestError(error));
  if (!course) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });

  const [localizations, versions] = await Promise.all([
    supabase
      .from("course_localizations")
      .select("locale, title, summary, description_html, learning_outcomes, exam_video_url, completion_video_url")
      .eq("course_id", courseId),
    supabase
      .from("content_versions")
      .select("id, version_number, state, change_summary, published_at, row_version")
      .eq("course_id", courseId)
      .order("version_number", { ascending: false }),
  ]);

  const versionRows = (versions.data ?? []) as Row[];
  const versionIds = versionRows.map((row) => asString(row.id));

  const [stages, tasks] = await Promise.all([
    versionIds.length
      ? supabase.from("stages").select("id, content_version_id").in("content_version_id", versionIds)
      : Promise.resolve({ data: [] as Row[] }),
    versionIds.length
      ? supabase.from("tasks").select("id, content_version_id").in("content_version_id", versionIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const stageRows = (stages.data ?? []) as Row[];
  const taskRows = (tasks.data ?? []) as Row[];

  const detail: AdminCourseDetail = {
    id: asString(course.id),
    slug: asString(course.slug),
    state: asString(course.state) as RecordState,
    defaultLocale: asString(course.default_locale),
    estimatedMinutes: asNullableNumber(course.estimated_minutes),
    heroImageUrl: asNullableString(course.hero_image_url) ?? "",
    updatedAt: asString(course.updated_at),
    localizations: ((localizations.data ?? []) as Row[]).map(
      (row): CourseLocalization => ({
        locale: asString(row.locale),
        title: asString(row.title),
        summary: asString(row.summary),
        descriptionHtml: asString(row.description_html),
        learningOutcomes: asStringArray(row.learning_outcomes),
        examVideoUrl: asNullableString(row.exam_video_url) ?? "",
        completionVideoUrl: asNullableString(row.completion_video_url) ?? "",
      })
    ),
    versions: versionRows.map(
      (row): ContentVersionSummary => ({
        id: asString(row.id),
        versionNumber: asNumber(row.version_number),
        state: asString(row.state) as ContentVersionState,
        changeSummary: asNullableString(row.change_summary),
        publishedAt: asNullableString(row.published_at),
        rowVersion: asNumber(row.row_version),
        stageCount: stageRows.filter((stage) => stage.content_version_id === row.id).length,
        taskCount: taskRows.filter((task) => task.content_version_id === row.id).length,
      })
    ),
  };

  return ok(detail);
}

/* ── Reads: the studio workspace ──────────────────────────────────────── */

export async function getStudioWorkspace(
  versionId: string,
  locale: string
): Promise<Result<StudioWorkspace>> {
  const supabase = await createServerClient();
  const { data: version, error } = await supabase
    .from("content_versions")
    .select("id, course_id, version_number, state, change_summary, row_version, published_at")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return err(mapPostgrestError(error));
  if (!version) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });

  const courseId = asString(version.course_id);

  const [course, courseLocalizations, stages, tasks, skills, scenarios, reviews] =
    await Promise.all([
    supabase.from("courses").select("id, slug").eq("id", courseId).maybeSingle(),
    supabase
      .from("course_localizations")
      .select("locale, title, summary, description_html, learning_outcomes, exam_video_url, completion_video_url")
      .eq("course_id", courseId),
    supabase
      .from("stages")
      .select("id, position, state")
      .eq("content_version_id", versionId)
      .order("position"),
    supabase
      .from("tasks")
      .select("id, stage_id, position, task_kind, state, target_url, intro_video_url, video_url, expected_minutes, required_hunt_scenario_id")
      .eq("content_version_id", versionId)
      .order("position"),
    supabase.from("skills").select("id, code, labels").eq("state", "active").order("code"),
    // Active Arena scenarios, for the task editor's gate picker. Only active
    // ones: gating a task on a draft scenario would lock it against something
    // no learner can be sent to.
    supabase
      .from("hunt_scenarios")
      .select("id, code, title")
      .eq("state", "active")
      .order("code"),
    supabase
      .from("content_reviews")
      .select("decision, comment, created_at, expected_content_version_row_version")
      .eq("content_version_id", versionId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const stageRows = (stages.data ?? []) as Row[];
  const taskRows = (tasks.data ?? []) as Row[];
  const stageIds = stageRows.map((row) => asString(row.id));
  const taskIds = taskRows.map((row) => asString(row.id));

  const [
    stageLocalizations,
    taskLocalizations,
    hints,
    options,
    assessments,
    mappings,
    gateQuestions,
  ] = await Promise.all([
      stageIds.length
        ? supabase
            .from("stage_localizations")
            .select("stage_id, locale, title, description_html")
            .in("stage_id", stageIds)
        : Promise.resolve({ data: [] as Row[] }),
      taskIds.length
        ? supabase
            .from("task_localizations")
            .select("task_id, locale, title, instructions_html")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] as Row[] }),
      taskIds.length
        ? supabase
            .from("task_hints")
            .select("id, task_id, position, content_translations")
            .in("task_id", taskIds)
            .order("position")
        : Promise.resolve({ data: [] as Row[] }),
      taskIds.length
        ? supabase
            .from("task_options")
            .select("id, task_id, option_key, position, labels")
            .in("task_id", taskIds)
            .order("position")
        : Promise.resolve({ data: [] as Row[] }),
      taskIds.length
        ? supabase
            .from("task_assessments")
            .select("task_id, question_translations, selection_mode, minimum_selections, maximum_selections")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] as Row[] }),
      taskIds.length
        ? supabase
            .from("task_skill_mappings")
            .select("id, task_id, skill_id, mapping_version, weight_basis_points, evidence_required")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] as Row[] }),
      taskIds.length
        ? supabase
            .from("task_gate_questions")
            .select("task_id, question_translations")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);

  const optionRows = (options.data ?? []) as Row[];
  const optionIds = optionRows.map((row) => asString(row.id));
  const answers = optionIds.length
    ? await supabase
        .from("task_option_answers")
        .select("task_option_id, is_correct")
        .in("task_option_id", optionIds)
    : { data: [] as Row[] };
  const answerRows = (answers.data ?? []) as Row[];

  const stageLocalizationRows = (stageLocalizations.data ?? []) as Row[];
  const taskLocalizationRows = (taskLocalizations.data ?? []) as Row[];
  const hintRows = (hints.data ?? []) as Row[];
  const assessmentRows = (assessments.data ?? []) as Row[];
  const mappingRows = (mappings.data ?? []) as Row[];
  const gateQuestionRows = (gateQuestions.data ?? []) as Row[];

  const buildTask = (row: Row): StudioTask => {
    const id = asString(row.id);
    const assessment = assessmentRows.find((entry) => entry.task_id === id);
    const gate = gateQuestionRows.find((entry) => entry.task_id === id);
    return {
      id,
      requiredHuntScenarioId: asNullableString(row.required_hunt_scenario_id),
      gateQuestion:
        gate && gate.question_translations && typeof gate.question_translations === "object"
          ? (gate.question_translations as Record<string, string>)
          : null,
      stageId: asString(row.stage_id),
      position: asNumber(row.position),
      kind: asString(row.task_kind),
      state: asString(row.state) as RecordState,
      targetUrl: asNullableString(row.target_url),
      startVideoUrl: asNullableString(row.intro_video_url),
      endVideoUrl: asNullableString(row.video_url),
      expectedMinutes: asNullableNumber(row.expected_minutes),
      localizations: taskLocalizationRows
        .filter((entry) => entry.task_id === id)
        .map((entry) => ({
          locale: asString(entry.locale),
          title: asString(entry.title),
          instructionsHtml: asString(entry.instructions_html),
        })),
      hints: hintRows
        .filter((entry) => entry.task_id === id)
        .map((entry) => ({
          id: asString(entry.id),
          position: asNumber(entry.position),
          translations: asMap(entry.content_translations),
        })),
      options: optionRows
        .filter((entry) => entry.task_id === id)
        .map((entry) => ({
          id: asString(entry.id),
          optionKey: asString(entry.option_key),
          position: asNumber(entry.position),
          labels: asMap(entry.labels),
          isCorrect: answerRows.some(
            (answer) => answer.task_option_id === entry.id && asBoolean(answer.is_correct)
          ),
        })),
      assessment: assessment
        ? {
            question: asMap(assessment.question_translations),
            selectionMode: asString(assessment.selection_mode),
            minimumSelections: asNumber(assessment.minimum_selections),
            maximumSelections: asNullableNumber(assessment.maximum_selections),
          }
        : null,
      skills: mappingRows
        .filter((entry) => entry.task_id === id)
        .map((entry) => ({
          id: asString(entry.id),
          skillId: asString(entry.skill_id),
          mappingVersion: asNumber(entry.mapping_version),
          weightBasisPoints: asNumber(entry.weight_basis_points),
          evidenceRequired: asBoolean(entry.evidence_required),
        })),
    };
  };

  const studioStages: StudioStage[] = stageRows.map((row) => {
    const id = asString(row.id);
    return {
      id,
      position: asNumber(row.position),
      state: asString(row.state) as RecordState,
      localizations: stageLocalizationRows
        .filter((entry) => entry.stage_id === id)
        .map((entry) => ({
          locale: asString(entry.locale),
          title: asString(entry.title),
          descriptionHtml: asString(entry.description_html),
        })),
      tasks: taskRows.filter((task) => task.stage_id === id).map(buildTask),
    };
  });

  const courseLocalizationRows = (courseLocalizations.data ?? []) as Row[];
  const reviewRow = ((reviews.data ?? []) as Row[])[0];

  return ok({
    versionId: asString(version.id),
    versionNumber: asNumber(version.version_number),
    versionState: asString(version.state) as ContentVersionState,
    changeSummary: asNullableString(version.change_summary),
    rowVersion: asNumber(version.row_version),
    publishedAt: asNullableString(version.published_at),
    courseId,
    courseSlug: asString(course.data?.slug),
    courseTitle:
      localizedTitle(
        courseLocalizationRows.map((row) => ({ ...row, course_id: courseId })),
        courseId,
        "course_id",
        locale
      ) || asString(course.data?.slug),
    courseLocalizations: courseLocalizationRows.map((row) => ({
      locale: asString(row.locale),
      title: asString(row.title),
      summary: asString(row.summary),
      descriptionHtml: asString(row.description_html),
      learningOutcomes: asStringArray(row.learning_outcomes),
      examVideoUrl: asNullableString(row.exam_video_url) ?? "",
      completionVideoUrl: asNullableString(row.completion_video_url) ?? "",
    })),
    stages: studioStages,
    skills: ((skills.data ?? []) as Row[]).map(
      (row): SkillOption => ({
        id: asString(row.id),
        code: asString(row.code),
        labels: asMap(row.labels),
      })
    ),
    scenarios: ((scenarios.data ?? []) as Row[]).map(
      (row): ScenarioOption => ({
        id: asString(row.id),
        code: asString(row.code),
        // Course material — German, straight from the row.
        title: asString(row.title),
      })
    ),
    latestReview: reviewRow
      ? {
          decision: asString(reviewRow.decision),
          comment: asNullableString(reviewRow.comment),
          createdAt: asString(reviewRow.created_at),
          expectedRowVersion: asNumber(reviewRow.expected_content_version_row_version),
        }
      : null,
  });
}

/* ── Reads: task inventory ────────────────────────────────────────────── */

export interface TaskInventoryQuery {
  search?: string;
  kind?: string;
  locale: string;
  limit?: number;
  offset?: number;
}

export async function listAdminTasks(
  query: TaskInventoryQuery
): Promise<Result<{ rows: TaskInventoryRow[]; total: number }>> {
  const supabase = await createServerClient();
  let tasksQuery = supabase
    .from("tasks")
    .select("id, course_id, stage_id, content_version_id, position, task_kind, state, expected_minutes")
    .order("position");
  if (query.kind) tasksQuery = tasksQuery.eq("task_kind", query.kind);

  const { data, error } = await tasksQuery;
  if (error) return err(mapPostgrestError(error));

  const taskRows = (data ?? []) as Row[];
  if (taskRows.length === 0) return ok({ rows: [], total: 0 });

  const taskIds = taskRows.map((row) => asString(row.id));
  const courseIds = [...new Set(taskRows.map((row) => asString(row.course_id)))];
  const stageIds = [...new Set(taskRows.map((row) => asString(row.stage_id)))];
  const versionIds = [
    ...new Set(taskRows.map((row) => asNullableString(row.content_version_id)).filter(Boolean)),
  ] as string[];

  const [taskLocalizations, courseLocalizations, stageLocalizations, versions] = await Promise.all([
    supabase.from("task_localizations").select("task_id, locale, title").in("task_id", taskIds),
    supabase
      .from("course_localizations")
      .select("course_id, locale, title")
      .in("course_id", courseIds),
    supabase.from("stage_localizations").select("stage_id, locale, title").in("stage_id", stageIds),
    versionIds.length
      ? supabase.from("content_versions").select("id, version_number, state").in("id", versionIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const versionRows = (versions.data ?? []) as Row[];
  const rows: TaskInventoryRow[] = taskRows.map((row) => {
    const id = asString(row.id);
    const versionId = asNullableString(row.content_version_id);
    const version = versionRows.find((entry) => entry.id === versionId);
    return {
      id,
      title:
        localizedTitle((taskLocalizations.data ?? []) as Row[], id, "task_id", query.locale) || id,
      kind: asString(row.task_kind),
      state: asString(row.state) as RecordState,
      expectedMinutes: asNullableNumber(row.expected_minutes),
      courseId: asString(row.course_id),
      courseTitle: localizedTitle(
        (courseLocalizations.data ?? []) as Row[],
        asString(row.course_id),
        "course_id",
        query.locale
      ),
      stageTitle: localizedTitle(
        (stageLocalizations.data ?? []) as Row[],
        asString(row.stage_id),
        "stage_id",
        query.locale
      ),
      versionId,
      versionNumber: version ? asNumber(version.version_number) : null,
      versionState: version ? (asString(version.state) as ContentVersionState) : null,
    };
  });

  const needle = query.search?.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        (row) =>
          row.title.toLowerCase().includes(needle) || row.courseTitle.toLowerCase().includes(needle)
      )
    : rows;

  const limit = query.limit ?? 25;
  const offset = query.offset ?? 0;
  return ok({ rows: filtered.slice(offset, offset + limit), total: filtered.length });
}

/* ── Reads: dashboard ─────────────────────────────────────────────────── */

export interface AdminDashboard {
  users: number;
  courses: number;
  publishedCourses: number;
  draftVersions: number;
  activeCohorts: number;
  pendingReviews: number;
  openRequests: number;
  openIssues: number;
  versionsByState: { state: ContentVersionState; count: number }[];
  /**
   * The sum of `versionsByState`, and the number of distinct courses those
   * versions belong to.
   *
   * Both are reported because the panel sits beside a "Kurse" tile and the two
   * numbers do NOT match — a course carries one content version per revision,
   * so 12 courses were showing as 8+1+4+1 = 14 versions. The figures were right
   * and read as a bug, because nothing on the screen said one panel counted
   * courses and the other counted versions.
   */
  versionTotal: number;
  coursesWithVersions: number;
  activity: { id: string; eventType: string; occurredAt: string; actorRole: string }[];
  activityBlocked: boolean;
}

/**
 * ⚠️ `{ count: "exact", head: true }` silently fails on this PostgREST build
 * (WS-0's note) — it returns an error with an undefined code. Always
 * `.select("*", { count: "exact" }).limit(1)`.
 */
async function countOf(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  table: "profiles" | "courses" | "cohorts" | "submissions" | "enrollments" | "support_issues",
  filter?: { column: string; value: string }
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact" }).limit(1);
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

export async function getAdminDashboard(): Promise<Result<AdminDashboard>> {
  const supabase = await createServerClient();

  const [users, courses, activeCohorts, pendingReviews, openRequests, openIssues] =
    await Promise.all([
      countOf(supabase, "profiles"),
      countOf(supabase, "courses"),
      countOf(supabase, "cohorts", { column: "state", value: "active" }),
      countOf(supabase, "submissions", { column: "state", value: "submitted" }),
      countOf(supabase, "enrollments", { column: "state", value: "requested" }),
      countOf(supabase, "support_issues", { column: "state", value: "open" }),
    ]);

  const { data: versionRows, error } = await supabase
    .from("content_versions")
    .select("id, course_id, state");
  if (error) return err(mapPostgrestError(error));

  const versions = (versionRows ?? []) as Row[];
  const byState = new Map<string, number>();
  for (const version of versions) {
    const state = asString(version.state);
    byState.set(state, (byState.get(state) ?? 0) + 1);
  }

  const { data: auditRows, error: auditError } = await supabase
    .from("audit_events")
    .select("id, event_type, occurred_at, actor_role")
    .order("occurred_at", { ascending: false })
    .limit(8);

  return ok({
    users,
    courses,
    publishedCourses: new Set(
      versions.filter((v) => v.state === "published").map((v) => asString(v.course_id))
    ).size,
    draftVersions: byState.get("draft") ?? 0,
    activeCohorts,
    pendingReviews,
    openRequests,
    openIssues,
    versionsByState: (["draft", "in_review", "published", "archived"] as ContentVersionState[]).map(
      (state) => ({ state, count: byState.get(state) ?? 0 })
    ),
    versionTotal: versions.length,
    coursesWithVersions: new Set(versions.map((v) => asString(v.course_id))).size,
    activity: ((auditRows ?? []) as Row[]).map((row) => ({
      id: asString(row.id),
      eventType: asString(row.event_type),
      occurredAt: asString(row.occurred_at),
      actorRole: asString(row.actor_role),
    })),
    activityBlocked: Boolean(auditError),
  });
}

/* ── Writes: course ───────────────────────────────────────────────────── */

export interface CreateCourseInput {
  slug: string;
  defaultLocale: string;
  estimatedMinutes: number | null;
  /**
   * Course media, from FEATURE_BUILD_PLAN §1.1. The columns landed in Phase 1a
   * (`20260728100000`) and had no input on any screen until now.
   *
   * `heroImageUrl` is on `courses` because a cover image is one image for the
   * course. The two videos are on `course_localizations` because §1.1 marks
   * them translated — the schema keeps a row per locale, even though the studio
   * currently writes German only (CONTENT_LOCALES === ["de"]).
   */
  heroImageUrl: string | null;
  localizations: {
    locale: string;
    title: string;
    summary: string;
    descriptionHtml: string;
    examVideoUrl?: string | null;
    completionVideoUrl?: string | null;
  }[];
}

export async function createCourse(
  input: CreateCourseInput
): Promise<Result<{ courseId: string; versionId: string }>> {
  const supabase = await createServerClient();
  const courseId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  const { error: courseError } = await supabase.from("courses").insert({
    id: courseId,
    organization_id: DEFAULT_ORGANIZATION_ID,
    slug: input.slug,
    default_locale: input.defaultLocale,
    estimated_minutes: input.estimatedMinutes,
    hero_image_url: input.heroImageUrl,
    state: "draft",
  });
  if (courseError) return err(mapPostgrestError(courseError));

  const { error: localizationError } = await supabase.from("course_localizations").insert(
    input.localizations.map((entry) => ({
      course_id: courseId,
      locale: entry.locale,
      title: entry.title,
      summary: entry.summary,
      description_html: entry.descriptionHtml,
      exam_video_url: entry.examVideoUrl ?? null,
      completion_video_url: entry.completionVideoUrl ?? null,
      learning_outcomes: [],
    }))
  );
  if (localizationError) return err(mapPostgrestError(localizationError));

  const { error: versionError } = await supabase.from("content_versions").insert({
    id: versionId,
    course_id: courseId,
    version_number: 1,
    state: "draft",
    change_summary: "Erste Version",
    snapshot: {},
  });
  if (versionError) return err(mapPostgrestError(versionError));

  // Every version carries exactly one stage. Stages are no longer author-facing
  // — tasks are managed directly under the course — but a task still requires a
  // stage_id and the whole snapshot/lock pipeline is built around stages, so one
  // is created automatically and kept out of the studio UI.
  const stage = await createStage({ versionId, courseId });
  if (!stage.ok) return err(stage.error);

  return ok({ courseId, versionId });
}

export async function updateCourseMeta(input: {
  courseId: string;
  slug: string;
  defaultLocale: string;
  estimatedMinutes: number | null;
  /** Undefined leaves it alone; null clears it. */
  heroImageUrl?: string | null;
}): Promise<Result<true>> {
  const supabase = await createServerClient();
  return fromSupabase(async () => {
    const { error } = await supabase
      .from("courses")
      .update({
        slug: input.slug,
        default_locale: input.defaultLocale,
        estimated_minutes: input.estimatedMinutes,
        // Spread so an absent key is genuinely absent: `hero_image_url:
        // undefined` would be serialised as a null by PostgREST and wipe the
        // column on every meta save that did not mention it.
        ...(input.heroImageUrl === undefined ? {} : { hero_image_url: input.heroImageUrl }),
      })
      .eq("id", input.courseId);
    return { data: error ? null : (true as const), error };
  });
}

export async function setCourseState(courseId: string, state: RecordState): Promise<Result<true>> {
  const supabase = await createServerClient();
  return fromSupabase(async () => {
    const { error } = await supabase.from("courses").update({ state }).eq("id", courseId);
    return { data: error ? null : (true as const), error };
  });
}

export async function upsertCourseLocalization(input: {
  courseId: string;
  locale: string;
  title: string;
  summary: string;
  descriptionHtml: string;
  /** The two motivational videos (§1.1). Blank clears them. */
  examVideoUrl?: string;
  completionVideoUrl?: string;
}): Promise<Result<true>> {
  const supabase = await createServerClient();
  const blankToNull = (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    // Blank must become NULL, not "": the protocol CHECK constraints added in
    // 20260728100000 reject an empty string.
    return trimmed === "" ? null : trimmed;
  };
  return fromSupabase(async () => {
    const { error } = await supabase.from("course_localizations").upsert(
      {
        course_id: input.courseId,
        locale: input.locale,
        title: input.title,
        summary: input.summary,
        description_html: input.descriptionHtml,
        exam_video_url: blankToNull(input.examVideoUrl),
        completion_video_url: blankToNull(input.completionVideoUrl),
        learning_outcomes: [],
      },
      { onConflict: "course_id,locale" }
    );
    return { data: error ? null : (true as const), error };
  });
}

export async function createVersion(courseId: string): Promise<Result<{ versionId: string }>> {
  const supabase = await createServerClient();
  const { data: existing, error: readError } = await supabase
    .from("content_versions")
    .select("version_number")
    .eq("course_id", courseId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (readError) return err(mapPostgrestError(readError));

  const latest = ((existing ?? []) as Row[])[0];
  const next = latest ? asNumber(latest.version_number) + 1 : 1;
  const versionId = crypto.randomUUID();
  const { error } = await supabase.from("content_versions").insert({
    id: versionId,
    course_id: courseId,
    version_number: next,
    state: "draft",
    change_summary: `Version ${next}`,
    snapshot: {},
  });
  if (error) return err(mapPostgrestError(error));

  // A new version starts with the same single hidden stage every course has.
  const stage = await createStage({ versionId, courseId });
  if (!stage.ok) return err(stage.error);

  return ok({ versionId });
}

/* ── Writes: stages ───────────────────────────────────────────────────── */

export async function createStage(input: {
  versionId: string;
  courseId: string;
}): Promise<Result<{ stageId: string }>> {
  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("stages")
    .select("position")
    .eq("content_version_id", input.versionId);
  const position = ((existing ?? []) as Row[]).length;
  const stageId = crypto.randomUUID();

  const { error } = await supabase.from("stages").insert({
    id: stageId,
    course_id: input.courseId,
    content_version_id: input.versionId,
    position,
    state: "draft",
  });
  if (error) return err(mapPostgrestError(error));

  // The parent must exist before the child — the RLS policy on the child joins
  // through it. Inserting both in one round trip would fail.
  const { error: localizationError } = await supabase.from("stage_localizations").insert(
    CONTENT_LOCALES.map((locale) => ({
      stage_id: stageId,
      locale,
      title: locale === "de" ? `Stufe ${position + 1}` : "",
      description_html: "",
    }))
  );
  if (localizationError) return err(mapPostgrestError(localizationError));
  return ok({ stageId });
}

export async function upsertStageLocalization(input: {
  stageId: string;
  locale: string;
  title: string;
  descriptionHtml: string;
}): Promise<Result<true>> {
  const supabase = await createServerClient();
  return fromSupabase(async () => {
    const { error } = await supabase.from("stage_localizations").upsert(
      {
        stage_id: input.stageId,
        locale: input.locale,
        title: input.title,
        description_html: input.descriptionHtml,
      },
      { onConflict: "stage_id,locale" }
    );
    return { data: error ? null : (true as const), error };
  });
}

/** Deletes the stage, its localizations and every task it owns. */
export async function deleteStage(stageId: string): Promise<Result<true>> {
  const supabase = await createServerClient();
  const { data: tasks } = await supabase.from("tasks").select("id").eq("stage_id", stageId);
  for (const task of (tasks ?? []) as Row[]) {
    const result = await deleteTask(asString(task.id));
    if (!result.ok) return result;
  }
  const { error: localizationError } = await supabase
    .from("stage_localizations")
    .delete()
    .eq("stage_id", stageId);
  if (localizationError) return err(mapPostgrestError(localizationError));
  const { error } = await supabase.from("stages").delete().eq("id", stageId);
  if (error) return err(mapPostgrestError(error));
  return ok(true);
}

/**
 * Positions must stay contiguous from zero — the readiness assertion rejects a
 * gap. Rewriting the whole list is cheaper than reasoning about swaps, and it
 * repairs a list that is already broken.
 */
export async function reorderStages(versionId: string, orderedIds: string[]): Promise<Result<true>> {
  const supabase = await createServerClient();
  for (const [index, stageId] of orderedIds.entries()) {
    const { error } = await supabase
      .from("stages")
      .update({ position: index })
      .eq("id", stageId)
      .eq("content_version_id", versionId);
    if (error) return err(mapPostgrestError(error));
  }
  return ok(true);
}

/* ── Writes: tasks ────────────────────────────────────────────────────── */

export interface TaskWriteInput {
  taskId: string;
  kind: string;
  expectedMinutes: number | null;
  targetUrl: string | null;
  /** Start/end motivational videos. Optional so existing callers keep compiling;
   *  absent means "leave unchanged" is NOT wanted here — updateTask always writes
   *  them, so callers pass the current value (null clears). */
  startVideoUrl?: string | null;
  endVideoUrl?: string | null;
  /** The Arena gate (FEATURE_BUILD_PLAN §1.6). Optional so `createTask`'s
   *  callers keep compiling; absent and null both mean "no gate". */
  requiredHuntScenarioId?: string | null;
  localizations: { locale: string; title: string; instructionsHtml: string }[];
}

/**
 * The pre-task question, through its command.
 *
 * RPC-only, unlike everything else this module writes: `task_gate_questions`
 * carries no DML grant for `authenticated` (I-003), and
 * `set_task_gate_question` additionally refuses a question that is not present
 * in all three locales — the same rule the snapshot validator applies later, so
 * a bad write is refused with a clear error instead of producing a snapshot
 * that silently fails validation and empties the course (I-041).
 *
 * Passing null removes the question.
 */
export async function setTaskGateQuestion(
  taskId: string,
  translations: Record<string, string> | null
): Promise<Result<true>> {
  const supabase = await createServerClient();
  return fromSupabase(async () => {
    const { error } = await supabase.rpc("set_task_gate_question", {
      p_task_id: taskId,
      p_question_translations: translations,
    });
    return { data: error ? null : (true as const), error };
  });
}

export async function createTask(input: {
  versionId: string;
  courseId: string;
  stageId: string;
}): Promise<Result<{ taskId: string }>> {
  const supabase = await createServerClient();
  const { data: existing } = await supabase.from("tasks").select("position").eq("stage_id", input.stageId);
  const position = ((existing ?? []) as Row[]).length;
  const taskId = crypto.randomUUID();

  const { error } = await supabase.from("tasks").insert({
    id: taskId,
    course_id: input.courseId,
    stage_id: input.stageId,
    content_version_id: input.versionId,
    position,
    task_kind: "knowledge",
    // Task time was removed from the studio; new tasks carry no expected time.
    expected_minutes: null,
    state: "draft",
  });
  if (error) return err(mapPostgrestError(error));

  const { error: localizationError } = await supabase.from("task_localizations").insert(
    CONTENT_LOCALES.map((locale) => ({
      task_id: taskId,
      locale,
      title: locale === "de" ? `Aufgabe ${position + 1}` : "",
      instructions_html: "",
    }))
  );
  if (localizationError) return err(mapPostgrestError(localizationError));
  return ok({ taskId });
}

export async function updateTask(input: TaskWriteInput): Promise<Result<true>> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      task_kind: input.kind,
      expected_minutes: input.expectedMinutes,
      // Only a practical task carries a target; clearing it keeps the snapshot honest.
      target_url: input.kind === "practical" ? input.targetUrl : null,
      // Start (before) / end (after) motivational videos. Blank clears them.
      intro_video_url: input.startVideoUrl ?? null,
      video_url: input.endVideoUrl ?? null,
      // The Arena gate. A hunt task may not gate itself — the database refuses
      // it (`tasks_hunt_does_not_gate_itself`) and a task that did would be
      // unreachable forever — so it is cleared rather than sent for a hunt.
      required_hunt_scenario_id:
        input.kind === "hunt" ? null : (input.requiredHuntScenarioId ?? null),
    })
    .eq("id", input.taskId);
  if (error) return err(mapPostgrestError(error));

  for (const entry of input.localizations) {
    const { error: localizationError } = await supabase.from("task_localizations").upsert(
      {
        task_id: input.taskId,
        locale: entry.locale,
        title: entry.title,
        instructions_html: entry.instructionsHtml,
      },
      { onConflict: "task_id,locale" }
    );
    if (localizationError) return err(mapPostgrestError(localizationError));
  }
  return ok(true);
}

export async function deleteTask(taskId: string): Promise<Result<true>> {
  const supabase = await createServerClient();
  const { data: options } = await supabase.from("task_options").select("id").eq("task_id", taskId);
  const optionIds = ((options ?? []) as Row[]).map((row) => asString(row.id));
  if (optionIds.length) {
    const { error } = await supabase
      .from("task_option_answers")
      .delete()
      .in("task_option_id", optionIds);
    if (error) return err(mapPostgrestError(error));
  }
  for (const table of ["task_options", "task_hints", "task_skill_mappings", "task_assessments", "task_localizations"] as const) {
    const { error } = await supabase.from(table).delete().eq("task_id", taskId);
    if (error) return err(mapPostgrestError(error));
  }
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return err(mapPostgrestError(error));
  return ok(true);
}

export async function reorderTasks(stageId: string, orderedIds: string[]): Promise<Result<true>> {
  const supabase = await createServerClient();
  for (const [index, taskId] of orderedIds.entries()) {
    const { error } = await supabase
      .from("tasks")
      .update({ position: index })
      .eq("id", taskId)
      .eq("stage_id", stageId);
    if (error) return err(mapPostgrestError(error));
  }
  return ok(true);
}

/* ── Writes: hints, skills, assessment ────────────────────────────────── */

export async function setTaskHints(
  taskId: string,
  hints: { translations: Record<string, string> }[]
): Promise<Result<true>> {
  const supabase = await createServerClient();
  const { error: deleteError } = await supabase.from("task_hints").delete().eq("task_id", taskId);
  if (deleteError) return err(mapPostgrestError(deleteError));
  if (hints.length === 0) return ok(true);

  const { error } = await supabase.from("task_hints").insert(
    hints.map((hint, index) => ({
      task_id: taskId,
      position: index,
      content_translations: hint.translations,
    }))
  );
  if (error) return err(mapPostgrestError(error));
  return ok(true);
}

export async function setTaskSkills(
  taskId: string,
  skills: { skillId: string; weightBasisPoints: number; evidenceRequired: boolean }[]
): Promise<Result<true>> {
  const supabase = await createServerClient();
  const { error: deleteError } = await supabase
    .from("task_skill_mappings")
    .delete()
    .eq("task_id", taskId);
  if (deleteError) return err(mapPostgrestError(deleteError));
  if (skills.length === 0) return ok(true);

  const { error } = await supabase.from("task_skill_mappings").insert(
    skills.map((skill) => ({
      task_id: taskId,
      skill_id: skill.skillId,
      // One mapping_version per task, or the competency assertion rejects the set.
      mapping_version: 1,
      weight_basis_points: skill.weightBasisPoints,
      evidence_required: skill.evidenceRequired,
    }))
  );
  if (error) return err(mapPostgrestError(error));
  return ok(true);
}

export interface AssessmentInput {
  question: Record<string, string>;
  selectionMode: "single" | "multiple";
  options: { labels: Record<string, string>; isCorrect: boolean }[];
}

export async function setTaskAssessment(
  taskId: string,
  input: AssessmentInput | null
): Promise<Result<true>> {
  const supabase = await createServerClient();

  const { data: existingOptions } = await supabase
    .from("task_options")
    .select("id")
    .eq("task_id", taskId);
  const existingIds = ((existingOptions ?? []) as Row[]).map((row) => asString(row.id));
  if (existingIds.length) {
    const { error } = await supabase
      .from("task_option_answers")
      .delete()
      .in("task_option_id", existingIds);
    if (error) return err(mapPostgrestError(error));
  }
  const { error: optionDeleteError } = await supabase
    .from("task_options")
    .delete()
    .eq("task_id", taskId);
  if (optionDeleteError) return err(mapPostgrestError(optionDeleteError));

  if (!input || input.options.length === 0) {
    const { error } = await supabase.from("task_assessments").delete().eq("task_id", taskId);
    if (error) return err(mapPostgrestError(error));
    return ok(true);
  }

  const correctCount = input.options.filter((option) => option.isCorrect).length;
  const { error: assessmentError } = await supabase.from("task_assessments").upsert(
    {
      task_id: taskId,
      question_translations: input.question,
      selection_mode: input.selectionMode,
      minimum_selections: input.selectionMode === "single" ? 1 : Math.max(1, correctCount),
      maximum_selections: input.selectionMode === "single" ? 1 : Math.max(1, correctCount),
    },
    { onConflict: "task_id" }
  );
  if (assessmentError) return err(mapPostgrestError(assessmentError));

  const prepared = input.options.map((option, index) => ({
    id: crypto.randomUUID(),
    option,
    index,
  }));
  const { error: insertError } = await supabase.from("task_options").insert(
    prepared.map((entry) => ({
      id: entry.id,
      task_id: taskId,
      option_key: `option-${entry.index + 1}`,
      position: entry.index,
      labels: entry.option.labels,
    }))
  );
  if (insertError) return err(mapPostgrestError(insertError));

  const { error: answerError } = await supabase.from("task_option_answers").insert(
    prepared.map((entry) => ({
      task_option_id: entry.id,
      is_correct: entry.option.isCorrect,
    }))
  );
  if (answerError) return err(mapPostgrestError(answerError));
  return ok(true);
}

/* ── Lifecycle ────────────────────────────────────────────────────────── */

async function currentVersion(
  versionId: string
): Promise<Result<{ rowVersion: number; state: ContentVersionState }>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("content_versions")
    .select("row_version, state")
    .eq("id", versionId)
    .maybeSingle();
  if (error) return err(mapPostgrestError(error));
  if (!data) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  return ok({
    rowVersion: asNumber((data as Row).row_version),
    state: asString((data as Row).state) as ContentVersionState,
  });
}

/**
 * A stale `p_expected_version` HANGS rather than erroring on this deployment
 * (ISSUES.md I-007 / I-009) and poisons the PostgREST pool for ~30s. So every
 * lifecycle call re-reads `row_version` first and refuses to fire when the state
 * is already wrong.
 */
async function guardedLifecycle<T>(
  versionId: string,
  allowedStates: ContentVersionState[],
  run: (rowVersion: number) => Promise<Result<T>>
): Promise<Result<T>> {
  const current = await currentVersion(versionId);
  if (!current.ok) return current;
  if (!allowedStates.includes(current.data.state)) {
    return err({
      code: "STATE",
      message: "Dieser Schritt ist im aktuellen Status nicht möglich. Bitte laden Sie neu.",
      retryable: false,
    });
  }
  return run(current.data.rowVersion);
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const supabase = await createServerClient();
  return fromSupabase<T>(async () => {
    const { data, error } = await supabase.rpc(name as never, args as never);
    return { data: data as T | null, error };
  });
}

export function submitForReview(versionId: string): Promise<Result<unknown>> {
  return guardedLifecycle(versionId, ["draft"], (rowVersion) =>
    callRpc("submit_content_for_review", {
      p_content_version_id: versionId,
      p_expected_version: rowVersion,
      p_correlation_id: newCorrelationId(),
      p_idempotency_key: contentKey("submit", versionId, rowVersion),
    })
  );
}

/**
 * ⚠️ `p_decision` is plain text and only accepts `approved` | `changes_requested`.
 * `approved` does NOT change the state — it stays `in_review` and only bumps
 * `row_version`. `changes_requested` sends it back to `draft`.
 */
export function decideReview(
  versionId: string,
  decision: "approved" | "changes_requested",
  comment: string
): Promise<Result<unknown>> {
  return guardedLifecycle(versionId, ["in_review"], (rowVersion) =>
    callRpc("decide_content_review", {
      p_content_version_id: versionId,
      p_expected_version: rowVersion,
      p_decision: decision,
      p_comment: comment,
      p_correlation_id: newCorrelationId(),
      p_idempotency_key: contentKey(`decide-${decision}`, versionId, rowVersion),
    })
  );
}

export function publishVersion(versionId: string): Promise<Result<unknown>> {
  return guardedLifecycle(versionId, ["in_review"], (rowVersion) =>
    callRpc("publish_content_version", {
      p_content_version_id: versionId,
      p_expected_version: rowVersion,
      p_correlation_id: newCorrelationId(),
      p_idempotency_key: contentKey("publish", versionId, rowVersion),
    })
  );
}

export interface ArchiveImpact {
  fingerprint: string;
  taskCount: number;
  attemptCount: number;
  openAttemptCount: number;
  submissionCount: number;
  pinnedCohortCount: number;
  taskScheduleCount: number;
}

export async function loadArchiveImpact(versionId: string): Promise<Result<ArchiveImpact>> {
  const result = await callRpc<Row>("get_content_archive_impact", {
    p_content_version_id: versionId,
  });
  if (!result.ok) return result;
  const payload = result.data;
  return ok({
    fingerprint: asString(payload.fingerprint),
    taskCount: asNumber(payload.task_count),
    attemptCount: asNumber(payload.attempt_count),
    openAttemptCount: asNumber(payload.open_attempt_count),
    submissionCount: asNumber(payload.submission_count),
    pinnedCohortCount: asNumber(payload.pinned_cohort_count),
    taskScheduleCount: asNumber(payload.task_schedule_count),
  });
}

/** The impact fingerprint is the "you have seen the consequences" interlock. */
export function archiveVersion(
  versionId: string,
  reason: string,
  impactFingerprint: string
): Promise<Result<unknown>> {
  return guardedLifecycle(versionId, ["published"], (rowVersion) =>
    callRpc("archive_content_version", {
      p_content_version_id: versionId,
      p_reason: reason,
      p_impact_fingerprint: impactFingerprint,
      p_expected_version: rowVersion,
      p_correlation_id: newCorrelationId(),
      p_idempotency_key: contentKey("archive", versionId, rowVersion),
    })
  );
}
