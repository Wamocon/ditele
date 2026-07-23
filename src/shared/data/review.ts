import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/shared/database/server";
import { createServiceRoleClient } from "@/shared/database/service-role";
import type { Database, Enums } from "@/shared/database/database.types";
import { requirePrincipal } from "@/shared/auth/principal";
import { isStaff } from "@/shared/auth/authorization";
import { err, ok, mapPostgrestError, type Result } from "./result";

/**
 * TRAINER data layer for the clean schema (see ditele_schema.md · TEST_PLAN §5).
 *
 * Reads run through the RLS-scoped server client, so a trainer only ever sees
 * submissions, students and answer keys for the courses they hold in
 * `course_trainers`; staff (trainer/admin) are the only roles RLS lets read the
 * `course_task_answer` / `arena_task_answer` keys at all. The one write path,
 * `reviewSubmission`, re-checks the actor and then uses the service-role client
 * so the XP/badge grants land regardless of the narrower write policies.
 */

export type TaskKind = Enums<"submission_kind">;
export type SubmissionState = Enums<"submission_state">;
export type ReviewDecision = Enums<"review_decision">;

type ServerClient = SupabaseClient<Database>;

/* ── Overview (/trainer) ─────────────────────────────────────────────────── */

export interface TrainerCourseSummary {
  id: string;
  title: string;
  studentCount: number;
}

export interface TrainerOverview {
  queueSize: number;
  courses: TrainerCourseSummary[];
}

/* ── Queue (/trainer/submissions) ────────────────────────────────────────── */

export interface QueueItem {
  id: string;
  studentName: string;
  taskTitle: string;
  taskKind: TaskKind;
  submittedAt: string | null;
}

/* ── Review detail (/trainer/submissions/[id]) ───────────────────────────── */

export interface ReviewOption {
  id: string;
  label: string;
  isCorrect: boolean;
  selected: boolean;
}

export interface ReviewImage {
  id: string;
  url: string | null;
  caption: string;
}

export interface CourseReview {
  title: string;
  description: string;
  mcqQuestion: string | null;
  options: ReviewOption[];
  verificationAnswer: string;
}

export interface ArenaReview {
  title: string;
  description: string;
  acceptanceCriteria: string;
  answerKey: string;
  images: ReviewImage[];
  xpReward: number;
  badgeName: string | null;
}

export interface SubmissionReview {
  id: string;
  taskKind: TaskKind;
  state: SubmissionState;
  responseText: string;
  studentName: string;
  submittedAt: string | null;
  /** Only one of `course` / `arena` is set, matching `taskKind`. */
  course: CourseReview | null;
  arena: ArenaReview | null;
}

/* ── Progress (/trainer/progress) ────────────────────────────────────────── */

export interface ProgressRow {
  studentId: string;
  studentName: string;
  courseTitles: string[];
  acceptedCourseTasks: number;
  acceptedArenaTasks: number;
  totalXp: number;
}

/* ── Review outcome (write) ──────────────────────────────────────────────── */

export interface ReviewOutcome {
  decision: ReviewDecision;
  taskKind: TaskKind;
  /** XP granted by this decision (0 unless an arena task was newly accepted). */
  xpAwarded: number;
  /** Badge granted/held for this arena task, if any. */
  badgeName: string | null;
}

const IMAGE_BUCKET = "submission-images";
const SIGNED_URL_TTL = 60 * 60; // one hour

/** The trainer's assigned course ids (RLS already limits the rows to them). */
async function trainerCourseIds(supabase: ServerClient): Promise<string[]> {
  const { data, error } = await supabase.from("course_trainers").select("course_id");
  if (error || !data) return [];
  return data.map((row) => row.course_id);
}

/* ────────────────────────────────────────────────────────────────────────── */

