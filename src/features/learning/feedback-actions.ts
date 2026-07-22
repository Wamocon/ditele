"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerClient } from "@/shared/database/server";
import { learnStrings } from "./i18n";
import type { ActionState } from "@/features/admin/action-state";

/**
 * Learner feedback: a task emoji, a course rating. Like the gate-question
 * actions, there is no `requireRole` — the authorisation that matters is "is
 * this task/course one this learner is on", which the SECURITY DEFINER command
 * settles from the learner's pinned course context. A role check would add
 * nothing.
 */

const Uuid = z.string().uuid();
const Sentiment = z.enum(["unhappy", "neutral", "happy"]);

export async function submitTaskFeedbackAction(input: {
  locale: string;
  taskId: string;
  sentiment: string;
}): Promise<ActionState> {
  const s = learnStrings(input.locale).task;
  const taskId = Uuid.safeParse(input.taskId);
  const sentiment = Sentiment.safeParse(input.sentiment);
  if (!taskId.success || !sentiment.success) {
    return { status: "error", message: s.feedbackFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("submit_task_feedback", {
      p_task_id: taskId.data,
      p_sentiment: sentiment.data,
    });
    if (error) return { status: "error", message: s.feedbackFailed };
    revalidatePath(`/${input.locale}/learn/tasks/${taskId.data}`);
    return { status: "success", message: s.feedbackThanks };
  } catch {
    return { status: "error", message: s.feedbackFailed };
  }
}

export async function submitCourseFeedbackAction(input: {
  locale: string;
  courseId: string;
  stars: number;
  comment: string;
}): Promise<ActionState> {
  const s = learnStrings(input.locale).course;
  const courseId = Uuid.safeParse(input.courseId);
  const stars = z.number().int().min(1).max(5).safeParse(input.stars);
  if (!courseId.success || !stars.success) {
    return { status: "error", message: s.feedbackFailed };
  }

  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc("submit_course_feedback", {
      p_course_id: courseId.data,
      p_stars: stars.data,
      p_comment: input.comment.trim().slice(0, 2000),
    });
    if (error) return { status: "error", message: s.feedbackFailed };
    revalidatePath(`/${input.locale}/learn/courses/${courseId.data}`);
    return { status: "success", message: s.feedbackThanks };
  } catch {
    return { status: "error", message: s.feedbackFailed };
  }
}
