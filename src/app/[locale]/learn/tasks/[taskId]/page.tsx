import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";
import { z } from "zod";

import { TaskWorkspace } from "@/features/tasks/components/task-workspace";
import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { submitRatingAction } from "@/features/ratings/rating-actions";
import { ratingCopy } from "@/features/ratings/rating-copy";
import { readTaskRating } from "@/features/ratings/rating-data";
import { RatingForm } from "@/features/ratings/rating-form";
import { isLocale } from "@/shared/i18n/config";

import {
  createExternalTaskEvidenceAction,
  saveAttemptDraftAction,
  submitAttemptAction,
} from "./actions";
import { taskWorkspaceCopy } from "./copy";
import { readTaskWorkspace, TaskNotAccessibleError } from "./data";

export default async function LearnerTaskPage({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale, taskId } = await params;
  if (!isLocale(locale) || !z.string().uuid().safeParse(taskId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/tasks/${taskId}`,
      ["learner"],
    ))
  ) {
    return null;
  }
  const { task, enrollmentId, attempt } = await readTaskWorkspace(taskId).catch((error: unknown) => {
    if (error instanceof TaskNotAccessibleError) notFound();
    throw error;
  });
  const actionContext = {
    enrollmentId,
    groupId: task.groupId,
    taskId: task.id,
  };
  const rating = await readTaskRating(task.id);

  return (
    <div className="stack">
      <TaskWorkspace
        addEvidence={createExternalTaskEvidenceAction.bind(null, actionContext)}
        {...(attempt ? { initialAttempt: attempt } : {})}
        key={task.id}
        labels={taskWorkspaceCopy[locale]}
        locale={locale}
        saveDraft={saveAttemptDraftAction.bind(null, actionContext)}
        submit={submitAttemptAction.bind(null, actionContext)}
        task={task}
      />
      <RatingForm
        action={submitRatingAction}
        copy={ratingCopy[locale]}
        {...(rating ? { existing: rating } : {})}
        idempotencyKey={randomUUID()}
        locale={locale}
        target="task"
        targetId={task.id}
      />
    </div>
  );
}