export async function getTrainerOverview(): Promise<Result<TrainerOverview>> {
  const supabase = await createServerClient();

  const { count, error: countError } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("state", "submitted");
  if (countError) return err(mapPostgrestError(countError));

  const courseIds = await trainerCourseIds(supabase);
  if (courseIds.length === 0) {
    return ok({ queueSize: count ?? 0, courses: [] });
  }

  const [{ data: courseRows, error: courseError }, { data: enrollmentRows, error: enrollmentError }] =
    await Promise.all([
      supabase.from("courses").select("id, title").in("id", courseIds),
      supabase.from("enrollments").select("course_id").in("course_id", courseIds),
    ]);
  if (courseError) return err(mapPostgrestError(courseError));
  if (enrollmentError) return err(mapPostgrestError(enrollmentError));

  const studentsPerCourse = new Map<string, number>();
  for (const row of enrollmentRows ?? []) {
    studentsPerCourse.set(row.course_id, (studentsPerCourse.get(row.course_id) ?? 0) + 1);
  }

  const courses: TrainerCourseSummary[] = (courseRows ?? [])
    .map((course) => ({
      id: course.id,
      title: course.title,
      studentCount: studentsPerCourse.get(course.id) ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "de"));

  return ok({ queueSize: count ?? 0, courses });
}

/* ────────────────────────────────────────────────────────────────────────── */

export async function listReviewQueue(): Promise<Result<QueueItem[]>> {
  const supabase = await createServerClient();

  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("id, student_id, task_kind, course_task_id, arena_task_id, submitted_at")
    .eq("state", "submitted")
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (error) return err(mapPostgrestError(error));
  if (!submissions || submissions.length === 0) return ok([]);

  const studentIds = unique(submissions.map((row) => row.student_id));
  const courseTaskIds = unique(
    submissions.map((row) => row.course_task_id).filter((id): id is string => id !== null)
  );
  const arenaTaskIds = unique(
    submissions.map((row) => row.arena_task_id).filter((id): id is string => id !== null)
  );

  const [names, courseTitles, arenaTitles] = await Promise.all([
    loadNameMap(supabase, studentIds),
    loadTitleMap(supabase, "course_tasks", courseTaskIds),
    loadTitleMap(supabase, "arena_tasks", arenaTaskIds),
  ]);

  const items: QueueItem[] = submissions.map((row) => ({
    id: row.id,
    studentName: names.get(row.student_id) ?? "Unbekannt",
    taskTitle:
      (row.task_kind === "course"
        ? row.course_task_id && courseTitles.get(row.course_task_id)
        : row.arena_task_id && arenaTitles.get(row.arena_task_id)) || "Ohne Titel",
    taskKind: row.task_kind,
    submittedAt: row.submitted_at,
  }));

  return ok(items);
}

/* ────────────────────────────────────────────────────────────────────────── */

export async function getSubmissionForReview(
  submissionId: string
): Promise<Result<SubmissionReview>> {
  const supabase = await createServerClient();

  const { data: submission, error } = await supabase
    .from("submissions")
    .select("id, student_id, task_kind, course_task_id, arena_task_id, response_text, state, submitted_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) return err(mapPostgrestError(error));
  if (!submission) return err({ code: "PGRST116", message: "Einreichung nicht gefunden.", retryable: false });

  const studentName = (await loadNameMap(supabase, [submission.student_id])).get(submission.student_id) ?? "Unbekannt";

  const base = {
    id: submission.id,
    taskKind: submission.task_kind,
    state: submission.state,
    responseText: submission.response_text,
    studentName,
    submittedAt: submission.submitted_at,
  };

  if (submission.task_kind === "course" && submission.course_task_id) {
    const course = await loadCourseReview(supabase, submission.id, submission.course_task_id);
    if (!course.ok) return course;
    return ok({ ...base, course: course.data, arena: null });
  }

  if (submission.task_kind === "arena" && submission.arena_task_id) {
    const arena = await loadArenaReview(supabase, submission.id, submission.arena_task_id);
    if (!arena.ok) return arena;
    return ok({ ...base, course: null, arena: arena.data });
  }

  return err({ code: "22023", message: "Die Einreichung ist unvollständig.", retryable: false });
}

async function loadCourseReview(
  supabase: ServerClient,
  submissionId: string,
  courseTaskId: string
): Promise<Result<CourseReview>> {
  const [taskRes, optionRes, answerRes, selectedRes] = await Promise.all([
    supabase.from("course_tasks").select("title, description, mcq_question").eq("id", courseTaskId).maybeSingle(),
    supabase.from("course_task_options").select("id, label, order_index").eq("course_task_id", courseTaskId).order("order_index"),
    supabase.from("course_task_answer").select("verification_answer, correct_option_ids").eq("course_task_id", courseTaskId).maybeSingle(),
    supabase.from("submission_options").select("option_id").eq("submission_id", submissionId),
  ]);

  if (taskRes.error) return err(mapPostgrestError(taskRes.error));
  if (optionRes.error) return err(mapPostgrestError(optionRes.error));
  if (answerRes.error) return err(mapPostgrestError(answerRes.error));
  if (selectedRes.error) return err(mapPostgrestError(selectedRes.error));

  const task = taskRes.data;
  if (!task) return err({ code: "PGRST116", message: "Aufgabe nicht gefunden.", retryable: false });

  const correctIds = new Set(answerRes.data?.correct_option_ids ?? []);
  const selectedIds = new Set((selectedRes.data ?? []).map((row) => row.option_id));

  const options: ReviewOption[] = (optionRes.data ?? []).map((option) => ({
    id: option.id,
    label: option.label,
    isCorrect: correctIds.has(option.id),
    selected: selectedIds.has(option.id),
  }));

  return ok({
    title: task.title,
    description: task.description,
    mcqQuestion: task.mcq_question,
    options,
    verificationAnswer: answerRes.data?.verification_answer ?? "",
  });
}

async function loadArenaReview(
  supabase: ServerClient,
  submissionId: string,
  arenaTaskId: string
): Promise<Result<ArenaReview>> {
  const [taskRes, answerRes, imageRes] = await Promise.all([
    supabase.from("arena_tasks").select("title, description, xp_reward, badge_id").eq("id", arenaTaskId).maybeSingle(),
    supabase.from("arena_task_answer").select("acceptance_criteria, answer_key").eq("arena_task_id", arenaTaskId).maybeSingle(),
    supabase.from("submission_images").select("id, object_key, caption, order_index").eq("submission_id", submissionId).order("order_index"),
  ]);

  if (taskRes.error) return err(mapPostgrestError(taskRes.error));
  if (answerRes.error) return err(mapPostgrestError(answerRes.error));
  if (imageRes.error) return err(mapPostgrestError(imageRes.error));

  const task = taskRes.data;
  if (!task) return err({ code: "PGRST116", message: "Aufgabe nicht gefunden.", retryable: false });

  const imageRows = imageRes.data ?? [];
  const signedByKey = new Map<string, string>();
  if (imageRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrls(imageRows.map((row) => row.object_key), SIGNED_URL_TTL);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) signedByKey.set(entry.path, entry.signedUrl);
    }
  }

  const images: ReviewImage[] = imageRows.map((row) => ({
    id: row.id,
    url: signedByKey.get(row.object_key) ?? null,
    caption: row.caption,
  }));

  let badgeName: string | null = null;
  if (task.badge_id) {
    const { data: badge } = await supabase.from("badges").select("name").eq("id", task.badge_id).maybeSingle();
    badgeName = badge?.name ?? null;
  }

  return ok({
    title: task.title,
    description: task.description,
    acceptanceCriteria: answerRes.data?.acceptance_criteria ?? "",
    answerKey: answerRes.data?.answer_key ?? "",
    images,
    xpReward: task.xp_reward,
    badgeName,
  });
}

