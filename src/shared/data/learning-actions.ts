"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/shared/database/server";
import { requirePrincipal } from "@/shared/auth/principal";
import type { Database } from "@/shared/database/database.types";
import { computeArenaUnlocks, computeCourseUnlocks, isCourseComplete } from "./unlock";
import { err, mapPostgrestError, ok, type Result } from "./result";

/**
 * Student mutations for the clean schema. Every action re-derives the principal
 * with `requirePrincipal()` — a layout guard stops a render, not a POST, and the
 * database RLS is the real boundary underneath. Writes go only to the student's
 * own rows (`submissions`, `submission_options`, `submission_images`,
 * `task_feedback`, `course_feedback`); the answer-key tables are never touched.
 *
 * A `"use server"` module may only export async functions — the helpers below
 * stay unexported on purpose.
 */

type Supa = SupabaseClient<Database>;

const READ_ONLY = err({
  code: "LOCKED",
  message: "Diese Aufgabe wurde bereits eingereicht und kann nicht mehr geändert werden.",
  retryable: false,
});
const LOCKED_TASK = err({
  code: "LOCKED",
  message: "Diese Aufgabe ist noch gesperrt.",
  retryable: false,
});

async function principalScope(): Promise<Result<{ supabase: Supa; uid: string }>> {
  try {
    const principal = await requirePrincipal();
    const supabase = await createServerClient();
    return ok({ supabase, uid: principal.userId });
  } catch {
    return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });
  }
}

/** Re-check that a course task is actually open before writing to it. */
async function courseTaskUnlocked(supabase: Supa, uid: string, taskId: string): Promise<boolean> {
  const { data: task } = await supabase
    .from("course_tasks")
    .select("course_id")
    .eq("id", taskId)
    .eq("state", "active")
    .maybeSingle();
  if (!task) return false;

  // enrollment gate (also enforced by RLS on the reads below)
  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", uid)
    .eq("course_id", task.course_id)
    .maybeSingle();
  if (!enrolled) return false;

  const { data: siblings } = await supabase
    .from("course_tasks")
    .select("id, order_index, mcq_question, arena_task_id")
    .eq("course_id", task.course_id)
    .eq("state", "active");

  const { data: courseSubs } = await supabase
    .from("submissions")
    .select("course_task_id, state")
    .eq("student_id", uid)
    .eq("task_kind", "course");
  const submitted = new Set<string>();
  for (const row of courseSubs ?? []) {
    if (row.course_task_id && row.state !== "in_progress") submitted.add(row.course_task_id);
  }

  const { data: arenaSubs } = await supabase
    .from("submissions")
    .select("arena_task_id")
    .eq("student_id", uid)
    .eq("task_kind", "arena")
    .eq("state", "accepted");
  const acceptedArena = new Set<string>();
  for (const row of arenaSubs ?? []) if (row.arena_task_id) acceptedArena.add(row.arena_task_id);

  const unlocks = computeCourseUnlocks(
    (siblings ?? []).map((t) => ({
      id: t.id,
      order_index: t.order_index,
      mcq_question: t.mcq_question,
      arena_task_id: t.arena_task_id,
    })),
    submitted,
    acceptedArena,
  );
  return unlocks.get(taskId)?.unlocked ?? false;
}

/** Re-check that an arena task is open (previous accepted) before writing. */
async function arenaTaskUnlocked(supabase: Supa, uid: string, taskId: string): Promise<boolean> {
  const { data: chain } = await supabase
    .from("arena_tasks")
    .select("id, order_index")
    .eq("state", "active");
  if (!(chain ?? []).some((t) => t.id === taskId)) return false;

  const { data: arenaSubs } = await supabase
    .from("submissions")
    .select("arena_task_id")
    .eq("student_id", uid)
    .eq("task_kind", "arena")
    .eq("state", "accepted");
  const acceptedArena = new Set<string>();
  for (const row of arenaSubs ?? []) if (row.arena_task_id) acceptedArena.add(row.arena_task_id);

  const unlocks = computeArenaUnlocks(
    (chain ?? []).map((t) => ({ id: t.id, order_index: t.order_index })),
    acceptedArena,
  );
  return unlocks.get(taskId)?.unlocked ?? false;
}

/* ── course task ─────────────────────────────────────────────────────── */

