import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createServerClient } from "@/shared/database/server";
import type { Tables, Enums } from "@/shared/database/database.types";

import { ok, err, fromSupabase, mapPostgrestError, type Result } from "./result";

/**
 * Admin data layer for the clean Ditele schema (see ditele_schema.md).
 *
 * Read functions here run on the admin's own session (`createServerClient`);
 * the RLS admin policies (`app.is_admin()`) grant full read access, so no
 * service-role client is needed for reads. Mutations live in `admin-actions.ts`
 * as `"use server"` actions that re-check the role before writing.
 *
 * This module is `server-only`. Client components may import the *types* below
 * with `import type` (fully erased at build time) but never a runtime value.
 */

/* ── Row + enum aliases ──────────────────────────────────────────────── */
export type Course = Tables<"courses">;
export type CourseTask = Tables<"course_tasks">;
export type CourseTaskOption = Tables<"course_task_options">;
export type ArenaTask = Tables<"arena_tasks">;
export type Badge = Tables<"badges">;
export type Profile = Tables<"profiles">;

export type CourseState = Enums<"course_state">;
export type TaskState = Enums<"task_state">;
export type UserRole = Enums<"user_role">;

/* ── Composite read shapes ───────────────────────────────────────────── */
export interface CourseTaskAnswer {
  verification_answer: string;
  correct_option_ids: string[];
}
export interface CourseTaskDetail extends CourseTask {
  options: CourseTaskOption[];
  answer: CourseTaskAnswer | null;
}
export interface ArenaTaskAnswer {
  acceptance_criteria: string;
  answer_key: string;
}
export interface ArenaTaskDetail extends ArenaTask {
  answer: ArenaTaskAnswer | null;
}

export interface CourseAssignments {
  students: Profile[];
  trainers: Profile[];
  candidateStudents: Profile[];
  candidateTrainers: Profile[];
}

export interface TaskEmojiFeedbackRow {
  id: string;
  emoji: string;
  created_at: string;
  studentName: string;
  taskTitle: string;
  courseTitle: string;
}

export interface CourseReviewRow {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  studentName: string;
  courseTitle: string;
}

export interface StudentProgressRow {
  key: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  enrollmentState: string;
  acceptedCourseTasks: number;
  acceptedArenaTasks: number;
  totalXp: number;
  badgeCount: number;
}

export interface AdminOverview {
  courses: number;
  activeCourses: number;
  users: number;
  students: number;
  trainers: number;
  admins: number;
  openSubmissions: number;
  arenaTasks: number;
  badges: number;
}

