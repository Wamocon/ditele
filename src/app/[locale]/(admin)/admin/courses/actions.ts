"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/shared/auth/guard";
import { createServerClient } from "@/shared/database/server";
import { adminStrings } from "@/features/content/i18n";
import type { ActionState } from "@/features/admin/action-state";

/**
 * Writes for the course grid and the assignment screen.
 *
 * ⚠️ Layer 2 of three (MASTER_PLAN §9.3). The `(admin)` layout guard stops a
 * *render*; it does not protect a POST. Each action re-checks the role here, and
 * every RPC below re-checks it again in the database through
 * `app_private.has_permission` — which is the boundary that actually holds,
 * because these are `SECURITY DEFINER` functions and nothing else stands between
 * a caller and another tenant's enrolments.
 *
 * ⚠️ This module is `"use server"`, so it may only export async functions. A
 * non-function export is stripped rather than rejected, and the import then
 * resolves to `undefined` and crashes at render with an unrelated-looking
 * message. Every constant and type lives in `@/features/admin/action-state`.
 */

const Uuid = z.string().uuid();

/** The same shape `duplicate_course` enforces, checked before the round trip. */
const Slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

function courseStrings(locale: string) {
  return adminStrings(locale).courses;
}

function peopleStrings(locale: string) {
  return adminStrings(locale).people;
}

export async function duplicateCourseAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const s = courseStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const slug = Slug.safeParse(formData.get("slug"));
  if (!courseId.success) return { status: "error", message: s.duplicateFailed };
  if (!slug.success) return { status: "error", message: s.duplicateSlugInvalid };

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("duplicate_course", {
      p_source_course_id: courseId.data,
      p_new_slug: slug.data,
    });
    // 23505 is a slug already in use — the one failure an admin can fix
    // themselves, so it gets the specific message rather than the generic one.
    if (error) {
      return {
        status: "error",
        message: error.code === "23505" ? s.duplicateSlugInvalid : s.duplicateFailed,
      };
    }
    revalidatePath(`/${locale}/admin/courses`);
    return { status: "success", message: s.duplicateSuccess };
  } catch {
    return { status: "error", message: s.duplicateFailed };
  }
}

export async function enrolLearnerAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const p = peopleStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const learnerId = Uuid.safeParse(formData.get("userId"));
  if (!courseId.success || !learnerId.success) {
    return { status: "error", message: p.enrolFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("enroll_learner_in_course", {
      p_course_id: courseId.data,
      p_learner_id: learnerId.data,
    });
    if (error) {
      // The command refuses a course with nothing published, on purpose: an
      // enrolment against it would show the learner an empty course. That is
      // the one refusal worth explaining rather than flattening into "failed".
      const unpublished = error.message?.includes("no published content version");
      return {
        status: "error",
        message: unpublished ? p.needsPublishedVersion : p.enrolFailed,
      };
    }
    revalidatePath(`/${locale}/admin/courses/${courseId.data}/people`);
    revalidatePath(`/${locale}/admin/courses`);
    return { status: "success", message: p.enrolSuccess };
  } catch {
    return { status: "error", message: p.enrolFailed };
  }
}

export async function removeLearnerAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const p = peopleStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const learnerId = Uuid.safeParse(formData.get("userId"));
  if (!courseId.success || !learnerId.success) {
    return { status: "error", message: p.unenrolFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("remove_learner_from_course", {
      p_course_id: courseId.data,
      p_learner_id: learnerId.data,
    });
    if (error) return { status: "error", message: p.unenrolFailed };
    revalidatePath(`/${locale}/admin/courses/${courseId.data}/people`);
    revalidatePath(`/${locale}/admin/courses`);
    return { status: "success", message: p.unenrolSuccess };
  } catch {
    return { status: "error", message: p.unenrolFailed };
  }
}

export async function assignTrainerAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const p = peopleStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const trainerId = Uuid.safeParse(formData.get("userId"));
  if (!courseId.success || !trainerId.success) {
    return { status: "error", message: p.trainerAssignFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("assign_trainer_to_course", {
      p_course_id: courseId.data,
      p_trainer_id: trainerId.data,
    });
    if (error) return { status: "error", message: p.trainerAssignFailed };
    revalidatePath(`/${locale}/admin/courses/${courseId.data}/people`);
    revalidatePath(`/${locale}/admin/courses`);
    return { status: "success", message: p.trainerAssigned };
  } catch {
    return { status: "error", message: p.trainerAssignFailed };
  }
}

export async function removeTrainerAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const p = peopleStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const trainerId = Uuid.safeParse(formData.get("userId"));
  if (!courseId.success || !trainerId.success) {
    return { status: "error", message: p.trainerRemoveFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("remove_trainer_from_course", {
      p_course_id: courseId.data,
      p_trainer_id: trainerId.data,
    });
    if (error) return { status: "error", message: p.trainerRemoveFailed };
    revalidatePath(`/${locale}/admin/courses/${courseId.data}/people`);
    revalidatePath(`/${locale}/admin/courses`);
    return { status: "success", message: p.trainerRemoved };
  } catch {
    return { status: "error", message: p.trainerRemoveFailed };
  }
}

export async function assignMentorAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const p = peopleStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const learnerId = Uuid.safeParse(formData.get("learnerId"));
  const trainerId = Uuid.safeParse(formData.get("userId"));
  if (!courseId.success || !learnerId.success || !trainerId.success) {
    return { status: "error", message: p.trainerAssignFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("assign_trainer_to_learner", {
      p_learner_id: learnerId.data,
      p_trainer_id: trainerId.data,
    });
    if (error) return { status: "error", message: p.trainerAssignFailed };
    revalidatePath(`/${locale}/admin/courses/${courseId.data}/people`);
    return { status: "success", message: p.trainerAssigned };
  } catch {
    return { status: "error", message: p.trainerAssignFailed };
  }
}

export async function removeMentorAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole(["admin"]);
  const locale = String(formData.get("locale") ?? "de");
  const p = peopleStrings(locale);

  const courseId = Uuid.safeParse(formData.get("courseId"));
  const learnerId = Uuid.safeParse(formData.get("learnerId"));
  const trainerId = Uuid.safeParse(formData.get("userId"));
  if (!courseId.success || !learnerId.success || !trainerId.success) {
    return { status: "error", message: p.trainerRemoveFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("remove_trainer_from_learner", {
      p_learner_id: learnerId.data,
      p_trainer_id: trainerId.data,
    });
    if (error) return { status: "error", message: p.trainerRemoveFailed };
    revalidatePath(`/${locale}/admin/courses/${courseId.data}/people`);
    return { status: "success", message: p.trainerRemoved };
  } catch {
    return { status: "error", message: p.trainerRemoveFailed };
  }
}