export async function saveCourseTaskDraft(
  taskId: string,
  payload: { responseText: string; selectedOptionIds: string[] },
): Promise<Result<{ submissionId: string }>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: existing } = await supabase
    .from("submissions")
    .select("id, state")
    .eq("student_id", uid)
    .eq("course_task_id", taskId)
    .maybeSingle();
  if (existing && (existing.state === "submitted" || existing.state === "accepted")) {
    return READ_ONLY;
  }
  if (!(await courseTaskUnlocked(supabase, uid, taskId))) return LOCKED_TASK;

  // A task the trainer sent back stays `needs_revision` while being reworked, so
  // it keeps counting as "answered" and does not re-lock the next task's gate.
  const draftState = existing?.state === "needs_revision" ? "needs_revision" : "in_progress";

  // Keep only option ids that actually belong to this task.
  const { data: optionRows } = await supabase
    .from("course_task_options")
    .select("id")
    .eq("course_task_id", taskId);
  const valid = new Set((optionRows ?? []).map((o) => o.id));
  const selected = [...new Set(payload.selectedOptionIds)].filter((id) => valid.has(id));

  const { data: upserted, error: upsertError } = await supabase
    .from("submissions")
    .upsert(
      {
        student_id: uid,
        task_kind: "course",
        course_task_id: taskId,
        response_text: payload.responseText,
        state: draftState,
      },
      { onConflict: "student_id,course_task_id" },
    )
    .select("id")
    .single();
  if (upsertError || !upserted) return err(mapPostgrestError(upsertError));

  const submissionId = upserted.id;
  const { error: deleteError } = await supabase
    .from("submission_options")
    .delete()
    .eq("submission_id", submissionId);
  if (deleteError) return err(mapPostgrestError(deleteError));

  if (selected.length > 0) {
    const { error: insertError } = await supabase
      .from("submission_options")
      .insert(selected.map((optionId) => ({ submission_id: submissionId, option_id: optionId })));
    if (insertError) return err(mapPostgrestError(insertError));
  }

  return ok({ submissionId });
}

export async function submitCourseTask(taskId: string): Promise<Result<null>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: existing } = await supabase
    .from("submissions")
    .select("id, state")
    .eq("student_id", uid)
    .eq("course_task_id", taskId)
    .maybeSingle();
  if (existing && (existing.state === "submitted" || existing.state === "accepted")) {
    return READ_ONLY;
  }
  if (!(await courseTaskUnlocked(supabase, uid, taskId))) return LOCKED_TASK;

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from("submissions")
      .update({ state: "submitted", submitted_at: now })
      .eq("id", existing.id);
    if (error) return err(mapPostgrestError(error));
  } else {
    const { error } = await supabase.from("submissions").insert({
      student_id: uid,
      task_kind: "course",
      course_task_id: taskId,
      state: "submitted",
      submitted_at: now,
    });
    if (error) return err(mapPostgrestError(error));
  }
  return ok(null);
}

export async function setTaskEmoji(taskId: string, emoji: string): Promise<Result<null>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const trimmed = emoji.trim();
  if (trimmed === "" || [...trimmed].length > 4) {
    return err({ code: "22023", message: "Ungültiges Emoji.", retryable: false });
  }

  // One-time: ignore if the student already left an emoji for this task.
  const { error } = await supabase
    .from("task_feedback")
    .upsert(
      { student_id: uid, course_task_id: taskId, emoji: trimmed },
      { onConflict: "student_id,course_task_id", ignoreDuplicates: true },
    );
  if (error) return err(mapPostgrestError(error));
  return ok(null);
}

/* ── arena task ──────────────────────────────────────────────────────── */

export async function saveArenaDraft(
  taskId: string,
  payload: { responseText: string },
): Promise<Result<{ submissionId: string }>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: existing } = await supabase
    .from("submissions")
    .select("id, state")
    .eq("student_id", uid)
    .eq("arena_task_id", taskId)
    .maybeSingle();
  if (existing && (existing.state === "submitted" || existing.state === "accepted")) {
    return READ_ONLY;
  }
  if (!(await arenaTaskUnlocked(supabase, uid, taskId))) return LOCKED_TASK;

  // Preserve a `needs_revision` hunt's state while it is being reworked.
  const draftState = existing?.state === "needs_revision" ? "needs_revision" : "in_progress";

  const { data: upserted, error } = await supabase
    .from("submissions")
    .upsert(
      {
        student_id: uid,
        task_kind: "arena",
        arena_task_id: taskId,
        response_text: payload.responseText,
        state: draftState,
      },
      { onConflict: "student_id,arena_task_id" },
    )
    .select("id")
    .single();
  if (error || !upserted) return err(mapPostgrestError(error));
  return ok({ submissionId: upserted.id });
}

