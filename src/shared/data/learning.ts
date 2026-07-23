import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/shared/database/server";
import type { Database, Enums } from "@/shared/database/database.types";
import {
  computeArenaUnlocks,
  computeCourseUnlocks,
  isCourseComplete,
  type CourseLockReason,
  type CourseTaskLite,
} from "./unlock";
import { err, ok, type Result } from "./result";

/**
 * Student read layer for the clean schema (see ditele_schema.md).
 *
 * Every function reads through `createServerClient()`, so RLS scopes the rows to
 * the signed-in actor. The `(student)` layout admits trainer + admin too, so we
 * never lean on "RLS returns only my row" — a trainer previewing the learner
 * area would then see everyone. Instead every query filters on the current uid
 * explicitly and the answer-key tables (`course_task_answer`, `arena_task_answer`)
 * and `course_task_options.is_correct` are never queried at all: students must
 * not see the key, and here we simply do not ask for it.
 */

type Supa = SupabaseClient<Database>;
type SubmissionState = Enums<"submission_state">;

async function scope(): Promise<Result<{ supabase: Supa; uid: string }>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });
  }
  return ok({ supabase, uid: data.user.id });
}

/* ── unlock context ──────────────────────────────────────────────────── */

async function fetchCourseSubmissionStates(
  supabase: Supa,
  uid: string,
): Promise<Map<string, SubmissionState>> {
  const { data } = await supabase
    .from("submissions")
    .select("course_task_id, state")
    .eq("student_id", uid)
    .eq("task_kind", "course");
  const map = new Map<string, SubmissionState>();
  for (const row of data ?? []) {
    if (row.course_task_id) map.set(row.course_task_id, row.state);
  }
  return map;
}

async function fetchAcceptedArenaSet(supabase: Supa, uid: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("submissions")
    .select("arena_task_id")
    .eq("student_id", uid)
    .eq("task_kind", "arena")
    .eq("state", "accepted");
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.arena_task_id) set.add(row.arena_task_id);
  }
  return set;
}

/** A course task counts toward the chain gate once it has ever been submitted. */
function submittedSetFrom(states: Map<string, SubmissionState>): Set<string> {
  const set = new Set<string>();
  for (const [id, state] of states) {
    if (state !== "in_progress") set.add(id);
  }
  return set;
}

/* ── view models ─────────────────────────────────────────────────────── */

export interface EarnedBadge {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  awardedAt: string;
}

export interface DashboardCourse {
  enrollmentId: string;
  courseId: string;
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  totalTasks: number;
  acceptedTasks: number;
  completed: boolean;
}

export interface NextTaskRef {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
}

export interface StudentDashboard {
  courses: DashboardCourse[];
  totalXp: number;
  badges: EarnedBadge[];
  nextTask: NextTaskRef | null;
}

export interface CourseSummary {
  enrollmentId: string;
  courseId: string;
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  totalTasks: number;
  acceptedTasks: number;
  completed: boolean;
}

export interface CourseTaskListItem {
  id: string;
  orderIndex: number;
  title: string;
  description: string;
  hasQuestion: boolean;
  hasArena: boolean;
  unlocked: boolean;
  lockReason: CourseLockReason;
  submissionState: SubmissionState | null;
}

export interface CourseDetail {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string;
    coverImageUrl: string | null;
    introVideoUrl: string | null;
  };
  tasks: CourseTaskListItem[];
}

export interface FlatTask {
  id: string;
  courseId: string;
  courseTitle: string;
  orderIndex: number;
  title: string;
  unlocked: boolean;
  lockReason: CourseLockReason;
  submissionState: SubmissionState | null;
}

export interface CourseTaskOption {
  id: string;
  label: string;
}

export interface CourseTaskWorkspaceData {
  task: {
    id: string;
    courseId: string;
    title: string;
    description: string;
    hint: string | null;
    videoBeforeUrl: string | null;
    videoAfterUrl: string | null;
    mcqQuestion: string | null;
  };
  options: CourseTaskOption[];
  submission: {
    id: string;
    state: SubmissionState;
    responseText: string;
    selectedOptionIds: string[];
    submittedAt: string | null;
  } | null;
  emoji: string | null;
  locked: boolean;
  lockReason: CourseLockReason;
}

