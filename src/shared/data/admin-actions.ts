"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";

import { requireRole } from "@/shared/auth/guard";
import { createServerClient } from "@/shared/database/server";
import { createServiceRoleClient } from "@/shared/database/service-role";

import { mapPostgrestError } from "./result";
import type {
  ActionResult,
  CourseInput,
  SaveCourseTaskInput,
  SaveArenaTaskInput,
  BadgeInput,
  CreateUserInput,
  OwnProfileInput,
  CourseState,
  UserRole,
} from "./admin";

/**
 * Every mutation the admin vertical performs, as Server Actions.
 *
 * ⚠️ Layer 2 of three (MASTER_PLAN §9.3): the `(admin)` layout guard stops a
 * render, not a POST. Each action re-checks `requireRole(["admin"], locale)`
 * before writing. The database RLS admin policies (`app.is_admin()`) are the
 * real boundary and hold regardless.
 *
 * A `"use server"` module may only export async functions — all types and
 * input shapes live in `./admin`.
 */

const Slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const Email = z.string().trim().email();
const CourseStateEnum = z.enum(["active", "inactive", "archived", "deleted"]);
const RoleEnum = z.enum(["student", "trainer", "admin"]);

function failFrom(error: PostgrestError): ActionResult {
  return { ok: false, error: mapPostgrestError(error).message };
}
function reject(error: string): ActionResult {
  return { ok: false, error };
}
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/* ====================================================================== */
/* Courses                                                                */
/* ====================================================================== */
export async function createCourseAction(input: CourseInput, locale: string): Promise<ActionResult> {
  const { principal } = await requireRole(["admin"], locale);

  const slug = Slug.safeParse(input.slug);
  if (!slug.success) {
    return reject("Der Kurs-Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.");
  }
  if (!input.title.trim()) return reject("Bitte geben Sie einen Titel ein.");

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      slug: slug.data,
      title: input.title.trim(),
      description: input.description.trim(),
      cover_image_url: emptyToNull(input.cover_image_url),
      intro_video_url: emptyToNull(input.intro_video_url),
      completion_video_url: emptyToNull(input.completion_video_url),
      state: "active",
      created_by: principal.userId,
    })
    .select("id")
    .single();
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/courses`);
  revalidatePath(`/${locale}/admin`);
  return { ok: true, id: data.id };
}

export async function updateCourseAction(id: string, input: CourseInput, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const slug = Slug.safeParse(input.slug);
  if (!slug.success) {
    return reject("Der Kurs-Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.");
  }
  if (!input.title.trim()) return reject("Bitte geben Sie einen Titel ein.");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("courses")
    .update({
      slug: slug.data,
      title: input.title.trim(),
      description: input.description.trim(),
      cover_image_url: emptyToNull(input.cover_image_url),
      intro_video_url: emptyToNull(input.intro_video_url),
      completion_video_url: emptyToNull(input.completion_video_url),
    })
    .eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/courses`);
  revalidatePath(`/${locale}/admin/courses/${id}`);
  return { ok: true };
}