/* ────────────────────────────────────────────────────────────────────────── */

export async function listCourseProgress(): Promise<Result<ProgressRow[]>> {
  const supabase = await createServerClient();

  const courseIds = await trainerCourseIds(supabase);
  if (courseIds.length === 0) return ok([]);

  const [{ data: enrollments, error: enrollmentError }, { data: courseRows, error: courseError }] =
    await Promise.all([
      supabase.from("enrollments").select("student_id, course_id").in("course_id", courseIds),
      supabase.from("courses").select("id, title").in("id", courseIds),
    ]);
  if (enrollmentError) return err(mapPostgrestError(enrollmentError));
  if (courseError) return err(mapPostgrestError(courseError));

  const courseTitleById = new Map((courseRows ?? []).map((row) => [row.id, row.title] as const));

  const coursesByStudent = new Map<string, Set<string>>();
  for (const row of enrollments ?? []) {
    const set = coursesByStudent.get(row.student_id) ?? new Set<string>();
    const title = courseTitleById.get(row.course_id);
    if (title) set.add(title);
    coursesByStudent.set(row.student_id, set);
  }

  const studentIds = [...coursesByStudent.keys()];
  if (studentIds.length === 0) return ok([]);

  const [names, { data: accepted, error: acceptedError }, { data: ledger, error: ledgerError }] =
    await Promise.all([
      loadNameMap(supabase, studentIds),
      supabase
        .from("submissions")
        .select("student_id, task_kind")
        .in("student_id", studentIds)
        .eq("state", "accepted"),
      supabase.from("xp_ledger").select("student_id, amount").in("student_id", studentIds),
    ]);
  if (acceptedError) return err(mapPostgrestError(acceptedError));
  if (ledgerError) return err(mapPostgrestError(ledgerError));

  const courseCount = new Map<string, number>();
  const arenaCount = new Map<string, number>();
  for (const row of accepted ?? []) {
    const target = row.task_kind === "course" ? courseCount : arenaCount;
    target.set(row.student_id, (target.get(row.student_id) ?? 0) + 1);
  }

  const xpByStudent = new Map<string, number>();
  for (const row of ledger ?? []) {
    xpByStudent.set(row.student_id, (xpByStudent.get(row.student_id) ?? 0) + row.amount);
  }

  const rows: ProgressRow[] = studentIds.map((studentId) => ({
    studentId,
    studentName: names.get(studentId) ?? "Unbekannt",
    courseTitles: [...(coursesByStudent.get(studentId) ?? new Set<string>())].sort((a, b) => a.localeCompare(b, "de")),
    acceptedCourseTasks: courseCount.get(studentId) ?? 0,
    acceptedArenaTasks: arenaCount.get(studentId) ?? 0,
    totalXp: xpByStudent.get(studentId) ?? 0,
  }));

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName, "de"));
  return ok(rows);
}