export interface ArenaListItem {
  id: string;
  orderIndex: number;
  title: string;
  description: string;
  xpReward: number;
  rewardBadge: { id: string; name: string; imageUrl: string | null } | null;
  unlocked: boolean;
  blockingArenaTaskId: string | null;
  submissionState: SubmissionState | null;
}

export interface ArenaOverview {
  tasks: ArenaListItem[];
  totalXp: number;
  badges: EarnedBadge[];
}

export interface ArenaImage {
  id: string;
  url: string | null;
  caption: string;
}

export interface ArenaTaskWorkspaceData {
  task: {
    id: string;
    orderIndex: number;
    title: string;
    description: string;
    htmlWindow: string;
    hint: string | null;
  };
  submission: {
    id: string;
    state: SubmissionState;
    responseText: string;
    submittedAt: string | null;
  } | null;
  images: ArenaImage[];
  locked: boolean;
  blockingArenaTaskId: string | null;
}

export interface EmojiFeedback {
  emoji: string;
  taskTitle: string;
  courseTitle: string;
  createdAt: string;
}

export interface StudentProfile {
  displayName: string;
  avatarUrl: string | null;
  totalXp: number;
  badges: EarnedBadge[];
  feedback: EmojiFeedback[];
}

export interface CourseCompletion {
  complete: boolean;
  completionVideoUrl: string | null;
  hasReview: boolean;
}

/* ── shared fetch pieces ─────────────────────────────────────────────── */

interface EnrolledCourse {
  enrollmentId: string;
  enrollmentState: Enums<"enrollment_state">;
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
}

/** Active courses the student is enrolled in, with the enrollment row. */
async function fetchEnrolledCourses(supabase: Supa, uid: string): Promise<EnrolledCourse[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, course_id, state")
    .eq("student_id", uid);
  const rows = enrollments ?? [];
  if (rows.length === 0) return [];

  const courseIds = rows.map((r) => r.course_id);
  const { data: courses } = await supabase
    .from("courses")
    .select("id, slug, title, description, cover_image_url, state")
    .in("id", courseIds)
    .eq("state", "active");
  const byId = new Map((courses ?? []).map((c) => [c.id, c]));

  const out: EnrolledCourse[] = [];
  for (const e of rows) {
    const c = byId.get(e.course_id);
    if (!c) continue; // course inactive/archived -> hidden from the learner
    out.push({
      enrollmentId: e.id,
      enrollmentState: e.state,
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      coverImageUrl: c.cover_image_url,
    });
  }
  return out;
}

interface CourseTaskRow {
  id: string;
  course_id: string;
  order_index: number;
  title: string;
  description: string;
  mcq_question: string | null;
  arena_task_id: string | null;
}

async function fetchActiveCourseTasks(
  supabase: Supa,
  courseIds: string[],
): Promise<CourseTaskRow[]> {
  if (courseIds.length === 0) return [];
  const { data } = await supabase
    .from("course_tasks")
    .select("id, course_id, order_index, title, description, mcq_question, arena_task_id")
    .in("course_id", courseIds)
    .eq("state", "active")
    .order("order_index", { ascending: true });
  return data ?? [];
}

async function fetchEarnedBadges(supabase: Supa, uid: string): Promise<EarnedBadge[]> {
  const { data: awards } = await supabase
    .from("badge_awards")
    .select("id, badge_id, awarded_at")
    .eq("student_id", uid)
    .order("awarded_at", { ascending: false });
  const rows = awards ?? [];
  if (rows.length === 0) return [];

  const badgeIds = rows.map((r) => r.badge_id);
  const { data: badges } = await supabase
    .from("badges")
    .select("id, name, description, image_url")
    .in("id", badgeIds);
  const byId = new Map((badges ?? []).map((b) => [b.id, b]));

  const out: EarnedBadge[] = [];
  for (const a of rows) {
    const b = byId.get(a.badge_id);
    if (!b) continue;
    out.push({
      id: b.id,
      name: b.name,
      description: b.description,
      imageUrl: b.image_url,
      awardedAt: a.awarded_at,
    });
  }
  return out;
}