export async function submitArenaTask(taskId: string): Promise<Result<null>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: existing } = await supabase
    .from("submissions")
    .select("id, state")
    .eq("student_id", uid)
    .eq("arena_task_id", taskId)
    .maybeSingle();
  if (existing && (existing.state === "submitted" || existing.state === "accepted")) {
    return READ_ONLY;
  }
  if (!(await arenaTaskUnlocked(supabase, uid, taskId))) return LOCKED_TASK;

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from("submissions")
      .update({ state: "submitted", submitted_at: now })
      .eq("id", existing.id);
    if (error) return err(mapPostgrestError(error));
  } else {
    const { error } = await supabase.from("submissions").insert({
      student_id: uid,
      task_kind: "arena",
      arena_task_id: taskId,
      state: "submitted",
      submitted_at: now,
    });
    if (error) return err(mapPostgrestError(error));
  }
  return ok(null);
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function extensionFor(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return fromType && /^[a-z0-9]{1,5}$/i.test(fromType) ? fromType.toLowerCase() : "bin";
}

export async function addArenaImage(
  submissionId: string,
  formData: FormData,
): Promise<Result<null>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  const { data: submission } = await supabase
    .from("submissions")
    .select("id, state, student_id, task_kind")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission || submission.student_id !== uid || submission.task_kind !== "arena") {
    return err({ code: "PGRST116", message: "Einreichung nicht gefunden.", retryable: false });
  }
  if (submission.state === "submitted" || submission.state === "accepted") return READ_ONLY;

  const file = formData.get("file");
  const caption = String(formData.get("caption") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) {
    return err({ code: "22023", message: "Bitte ein Bild auswählen.", retryable: false });
  }
  if (!file.type.startsWith("image/")) {
    return err({ code: "22023", message: "Nur Bilddateien sind erlaubt.", retryable: false });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return err({ code: "22023", message: "Das Bild ist zu groß (max. 8 MB).", retryable: false });
  }

  // Storage RLS requires the first path segment to be the student's uid.
  const objectKey = `${uid}/${submissionId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error: uploadError } = await supabase.storage
    .from("submission-images")
    .upload(objectKey, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return err({ code: "STORAGE", message: "Bild-Upload fehlgeschlagen.", retryable: true });
  }

  const { count } = await supabase
    .from("submission_images")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId);

  const { error: insertError } = await supabase.from("submission_images").insert({
    submission_id: submissionId,
    object_key: objectKey,
    caption,
    order_index: count ?? 0,
  });
  if (insertError) return err(mapPostgrestError(insertError));
  return ok(null);
}

/* ── course completion review ────────────────────────────────────────── */

export async function submitCourseReview(
  courseId: string,
  rating: number,
  comment: string,
): Promise<Result<null>> {
  const s = await principalScope();
  if (!s.ok) return s;
  const { supabase, uid } = s.data;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return err({ code: "22023", message: "Bitte eine Bewertung von 1 bis 5 Sternen wählen.", retryable: false });
  }

  // Defensive: only a genuinely finished course may be reviewed.
  const { data: tasks } = await supabase
    .from("course_tasks")
    .select("id")
    .eq("course_id", courseId)
    .eq("state", "active");
  const activeIds = (tasks ?? []).map((t) => t.id);
  const { data: accepted } = await supabase
    .from("submissions")
    .select("course_task_id")
    .eq("student_id", uid)
    .eq("task_kind", "course")
    .eq("state", "accepted");
  const acceptedIds = new Set<string>();
  for (const row of accepted ?? []) if (row.course_task_id) acceptedIds.add(row.course_task_id);
  if (!isCourseComplete(activeIds, acceptedIds)) {
    return err({ code: "22023", message: "Der Kurs ist noch nicht abgeschlossen.", retryable: false });
  }

  const { error: feedbackError } = await supabase.from("course_feedback").insert({
    student_id: uid,
    course_id: courseId,
    rating,
    comment: comment.trim(),
  });
  if (feedbackError) return err(mapPostgrestError(feedbackError));

  // Mark the enrollment completed. RLS only lets an admin write enrollments, so
  // for a student this is a best-effort no-op; the student's completion view is
  // computed from accepted tasks (getCourseCompletion), not from this flag.
  await supabase
    .from("enrollments")
    .update({ state: "completed", completed_at: new Date().toISOString() })
    .eq("student_id", uid)
    .eq("course_id", courseId);

  return ok(null);
}