export async function setCourseStateAction(id: string, state: CourseState, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const parsed = CourseStateEnum.safeParse(state);
  if (!parsed.success) return reject("Ungültiger Status.");

  const supabase = await createServerClient();
  const { error } = await supabase.from("courses").update({ state: parsed.data }).eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/courses`);
  revalidatePath(`/${locale}/admin/courses/${id}`);
  return { ok: true };
}

/* ====================================================================== */
/* Course tasks                                                           */
/* ====================================================================== */
export async function saveCourseTaskAction(input: SaveCourseTaskInput, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  if (!input.title.trim()) return reject("Bitte geben Sie einen Aufgabentitel ein.");

  const supabase = await createServerClient();
  const base = {
    title: input.title.trim(),
    description: input.description.trim(),
    hint: emptyToNull(input.hint),
    video_before_url: emptyToNull(input.video_before_url),
    video_after_url: emptyToNull(input.video_after_url),
    mcq_question: emptyToNull(input.mcq_question),
    arena_task_id: input.arena_task_id && input.arena_task_id.length > 0 ? input.arena_task_id : null,
  };

  let taskId: string;
  if (input.id) {
    taskId = input.id;
    const { error } = await supabase.from("course_tasks").update(base).eq("id", taskId);
    if (error) return failFrom(error);
  } else {
    const { data: maxRows, error: maxErr } = await supabase
      .from("course_tasks")
      .select("order_index")
      .eq("course_id", input.courseId)
      .order("order_index", { ascending: false })
      .limit(1);
    if (maxErr) return failFrom(maxErr);
    const nextOrder = (maxRows && maxRows[0] ? maxRows[0].order_index : 0) + 1;

    const { data, error } = await supabase
      .from("course_tasks")
      .insert({ course_id: input.courseId, order_index: nextOrder, ...base })
      .select("id")
      .single();
    if (error) return failFrom(error);
    taskId = data.id;
  }

  // Sync options: update existing, insert new, delete removed.
  const { data: existingOpts, error: exErr } = await supabase
    .from("course_task_options")
    .select("id")
    .eq("course_task_id", taskId);
  if (exErr) return failFrom(exErr);

  const existingIds = new Set((existingOpts ?? []).map((o) => o.id));
  const keptIds = new Set<string>();
  const finalOptions: { id: string; is_correct: boolean }[] = [];

  let position = 0;
  for (const opt of input.options) {
    const label = opt.label.trim();
    if (!label) continue;
    position += 1;

    if (opt.id && existingIds.has(opt.id)) {
      const { error } = await supabase
        .from("course_task_options")
        .update({ label, order_index: position })
        .eq("id", opt.id);
      if (error) return failFrom(error);
      keptIds.add(opt.id);
      finalOptions.push({ id: opt.id, is_correct: opt.is_correct });
    } else {
      const { data, error } = await supabase
        .from("course_task_options")
        .insert({ course_task_id: taskId, label, order_index: position })
        .select("id")
        .single();
      if (error) return failFrom(error);
      finalOptions.push({ id: data.id, is_correct: opt.is_correct });
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from("course_task_options").delete().in("id", toDelete);
    if (error) return failFrom(error);
  }

  const correct_option_ids = finalOptions.filter((o) => o.is_correct).map((o) => o.id);
  const { error: ansErr } = await supabase
    .from("course_task_answer")
    .upsert(
      { course_task_id: taskId, verification_answer: input.verification_answer.trim(), correct_option_ids },
      { onConflict: "course_task_id" }
    );
  if (ansErr) return failFrom(ansErr);

  revalidatePath(`/${locale}/admin/courses/${input.courseId}`);
  return { ok: true, id: taskId };
}

export async function deleteCourseTaskAction(id: string, courseId: string, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  const { error } = await supabase.from("course_tasks").delete().eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  return { ok: true };
}

export async function reorderCourseTasksAction(
  courseId: string,
  orderedIds: string[],
  locale: string
): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const supabase = await createServerClient();

  // Two phases because `course_tasks` has unique(course_id, order_index): move
  // everything to distinct temporary negatives first, then to the final values,
  // so no intermediate update ever collides with an existing row.
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    if (!id) continue;
    const { error } = await supabase
      .from("course_tasks")
      .update({ order_index: -(i + 1) })
      .eq("id", id)
      .eq("course_id", courseId);
    if (error) return failFrom(error);
  }
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    if (!id) continue;
    const { error } = await supabase
      .from("course_tasks")
      .update({ order_index: i + 1 })
      .eq("id", id)
      .eq("course_id", courseId);
    if (error) return failFrom(error);
  }

  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  return { ok: true };
}

/* ====================================================================== */
/* Arena tasks                                                            */
/* ====================================================================== */
export async function saveArenaTaskAction(input: SaveArenaTaskInput, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  if (!input.title.trim()) return reject("Bitte geben Sie einen Aufgabentitel ein.");

  const xp = Number.isFinite(input.xp_reward) && input.xp_reward > 0 ? Math.floor(input.xp_reward) : 0;
  const supabase = await createServerClient();
  const base = {
    title: input.title.trim(),
    description: input.description.trim(),
    html_window: input.html_window,
    hint: emptyToNull(input.hint),
    xp_reward: xp,
    badge_id: input.badge_id && input.badge_id.length > 0 ? input.badge_id : null,
  };

  let taskId: string;
  if (input.id) {
    taskId = input.id;
    const { error } = await supabase.from("arena_tasks").update(base).eq("id", taskId);
    if (error) return failFrom(error);
  } else {
    const { data: maxRows, error: maxErr } = await supabase
      .from("arena_tasks")
      .select("order_index")
      .order("order_index", { ascending: false })
      .limit(1);
    if (maxErr) return failFrom(maxErr);
    const nextOrder = (maxRows && maxRows[0] ? maxRows[0].order_index : 0) + 1;

    const { data, error } = await supabase
      .from("arena_tasks")
      .insert({ order_index: nextOrder, ...base })
      .select("id")
      .single();
    if (error) return failFrom(error);
    taskId = data.id;
  }

  const { error: ansErr } = await supabase
    .from("arena_task_answer")
    .upsert(
      {
        arena_task_id: taskId,
        acceptance_criteria: input.acceptance_criteria.trim(),
        answer_key: input.answer_key.trim(),
      },
      { onConflict: "arena_task_id" }
    );
  if (ansErr) return failFrom(ansErr);

  revalidatePath(`/${locale}/admin/arena`);
  return { ok: true, id: taskId };
}

export async function deleteArenaTaskAction(id: string, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  const { error } = await supabase.from("arena_tasks").delete().eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/arena`);
  return { ok: true };
}

export async function reorderArenaTasksAction(orderedIds: string[], locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  // No unique constraint on arena order_index — sequential writes are safe.
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    if (!id) continue;
    const { error } = await supabase.from("arena_tasks").update({ order_index: i + 1 }).eq("id", id);
    if (error) return failFrom(error);
  }

  revalidatePath(`/${locale}/admin/arena`);
  return { ok: true };
}