/* ────────────────────────────────────────────────────────────────────────── */

export interface ReviewInput {
  submissionId: string;
  decision: ReviewDecision;
  comment: string;
}

/**
 * Record a trainer's decision and apply its effects. Re-checks the actor
 * (must be staff and able to see the submission through RLS) before writing
 * anything, then runs every write on the service-role client so the XP/badge
 * grants are not blocked by the student-scoped write policies.
 */
export async function reviewSubmission(input: ReviewInput): Promise<Result<ReviewOutcome>> {
  let userId: string;
  try {
    const principal = await requirePrincipal();
    if (!isStaff(principal)) {
      return err({ code: "42501", message: "Keine Berechtigung für diese Aktion.", retryable: false });
    }
    userId = principal.userId;
  } catch {
    return err({ code: "AUTH", message: "Bitte melden Sie sich erneut an.", retryable: true });
  }

  // Authority check: the RLS-scoped client only returns the row if this trainer
  // is assigned to the submission's course. No row → out of scope → refuse.
  const scoped = await createServerClient();
  const { data: submission, error: readError } = await scoped
    .from("submissions")
    .select("id, student_id, task_kind, arena_task_id, state")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (readError) return err(mapPostgrestError(readError));
  if (!submission) {
    return err({ code: "42501", message: "Keine Berechtigung für diese Einreichung.", retryable: false });
  }
  if (submission.state !== "submitted") {
    return err({ code: "22023", message: "Diese Einreichung wurde bereits entschieden.", retryable: false });
  }

  const admin = createServiceRoleClient();

  const { error: reviewError } = await admin.from("reviews").insert({
    submission_id: submission.id,
    trainer_id: userId,
    decision: input.decision,
    comment: input.comment,
  });
  if (reviewError) return err(mapPostgrestError(reviewError));

  const { error: updateError } = await admin
    .from("submissions")
    .update({ state: input.decision, updated_at: new Date().toISOString() })
    .eq("id", submission.id);
  if (updateError) return err(mapPostgrestError(updateError));

  let xpAwarded = 0;
  let badgeName: string | null = null;

  if (input.decision === "accepted" && submission.task_kind === "arena" && submission.arena_task_id) {
    const { data: task } = await admin
      .from("arena_tasks")
      .select("xp_reward, badge_id")
      .eq("id", submission.arena_task_id)
      .maybeSingle();

    if (task) {
      const { data: existingXp } = await admin
        .from("xp_ledger")
        .select("id")
        .eq("student_id", submission.student_id)
        .eq("arena_task_id", submission.arena_task_id)
        .limit(1);

      if (!existingXp || existingXp.length === 0) {
        const { error: xpError } = await admin.from("xp_ledger").insert({
          student_id: submission.student_id,
          arena_task_id: submission.arena_task_id,
          amount: task.xp_reward,
        });
        if (!xpError) xpAwarded = task.xp_reward;
      }

      if (task.badge_id) {
        await admin.from("badge_awards").upsert(
          {
            student_id: submission.student_id,
            badge_id: task.badge_id,
            arena_task_id: submission.arena_task_id,
          },
          { onConflict: "student_id,badge_id", ignoreDuplicates: true }
        );
        const { data: badge } = await admin.from("badges").select("name").eq("id", task.badge_id).maybeSingle();
        badgeName = badge?.name ?? null;
      }
    }
  }

  return ok({ decision: input.decision, taskKind: submission.task_kind, xpAwarded, badgeName });
}

/* ── shared read helpers ─────────────────────────────────────────────────── */

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function loadNameMap(supabase: ServerClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((row) => [row.id, row.display_name] as const));
}

async function loadTitleMap(
  supabase: ServerClient,
  table: "course_tasks" | "arena_tasks",
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  // Branch on a concrete table literal so the typed client resolves a single
  // overload rather than a union of both tables.
  const { data } =
    table === "course_tasks"
      ? await supabase.from("course_tasks").select("id, title").in("id", ids)
      : await supabase.from("arena_tasks").select("id, title").in("id", ids);
  return new Map(
    (data ?? []).map((row: { id: string; title: string }) => [row.id, row.title] as const)
  );
}