/* ── The `ActionResult` shape shared with admin-actions.ts ───────────── */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/* ── Action input shapes (built by client components) ────────────────── */
export interface CourseInput {
  slug: string;
  title: string;
  description: string;
  cover_image_url: string;
  intro_video_url: string;
  completion_video_url: string;
}
export interface CourseTaskOptionInput {
  id?: string;
  label: string;
  is_correct: boolean;
}
export interface SaveCourseTaskInput {
  id?: string;
  courseId: string;
  title: string;
  description: string;
  hint: string;
  video_before_url: string;
  video_after_url: string;
  mcq_question: string;
  arena_task_id: string | null;
  verification_answer: string;
  options: CourseTaskOptionInput[];
}
export interface SaveArenaTaskInput {
  id?: string;
  title: string;
  description: string;
  html_window: string;
  hint: string;
  xp_reward: number;
  badge_id: string | null;
  acceptance_criteria: string;
  answer_key: string;
}
export interface BadgeInput {
  name: string;
  description: string;
  image_url: string;
}
export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
}
export interface OwnProfileInput {
  display_name: string;
  avatar_url: string;
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function failed(error: PostgrestError): Result<never> {
  return err(mapPostgrestError(error));
}
function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/* ====================================================================== */
/* Courses                                                                */
/* ====================================================================== */
export async function listCourses(): Promise<Result<Course[]>> {
  const supabase = await createServerClient();
  return fromSupabase<Course[]>(
    async () => await supabase.from("courses").select("*").order("created_at", { ascending: false })
  );
}

export async function getCourse(id: string): Promise<Result<Course>> {
  const supabase = await createServerClient();
  return fromSupabase<Course>(
    async () => await supabase.from("courses").select("*").eq("id", id).single()
  );
}

/* ====================================================================== */
/* Course tasks (+ options + answer)                                      */
/* ====================================================================== */
export async function listCourseTasks(courseId: string): Promise<Result<CourseTaskDetail[]>> {
  const supabase = await createServerClient();

  const tasksRes = await supabase
    .from("course_tasks")
    .select("*")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  if (tasksRes.error) return failed(tasksRes.error);
  const tasks = tasksRes.data ?? [];
  if (tasks.length === 0) return ok([]);

  const ids = tasks.map((t) => t.id);
  const [optsRes, ansRes] = await Promise.all([
    supabase.from("course_task_options").select("*").in("course_task_id", ids).order("order_index", { ascending: true }),
    supabase.from("course_task_answer").select("*").in("course_task_id", ids),
  ]);
  if (optsRes.error) return failed(optsRes.error);
  if (ansRes.error) return failed(ansRes.error);

  const optsByTask = new Map<string, CourseTaskOption[]>();
  for (const o of optsRes.data ?? []) {
    const arr = optsByTask.get(o.course_task_id) ?? [];
    arr.push(o);
    optsByTask.set(o.course_task_id, arr);
  }
  const ansByTask = new Map<string, CourseTaskAnswer>();
  for (const a of ansRes.data ?? []) {
    ansByTask.set(a.course_task_id, {
      verification_answer: a.verification_answer,
      correct_option_ids: a.correct_option_ids,
    });
  }

  return ok(
    tasks.map((t) => ({
      ...t,
      options: optsByTask.get(t.id) ?? [],
      answer: ansByTask.get(t.id) ?? null,
    }))
  );
}

export async function getCourseTask(id: string): Promise<Result<CourseTaskDetail>> {
  const supabase = await createServerClient();

  const taskRes = await supabase.from("course_tasks").select("*").eq("id", id).single();
  if (taskRes.error) return failed(taskRes.error);

  const [optsRes, ansRes] = await Promise.all([
    supabase.from("course_task_options").select("*").eq("course_task_id", id).order("order_index", { ascending: true }),
    supabase.from("course_task_answer").select("*").eq("course_task_id", id).maybeSingle(),
  ]);
  if (optsRes.error) return failed(optsRes.error);
  if (ansRes.error) return failed(ansRes.error);

  const answer = ansRes.data
    ? { verification_answer: ansRes.data.verification_answer, correct_option_ids: ansRes.data.correct_option_ids }
    : null;

  return ok({ ...taskRes.data, options: optsRes.data ?? [], answer });
}

/* ====================================================================== */
/* Arena tasks (+ answer)                                                 */
/* ====================================================================== */
export async function listArenaTasks(): Promise<Result<ArenaTaskDetail[]>> {
  const supabase = await createServerClient();

  const tasksRes = await supabase.from("arena_tasks").select("*").order("order_index", { ascending: true });
  if (tasksRes.error) return failed(tasksRes.error);
  const tasks = tasksRes.data ?? [];
  if (tasks.length === 0) return ok([]);

  const ansRes = await supabase.from("arena_task_answer").select("*").in("arena_task_id", tasks.map((t) => t.id));
  if (ansRes.error) return failed(ansRes.error);

  const ansById = new Map<string, ArenaTaskAnswer>();
  for (const a of ansRes.data ?? []) {
    ansById.set(a.arena_task_id, { acceptance_criteria: a.acceptance_criteria, answer_key: a.answer_key });
  }

  return ok(tasks.map((t) => ({ ...t, answer: ansById.get(t.id) ?? null })));
}

export async function getArenaTask(id: string): Promise<Result<ArenaTaskDetail>> {
  const supabase = await createServerClient();

  const taskRes = await supabase.from("arena_tasks").select("*").eq("id", id).single();
  if (taskRes.error) return failed(taskRes.error);

  const ansRes = await supabase.from("arena_task_answer").select("*").eq("arena_task_id", id).maybeSingle();
  if (ansRes.error) return failed(ansRes.error);

  const answer = ansRes.data
    ? { acceptance_criteria: ansRes.data.acceptance_criteria, answer_key: ansRes.data.answer_key }
    : null;

  return ok({ ...taskRes.data, answer });
}

/* ====================================================================== */
/* Badges                                                                 */
/* ====================================================================== */
export async function listBadges(): Promise<Result<Badge[]>> {
  const supabase = await createServerClient();
  return fromSupabase<Badge[]>(
    async () => await supabase.from("badges").select("*").order("created_at", { ascending: false })
  );
}

/* ====================================================================== */
/* Users / profiles                                                       */
/* ====================================================================== */
export async function listProfiles(): Promise<Result<Profile[]>> {
  const supabase = await createServerClient();
  return fromSupabase<Profile[]>(
    async () => await supabase.from("profiles").select("*").order("display_name", { ascending: true })
  );
}

export async function getProfile(id: string): Promise<Result<Profile>> {
  const supabase = await createServerClient();
  return fromSupabase<Profile>(
    async () => await supabase.from("profiles").select("*").eq("id", id).single()
  );
}

/* ====================================================================== */
/* People per course                                                      */
/* ====================================================================== */
export async function getCourseAssignments(courseId: string): Promise<Result<CourseAssignments>> {
  const supabase = await createServerClient();

  const [enrRes, ctRes, studentsRes, trainersRes] = await Promise.all([
    supabase.from("enrollments").select("student_id").eq("course_id", courseId),
    supabase.from("course_trainers").select("trainer_id").eq("course_id", courseId),
    supabase.from("profiles").select("*").eq("role", "student").order("display_name", { ascending: true }),
    supabase.from("profiles").select("*").eq("role", "trainer").order("display_name", { ascending: true }),
  ]);
  if (enrRes.error) return failed(enrRes.error);
  if (ctRes.error) return failed(ctRes.error);
  if (studentsRes.error) return failed(studentsRes.error);
  if (trainersRes.error) return failed(trainersRes.error);

  const enrolledIds = new Set((enrRes.data ?? []).map((r) => r.student_id));
  const trainerIds = new Set((ctRes.data ?? []).map((r) => r.trainer_id));
  const allStudents = studentsRes.data ?? [];
  const allTrainers = trainersRes.data ?? [];

  return ok({
    students: allStudents.filter((p) => enrolledIds.has(p.id)),
    trainers: allTrainers.filter((p) => trainerIds.has(p.id)),
    candidateStudents: allStudents.filter((p) => !enrolledIds.has(p.id) && p.is_active),
    candidateTrainers: allTrainers.filter((p) => !trainerIds.has(p.id) && p.is_active),
  });
}

/* ====================================================================== */
/* Feedback                                                               */
/* ====================================================================== */
export async function listTaskEmojiFeedback(): Promise<Result<TaskEmojiFeedbackRow[]>> {
  const supabase = await createServerClient();

  const fbRes = await supabase.from("task_feedback").select("*").order("created_at", { ascending: false });
  if (fbRes.error) return failed(fbRes.error);
  const rows = fbRes.data ?? [];
  if (rows.length === 0) return ok([]);

  const studentIds = uniq(rows.map((r) => r.student_id));
  const taskIds = uniq(rows.map((r) => r.course_task_id));

  const [profRes, taskRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", studentIds),
    supabase.from("course_tasks").select("id, title, course_id").in("id", taskIds),
  ]);
  if (profRes.error) return failed(profRes.error);
  if (taskRes.error) return failed(taskRes.error);

