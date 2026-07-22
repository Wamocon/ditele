import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { fromSupabase, ok, type Result } from "./result";

/**
 * Admin reads of learner feedback. The two enriched functions
 * (`list_task_feedback_for_admin`, `list_course_feedback_for_admin`) are
 * admin-only and join in the titles and names the screen shows, so this module
 * only shapes their rows.
 */

export interface AdminTaskFeedback {
  taskId: string;
  taskTitle: string;
  sentiment: "unhappy" | "neutral" | "happy" | string;
  learnerName: string;
  submittedAt: string | null;
}

export interface AdminCourseFeedback {
  courseId: string;
  courseTitle: string;
  stars: number;
  comment: string;
  learnerName: string;
  submittedAt: string | null;
}

const TaskRow = z.object({
  task_id: z.string(),
  task_title: z.string().nullish().transform((v) => v ?? ""),
  sentiment: z.string().nullish().transform((v) => v ?? "neutral"),
  learner_name: z.string().nullish().transform((v) => v ?? ""),
  submitted_at: z.string().nullish().transform((v) => v ?? null),
});

const CourseRow = z.object({
  course_id: z.string(),
  course_title: z.string().nullish().transform((v) => v ?? ""),
  stars: z.number().nullish().transform((v) => v ?? 0),
  comment: z.string().nullish().transform((v) => v ?? ""),
  learner_name: z.string().nullish().transform((v) => v ?? ""),
  submitted_at: z.string().nullish().transform((v) => v ?? null),
});

export async function listAdminFeedback(
  organizationId: string
): Promise<Result<{ tasks: AdminTaskFeedback[]; courses: AdminCourseFeedback[] }>> {
  const supabase = await createServerClient();

  const taskResult = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase.rpc("list_task_feedback_for_admin", {
      p_organization_id: organizationId,
    });
    return { data: (data as unknown[] | null) ?? [], error };
  });
  if (!taskResult.ok) return taskResult;

  const courseResult = await fromSupabase<unknown[]>(async () => {
    const { data, error } = await supabase.rpc("list_course_feedback_for_admin", {
      p_organization_id: organizationId,
    });
    return { data: (data as unknown[] | null) ?? [], error };
  });
  if (!courseResult.ok) return courseResult;

  const tasks = z.array(TaskRow).safeParse(taskResult.data);
  const courses = z.array(CourseRow).safeParse(courseResult.data);

  return ok({
    tasks: (tasks.success ? tasks.data : []).map((row) => ({
      taskId: row.task_id,
      taskTitle: row.task_title,
      sentiment: row.sentiment,
      learnerName: row.learner_name,
      submittedAt: row.submitted_at,
    })),
    courses: (courses.success ? courses.data : []).map((row) => ({
      courseId: row.course_id,
      courseTitle: row.course_title,
      stars: row.stars,
      comment: row.comment,
      learnerName: row.learner_name,
      submittedAt: row.submitted_at,
    })),
  });
}