/* ====================================================================== */
/* Badges                                                                 */
/* ====================================================================== */
export async function createBadgeAction(input: BadgeInput, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  if (!input.name.trim()) return reject("Bitte geben Sie einen Namen ein.");

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("badges")
    .insert({
      name: input.name.trim(),
      description: input.description.trim(),
      image_url: emptyToNull(input.image_url),
    })
    .select("id")
    .single();
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/badges`);
  return { ok: true, id: data.id };
}

export async function updateBadgeAction(id: string, input: BadgeInput, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  if (!input.name.trim()) return reject("Bitte geben Sie einen Namen ein.");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("badges")
    .update({
      name: input.name.trim(),
      description: input.description.trim(),
      image_url: emptyToNull(input.image_url),
    })
    .eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/badges`);
  return { ok: true };
}

/* ====================================================================== */
/* Users                                                                  */
/* ====================================================================== */
export async function createUserAction(input: CreateUserInput, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const email = Email.safeParse(input.email);
  if (!email.success) return reject("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
  if (!input.name.trim()) return reject("Bitte geben Sie einen Namen ein.");
  const role = RoleEnum.safeParse(input.role);
  if (!role.success) return reject("Ungültige Rolle.");

  // Service-role client: only it may create an auth user. It bypasses RLS.
  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.data,
    password: "123123123",
    email_confirm: true,
  });
  if (error || !data.user) {
    const message = error?.message ?? "";
    return reject(
      /already|registered|exist/i.test(message)
        ? "Für diese E-Mail-Adresse existiert bereits ein Konto."
        : "Der Benutzer konnte nicht erstellt werden."
    );
  }

  // The on_auth_user_created trigger inserts a `student` profile; override it
  // with the chosen role and name.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      { id: data.user.id, role: role.data, display_name: input.name.trim(), locale: "de", is_active: true },
      { onConflict: "id" }
    );
  if (profileError) return failFrom(profileError);

  revalidatePath(`/${locale}/admin/users`);
  return { ok: true, id: data.user.id };
}

export async function updateUserRoleAction(id: string, role: UserRole, locale: string): Promise<ActionResult> {
  const { principal } = await requireRole(["admin"], locale);

  const parsed = RoleEnum.safeParse(role);
  if (!parsed.success) return reject("Ungültige Rolle.");
  if (id === principal.userId && parsed.data !== "admin") {
    return reject("Sie können Ihre eigene Administratorrolle nicht entfernen.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("profiles").update({ role: parsed.data }).eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/users/${id}`);
  return { ok: true };
}

export async function setUserActiveAction(id: string, active: boolean, locale: string): Promise<ActionResult> {
  const { principal } = await requireRole(["admin"], locale);

  if (id === principal.userId && !active) {
    return reject("Sie können Ihr eigenes Konto nicht deaktivieren.");
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/users`);
  revalidatePath(`/${locale}/admin/users/${id}`);
  return { ok: true };
}

/* ====================================================================== */
/* People per course                                                      */
/* ====================================================================== */
export async function enrollStudentAction(courseId: string, studentId: string, locale: string): Promise<ActionResult> {
  const { principal } = await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("enrollments")
    .insert({ course_id: courseId, student_id: studentId, assigned_by: principal.userId });
  if (error) {
    if (error.code === "23505") return reject("Diese Person ist bereits eingeschrieben.");
    return failFrom(error);
  }

  revalidatePath(`/${locale}/admin/courses/${courseId}/people`);
  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  return { ok: true };
}

export async function removeStudentAction(courseId: string, studentId: string, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("course_id", courseId)
    .eq("student_id", studentId);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/courses/${courseId}/people`);
  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  return { ok: true };
}

export async function addTrainerAction(courseId: string, trainerId: string, locale: string): Promise<ActionResult> {
  const { principal } = await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("course_trainers")
    .insert({ course_id: courseId, trainer_id: trainerId, assigned_by: principal.userId });
  if (error) {
    if (error.code === "23505") return reject("Diese Person ist bereits als Trainer zugewiesen.");
    return failFrom(error);
  }

  revalidatePath(`/${locale}/admin/courses/${courseId}/people`);
  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  return { ok: true };
}

export async function removeTrainerAction(courseId: string, trainerId: string, locale: string): Promise<ActionResult> {
  await requireRole(["admin"], locale);

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("course_trainers")
    .delete()
    .eq("course_id", courseId)
    .eq("trainer_id", trainerId);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/courses/${courseId}/people`);
  revalidatePath(`/${locale}/admin/courses/${courseId}`);
  return { ok: true };
}

/* ====================================================================== */
/* Own profile                                                            */
/* ====================================================================== */
export async function updateOwnProfileAction(input: OwnProfileInput, locale: string): Promise<ActionResult> {
  const { principal } = await requireRole(["admin"], locale);

  if (!input.display_name.trim()) return reject("Bitte geben Sie einen Anzeigenamen ein.");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: input.display_name.trim(), avatar_url: emptyToNull(input.avatar_url) })
    .eq("id", principal.userId);
  if (error) return failFrom(error);

  revalidatePath(`/${locale}/admin/profile`);
  return { ok: true };
}