  const tasks = taskRes.data ?? [];
  const courseIds = uniq(tasks.map((t) => t.course_id));
  const courseRes = courseIds.length
    ? await supabase.from("courses").select("id, title").in("id", courseIds)
    : { data: [], error: null as PostgrestError | null };
  if (courseRes.error) return failed(courseRes.error);

  const nameById = new Map((profRes.data ?? []).map((p) => [p.id, p.display_name]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const courseTitleById = new Map((courseRes.data ?? []).map((c) => [c.id, c.title]));

  return ok(
    rows.map((r) => {
      const task = taskById.get(r.course_task_id);
      return {
        id: r.id,
        emoji: r.emoji,
        created_at: r.created_at,
        studentName: nameById.get(r.student_id) ?? "—",
        taskTitle: task?.title ?? "—",
        courseTitle: (task && courseTitleById.get(task.course_id)) ?? "—",
      };
    })
  );
}

export async function listCourseReviews(): Promise<Result<CourseReviewRow[]>> {
  const supabase = await createServerClient();

  const cfRes = await supabase.from("course_feedback").select("*").order("created_at", { ascending: false });
  if (cfRes.error) return failed(cfRes.error);
  const rows = cfRes.data ?? [];
  if (rows.length === 0) return ok([]);

  const studentIds = uniq(rows.map((r) => r.student_id));
  const courseIds = uniq(rows.map((r) => r.course_id));

  const [profRes, courseRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", studentIds),
    supabase.from("courses").select("id, title").in("id", courseIds),
  ]);
  if (profRes.error) return failed(profRes.error);
  if (courseRes.error) return failed(courseRes.error);

  const nameById = new Map((profRes.data ?? []).map((p) => [p.id, p.display_name]));
  const courseTitleById = new Map((courseRes.data ?? []).map((c) => [c.id, c.title]));

  return ok(
    rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      studentName: nameById.get(r.student_id) ?? "—",
      courseTitle: courseTitleById.get(r.course_id) ?? "—",
    }))
  );
}