async function fetchTotalXp(supabase: Supa, uid: string): Promise<number> {
  const { data } = await supabase.from("xp_ledger").select("amount").eq("student_id", uid);
  return (data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

/** The whole flat task list across the student's active courses, unlock-resolved. */
async function buildFlatTasks(supabase: Supa, uid: string): Promise<FlatTask[]> {
  const courses = await fetchEnrolledCourses(supabase, uid);
  if (courses.length === 0) return [];
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

  const tasks = await fetchActiveCourseTasks(
    supabase,
    courses.map((c) => c.id),
  );
  const submissionStates = await fetchCourseSubmissionStates(supabase, uid);
  const acceptedArena = await fetchAcceptedArenaSet(supabase, uid);
  const submitted = submittedSetFrom(submissionStates);

  // group by course, in course_tasks.order, then compute per-course unlocks
  const byCourse = new Map<string, CourseTaskRow[]>();
  for (const t of tasks) {
    const list = byCourse.get(t.course_id) ?? [];
    list.push(t);
    byCourse.set(t.course_id, list);
  }

  const flat: FlatTask[] = [];
  for (const course of courses) {
    const list = byCourse.get(course.id) ?? [];
    const lite: CourseTaskLite[] = list.map((t) => ({
      id: t.id,
      order_index: t.order_index,
      mcq_question: t.mcq_question,
      arena_task_id: t.arena_task_id,
    }));
    const unlocks = computeCourseUnlocks(lite, submitted, acceptedArena);
    for (const t of list) {
      const u = unlocks.get(t.id);
      flat.push({
        id: t.id,
        courseId: t.course_id,
        courseTitle: courseTitle.get(t.course_id) ?? "",
        orderIndex: t.order_index,
        title: t.title,
        unlocked: u?.unlocked ?? false,
        lockReason: u?.reason ?? null,
        submissionState: submissionStates.get(t.id) ?? null,
      });
    }
  }
  return flat;
}

/* ── public reads ────────────────────────────────────────────────────── */

export async function getStudentDashboard(): Promise<Result<StudentDashboard>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const courses = await fetchEnrolledCourses(supabase, uid);
  const tasks = await fetchActiveCourseTasks(
    supabase,
    courses.map((c) => c.id),
  );
  const submissionStates = await fetchCourseSubmissionStates(supabase, uid);
  const [totalXp, badges] = await Promise.all([
    fetchTotalXp(supabase, uid),
    fetchEarnedBadges(supabase, uid),
  ]);

  const totalByCourse = new Map<string, number>();
  const acceptedByCourse = new Map<string, number>();
  for (const t of tasks) {
    totalByCourse.set(t.course_id, (totalByCourse.get(t.course_id) ?? 0) + 1);
    if (submissionStates.get(t.id) === "accepted") {
      acceptedByCourse.set(t.course_id, (acceptedByCourse.get(t.course_id) ?? 0) + 1);
    }
  }

  const dashboardCourses: DashboardCourse[] = courses.map((c) => {
    const total = totalByCourse.get(c.id) ?? 0;
    const accepted = acceptedByCourse.get(c.id) ?? 0;
    return {
      enrollmentId: c.enrollmentId,
      courseId: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
      totalTasks: total,
      acceptedTasks: accepted,
      completed: total > 0 && accepted === total,
    };
  });

  const flat = await buildFlatTasks(supabase, uid);
  const next = flat.find(
    (t) =>
      t.unlocked &&
      (t.submissionState === null ||
        t.submissionState === "in_progress" ||
        t.submissionState === "needs_revision"),
  );
  const nextTask: NextTaskRef | null = next
    ? { id: next.id, title: next.title, courseId: next.courseId, courseTitle: next.courseTitle }
    : null;

  return ok({ courses: dashboardCourses, totalXp, badges, nextTask });
}

export async function listMyCourses(): Promise<Result<CourseSummary[]>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const courses = await fetchEnrolledCourses(supabase, uid);
  const tasks = await fetchActiveCourseTasks(
    supabase,
    courses.map((c) => c.id),
  );
  const submissionStates = await fetchCourseSubmissionStates(supabase, uid);

  const totalByCourse = new Map<string, number>();
  const acceptedByCourse = new Map<string, number>();
  for (const t of tasks) {
    totalByCourse.set(t.course_id, (totalByCourse.get(t.course_id) ?? 0) + 1);
    if (submissionStates.get(t.id) === "accepted") {
      acceptedByCourse.set(t.course_id, (acceptedByCourse.get(t.course_id) ?? 0) + 1);
    }
  }

  const out: CourseSummary[] = courses.map((c) => {
    const total = totalByCourse.get(c.id) ?? 0;
    const accepted = acceptedByCourse.get(c.id) ?? 0;
    return {
      enrollmentId: c.enrollmentId,
      courseId: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
      totalTasks: total,
      acceptedTasks: accepted,
      completed: (total > 0 && accepted === total) || c.enrollmentState === "completed",
    };
  });
  return ok(out);
}

