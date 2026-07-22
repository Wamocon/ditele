"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerClient } from "@/shared/database/server";
import { learnStrings } from "./i18n";
import type { ActionState } from "@/features/admin/action-state";

/**
 * "Jetzt beantworten" and "Später beantworten" — the two commands from
 * FEATURE_BUILD_PLAN §1.6 that had no caller.
 *
 * ⚠️ No `requireRole` here, deliberately, and it is not an omission. These are
 * a LEARNER's own actions on their own enrolment, and the authorisation that
 * matters is not "is this person a learner" but "is this task in a course this
 * person is actually on" — a question only the database can answer.
 * `app_private.resolve_gate_question_context` answers it from
 * `current_actor_pinned_course_context`, so a task id belonging to somebody
 * else's course is refused with 42501 no matter who asks. A role check here
 * would add nothing and would suggest, falsely, that it was the control.
 *
 * ⚠️ `"use server"` modules may only export async functions.
 */

const TaskId = z.string().uuid();

export async function answerGateQuestionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = String(formData.get("locale") ?? "de");
  const s = learnStrings(locale).task;

  const taskId = TaskId.safeParse(formData.get("taskId"));
  if (!taskId.success) return { status: "error", message: s.gateSaveFailed };

  const answerText = String(formData.get("answerText") ?? "").trim();
  if (answerText === "") return { status: "error", message: s.gateAnswerRequired };

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("answer_task_gate_question", {
      p_task_id: taskId.data,
      p_answer_text: answerText,
    });
    if (error) return { status: "error", message: s.gateSaveFailed };

    // Both paths: the task itself shows the answer, and the COURSE page shows
    // the next task unlocking. Revalidating only the task would leave a learner
    // looking at a course list that still says locked.
    revalidatePath(`/${locale}/learn/tasks/${taskId.data}`);
    revalidatePath(`/${locale}/learn/courses`, "layout");
    return { status: "success", message: s.gateAnswered };
  } catch {
    return { status: "error", message: s.gateSaveFailed };
  }
}

export async function skipGateQuestionAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = String(formData.get("locale") ?? "de");
  const s = learnStrings(locale).task;

  const taskId = TaskId.safeParse(formData.get("taskId"));
  if (!taskId.success) return { status: "error", message: s.gateSaveFailed };

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("skip_task_gate_question", {
      p_task_id: taskId.data,
    });
    if (error) return { status: "error", message: s.gateSaveFailed };

    revalidatePath(`/${locale}/learn/tasks/${taskId.data}`);
    return { status: "success", message: s.gateSkippedNotice };
  } catch {
    return { status: "error", message: s.gateSaveFailed };
  }
}