/* ====================================================================== */
/* Progress                                                               */
/* ====================================================================== */
export async function listStudentProgress(): Promise<Result<StudentProgressRow[]>> {
  const supabase = await createServerClient();

  const enrRes = await supabase
    .from("enrollments")
    .select("student_id, course_id, state")
    .order("enrolled_at", { ascending: false });
  if (enrRes.error) return failed(enrRes.error);
  const enrollments = enrRes.data ?? [];
  if (enrollments.length === 0) return ok([]);

  const studentIds = uniq(enrollments.map((e) => e.student_id));
  const courseIds = uniq(enrollments.map((e) => e.course_id));

  const [profRes, courseRes, courseSubsRes, arenaSubsRes, xpRes, badgeRes, courseTasksRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", studentIds),
    supabase.from("courses").select("id, title").in("id", courseIds),
    supabase
      .from("submissions")
      .select("student_id, course_task_id")
      .eq("task_kind", "course")
      .eq("state", "accepted")
      .in("student_id", studentIds),
    supabase
      .from("submissions")
      .select("student_id")
      .eq("task_kind", "arena")
      .eq("state", "accepted")
      .in("student_id", studentIds),
    supabase.from("xp_ledger").select("student_id, amount").in("student_id", studentIds),
    supabase.from("badge_awards").select("student_id").in("student_id", studentIds),
    supabase.from("course_tasks").select("id, course_id").in("course_id", courseIds),
  ]);
  if (profRes.error) return failed(profRes.error);
  if (courseRes.error) return failed(courseRes.error);
  if (courseSubsRes.error) return failed(courseSubsRes.error);
  if (arenaSubsRes.error) return failed(arenaSubsRes.error);
  if (xpRes.error) return failed(xpRes.error);
  if (badgeRes.error) return failed(badgeRes.error);
  if (courseTasksRes.error) return failed(courseTasksRes.error);

  const nameById = new Map((profRes.data ?? []).map((p) => [p.id, p.display_name]));
  const courseTitleById = new Map((courseRes.data ?? []).map((c) => [c.id, c.title]));
  const taskToCourse = new Map((courseTasksRes.data ?? []).map((t) => [t.id, t.course_id]));

  // accepted course tasks per student|course
  const courseTaskCount = new Map<string, number>();
  for (const s of courseSubsRes.data ?? []) {
    if (!s.course_task_id) continue;
    const courseId = taskToCourse.get(s.course_task_id);
    if (!courseId) continue;
    const key = `${s.student_id}|${courseId}`;
    courseTaskCount.set(key, (courseTaskCount.get(key) ?? 0) + 1);
  }
  // accepted arena tasks per student (global chain)
  const arenaCount = new Map<string, number>();
  for (const s of arenaSubsRes.data ?? []) {
    arenaCount.set(s.student_id, (arenaCount.get(s.student_id) ?? 0) + 1);
  }
  const xpByStudent = new Map<string, number>();
  for (const x of xpRes.data ?? []) {
    xpByStudent.set(x.student_id, (xpByStudent.get(x.student_id) ?? 0) + x.amount);
  }
  const badgesByStudent = new Map<string, number>();
  for (const b of badgeRes.data ?? []) {
    badgesByStudent.set(b.student_id, (badgesByStudent.get(b.student_id) ?? 0) + 1);
  }

  return ok(
    enrollments.map((e) => ({
      key: `${e.student_id}|${e.course_id}`,
      studentId: e.student_id,
      studentName: nameById.get(e.student_id) ?? "—",
      courseId: e.course_id,
      courseTitle: courseTitleById.get(e.course_id) ?? "—",
      enrollmentState: e.state,
      acceptedCourseTasks: courseTaskCount.get(`${e.student_id}|${e.course_id}`) ?? 0,
      acceptedArenaTasks: arenaCount.get(e.student_id) ?? 0,
      totalXp: xpByStudent.get(e.student_id) ?? 0,
      badgeCount: badgesByStudent.get(e.student_id) ?? 0,
    }))
  );
}

/* ====================================================================== */
/* Overview (dashboard KPIs)                                              */
/* ====================================================================== */
export async function getAdminOverview(): Promise<Result<AdminOverview>> {
  const supabase = await createServerClient();

  const [coursesRes, profilesRes, subsRes, arenaRes, badgesRes] = await Promise.all([
    supabase.from("courses").select("state"),
    supabase.from("profiles").select("role"),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("state", "submitted"),
    supabase.from("arena_tasks").select("id", { count: "exact", head: true }),
    supabase.from("badges").select("id", { count: "exact", head: true }),
  ]);
  if (coursesRes.error) return failed(coursesRes.error);
  if (profilesRes.error) return failed(profilesRes.error);
  if (subsRes.error) return failed(subsRes.error);
  if (arenaRes.error) return failed(arenaRes.error);
  if (badgesRes.error) return failed(badgesRes.error);

  const courses = coursesRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  return ok({
    courses: courses.length,
    activeCourses: courses.filter((c) => c.state === "active").length,
    users: profiles.length,
    students: profiles.filter((p) => p.role === "student").length,
    trainers: profiles.filter((p) => p.role === "trainer").length,
    admins: profiles.filter((p) => p.role === "admin").length,
    openSubmissions: subsRes.count ?? 0,
    arenaTasks: arenaRes.count ?? 0,
    badges: badgesRes.count ?? 0,
  });
}