export async function getMyCourse(courseId: string): Promise<Result<CourseDetail>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, slug, title, description, cover_image_url, intro_video_url, state")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) {
    return err({ code: courseError.code, message: "Kurs konnte nicht geladen werden.", retryable: true });
  }
  if (!course) {
    return err({ code: "PGRST116", message: "Kurs nicht gefunden.", retryable: false });
  }

  const rows = await fetchActiveCourseTasks(supabase, [courseId]);
  const submissionStates = await fetchCourseSubmissionStates(supabase, uid);
  const acceptedArena = await fetchAcceptedArenaSet(supabase, uid);
  const submitted = submittedSetFrom(submissionStates);

  const lite: CourseTaskLite[] = rows.map((t) => ({
    id: t.id,
    order_index: t.order_index,
    mcq_question: t.mcq_question,
    arena_task_id: t.arena_task_id,
  }));
  const unlocks = computeCourseUnlocks(lite, submitted, acceptedArena);

  const tasks: CourseTaskListItem[] = rows.map((t) => {
    const u = unlocks.get(t.id);
    return {
      id: t.id,
      orderIndex: t.order_index,
      title: t.title,
      description: t.description,
      hasQuestion: t.mcq_question !== null && t.mcq_question !== "",
      hasArena: t.arena_task_id !== null,
      unlocked: u?.unlocked ?? false,
      lockReason: u?.reason ?? null,
      submissionState: submissionStates.get(t.id) ?? null,
    };
  });

  return ok({
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      coverImageUrl: course.cover_image_url,
      introVideoUrl: course.intro_video_url,
    },
    tasks,
  });
}

export async function listMyTasks(): Promise<Result<FlatTask[]>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;
  return ok(await buildFlatTasks(supabase, uid));
}

export async function getMyCourseTask(
  taskId: string,
): Promise<Result<CourseTaskWorkspaceData>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: task, error: taskError } = await supabase
    .from("course_tasks")
    .select(
      "id, course_id, order_index, title, description, hint, video_before_url, video_after_url, mcq_question, arena_task_id, state",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (taskError) {
    return err({ code: taskError.code, message: "Aufgabe konnte nicht geladen werden.", retryable: true });
  }
  if (!task || task.state !== "active") {
    return err({ code: "PGRST116", message: "Aufgabe nicht gefunden.", retryable: false });
  }

  // MCQ options — label only. `is_correct` is not a column here; the key lives
  // in course_task_answer, which students have no RLS policy to read.
  const { data: optionRows } = await supabase
    .from("course_task_options")
    .select("id, label")
    .eq("course_task_id", taskId)
    .order("order_index", { ascending: true });
  const options: CourseTaskOption[] = (optionRows ?? []).map((o) => ({ id: o.id, label: o.label }));

  // unlock state for this task inside its course
  const siblings = await fetchActiveCourseTasks(supabase, [task.course_id]);
  const submissionStates = await fetchCourseSubmissionStates(supabase, uid);
  const acceptedArena = await fetchAcceptedArenaSet(supabase, uid);
  const submitted = submittedSetFrom(submissionStates);
  const unlocks = computeCourseUnlocks(
    siblings.map((t) => ({
      id: t.id,
      order_index: t.order_index,
      mcq_question: t.mcq_question,
      arena_task_id: t.arena_task_id,
    })),
    submitted,
    acceptedArena,
  );
  const unlock = unlocks.get(taskId);
  const locked = !(unlock?.unlocked ?? false);

  // current submission (+ selected options)
  const { data: submissionRow } = await supabase
    .from("submissions")
    .select("id, state, response_text, submitted_at")
    .eq("student_id", uid)
    .eq("course_task_id", taskId)
    .maybeSingle();

  let submission: CourseTaskWorkspaceData["submission"] = null;
  if (submissionRow) {
    const { data: selected } = await supabase
      .from("submission_options")
      .select("option_id")
      .eq("submission_id", submissionRow.id);
    submission = {
      id: submissionRow.id,
      state: submissionRow.state,
      responseText: submissionRow.response_text,
      selectedOptionIds: (selected ?? []).map((r) => r.option_id),
      submittedAt: submissionRow.submitted_at,
    };
  }

  const { data: feedback } = await supabase
    .from("task_feedback")
    .select("emoji")
    .eq("student_id", uid)
    .eq("course_task_id", taskId)
    .maybeSingle();

  return ok({
    task: {
      id: task.id,
      courseId: task.course_id,
      title: task.title,
      description: task.description,
      hint: task.hint,
      videoBeforeUrl: task.video_before_url,
      videoAfterUrl: task.video_after_url,
      mcqQuestion: task.mcq_question,
    },
    options,
    submission,
    emoji: feedback?.emoji ?? null,
    locked,
    lockReason: unlock?.reason ?? null,
  });
}

export async function listMyArena(): Promise<Result<ArenaOverview>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: taskRows, error: taskError } = await supabase
    .from("arena_tasks")
    .select("id, order_index, title, description, xp_reward, badge_id")
    .eq("state", "active")
    .order("order_index", { ascending: true });
  if (taskError) {
    return err({ code: taskError.code, message: "Arena konnte nicht geladen werden.", retryable: true });
  }
  const rows = taskRows ?? [];

  const badgeIds = rows.map((r) => r.badge_id).filter((v): v is string => v !== null);
  const rewardBadges = new Map<string, { id: string; name: string; imageUrl: string | null }>();
  if (badgeIds.length > 0) {
    const { data: badges } = await supabase
      .from("badges")
      .select("id, name, image_url")
      .in("id", badgeIds);
    for (const b of badges ?? []) rewardBadges.set(b.id, { id: b.id, name: b.name, imageUrl: b.image_url });
  }

  const acceptedArena = await fetchAcceptedArenaSet(supabase, uid);
  const { data: arenaSubs } = await supabase
    .from("submissions")
    .select("arena_task_id, state")
    .eq("student_id", uid)
    .eq("task_kind", "arena");
  const stateByTask = new Map<string, SubmissionState>();
  for (const row of arenaSubs ?? []) {
    if (row.arena_task_id) stateByTask.set(row.arena_task_id, row.state);
  }

  const unlocks = computeArenaUnlocks(
    rows.map((t) => ({ id: t.id, order_index: t.order_index })),
    acceptedArena,
  );

  const tasks: ArenaListItem[] = rows.map((t) => {
    const u = unlocks.get(t.id);
    return {
      id: t.id,
      orderIndex: t.order_index,
      title: t.title,
      description: t.description,
      xpReward: t.xp_reward,
      rewardBadge: t.badge_id ? rewardBadges.get(t.badge_id) ?? null : null,
      unlocked: u?.unlocked ?? false,
      blockingArenaTaskId: u?.blockingArenaTaskId ?? null,
      submissionState: stateByTask.get(t.id) ?? null,
    };
  });

  const [totalXp, badges] = await Promise.all([
    fetchTotalXp(supabase, uid),
    fetchEarnedBadges(supabase, uid),
  ]);

  return ok({ tasks, totalXp, badges });
}

export async function getMyArenaTask(
  taskId: string,
): Promise<Result<ArenaTaskWorkspaceData>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: task, error: taskError } = await supabase
    .from("arena_tasks")
    .select("id, order_index, title, description, html_window, hint, state")
    .eq("id", taskId)
    .maybeSingle();
  if (taskError) {
    return err({ code: taskError.code, message: "Arena-Aufgabe konnte nicht geladen werden.", retryable: true });
  }
  if (!task || task.state !== "active") {
    return err({ code: "PGRST116", message: "Arena-Aufgabe nicht gefunden.", retryable: false });
  }

  // unlock: the whole active chain + this student's accepted arena tasks
  const { data: chain } = await supabase
    .from("arena_tasks")
    .select("id, order_index")
    .eq("state", "active")
    .order("order_index", { ascending: true });
  const acceptedArena = await fetchAcceptedArenaSet(supabase, uid);
  const unlocks = computeArenaUnlocks(
    (chain ?? []).map((t) => ({ id: t.id, order_index: t.order_index })),
    acceptedArena,
  );
  const unlock = unlocks.get(taskId);
  const locked = !(unlock?.unlocked ?? false);

  const { data: submissionRow } = await supabase
    .from("submissions")
    .select("id, state, response_text, submitted_at")
    .eq("student_id", uid)
    .eq("arena_task_id", taskId)
    .maybeSingle();

  let submission: ArenaTaskWorkspaceData["submission"] = null;
  let images: ArenaImage[] = [];
  if (submissionRow) {
    submission = {
      id: submissionRow.id,
      state: submissionRow.state,
      responseText: submissionRow.response_text,
      submittedAt: submissionRow.submitted_at,
    };
    const { data: imageRows } = await supabase
      .from("submission_images")
      .select("id, object_key, caption")
      .eq("submission_id", submissionRow.id)
      .order("order_index", { ascending: true });
    const rows = imageRows ?? [];
    if (rows.length > 0) {
      // Private bucket: hand the browser short-lived signed URLs, never keys.
      const { data: signed } = await supabase.storage
        .from("submission-images")
        .createSignedUrls(
          rows.map((r) => r.object_key),
          60 * 60,
        );
      const urlByKey = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
      images = rows.map((r) => ({
        id: r.id,
        caption: r.caption,
        url: urlByKey.get(r.object_key) ?? null,
      }));
    }
  }

  return ok({
    task: {
      id: task.id,
      orderIndex: task.order_index,
      title: task.title,
      description: task.description,
      htmlWindow: task.html_window,
      hint: task.hint,
    },
    submission,
    images,
    locked,
    blockingArenaTaskId: unlock?.blockingArenaTaskId ?? null,
  });
}

export async function getMyProfile(): Promise<Result<StudentProfile>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", uid)
    .maybeSingle();

  const [totalXp, badges] = await Promise.all([
    fetchTotalXp(supabase, uid),
    fetchEarnedBadges(supabase, uid),
  ]);

  const { data: feedbackRows } = await supabase
    .from("task_feedback")
    .select("emoji, course_task_id, created_at")
    .eq("student_id", uid)
    .order("created_at", { ascending: false });
  const fbRows = feedbackRows ?? [];

  const feedback: EmojiFeedback[] = [];
  if (fbRows.length > 0) {
    const taskIds = fbRows.map((r) => r.course_task_id);
    const { data: taskRows } = await supabase
      .from("course_tasks")
      .select("id, title, course_id")
      .in("id", taskIds);
    const taskById = new Map((taskRows ?? []).map((t) => [t.id, t]));
    const courseIds = [...new Set((taskRows ?? []).map((t) => t.course_id))];
    const { data: courseRows } = courseIds.length
      ? await supabase.from("courses").select("id, title").in("id", courseIds)
      : { data: [] as { id: string; title: string }[] };
    const courseById = new Map((courseRows ?? []).map((c) => [c.id, c]));
    for (const r of fbRows) {
      const t = taskById.get(r.course_task_id);
      feedback.push({
        emoji: r.emoji,
        taskTitle: t?.title ?? "",
        courseTitle: t ? courseById.get(t.course_id)?.title ?? "" : "",
        createdAt: r.created_at,
      });
    }
  }

  return ok({
    displayName: profile?.display_name ?? "",
    avatarUrl: profile?.avatar_url ?? null,
    totalXp,
    badges,
    feedback,
  });
}

export async function getCourseCompletion(
  courseId: string,
): Promise<Result<CourseCompletion>> {
  const s = await scope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, completion_video_url")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) {
    return err({ code: courseError.code, message: "Kurs konnte nicht geladen werden.", retryable: true });
  }
  if (!course) {
    return err({ code: "PGRST116", message: "Kurs nicht gefunden.", retryable: false });
  }

  const tasks = await fetchActiveCourseTasks(supabase, [courseId]);
  const activeIds = tasks.map((t) => t.id);
  const submissionStates = await fetchCourseSubmissionStates(supabase, uid);
  const acceptedIds = new Set<string>();
  for (const id of activeIds) {
    if (submissionStates.get(id) === "accepted") acceptedIds.add(id);
  }
  const complete = isCourseComplete(activeIds, acceptedIds);

  const { data: review } = await supabase
    .from("course_feedback")
    .select("id")
    .eq("student_id", uid)
    .eq("course_id", courseId)
    .maybeSingle();

  return ok({
    complete,
    completionVideoUrl: complete ? course.completion_video_url : null,
    hasReview: review !== null,
  });
}
