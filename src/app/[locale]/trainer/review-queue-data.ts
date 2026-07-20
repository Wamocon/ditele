import "server-only";

import { z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import type { ReviewQueueItem } from "@/features/review/model";
import type { Locale } from "@/shared/i18n/config";
import { createServerClient } from "@/shared/database/server";

const timestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Invalid database timestamp",
);

const queueSubmissionRowSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["submitted", "resubmitted"]),
  row_version: z.number().int().positive(),
  cohort_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  task_id: z.string().uuid(),
  updated_at: timestampSchema,
  submission_versions: z.array(z.object({
    submitted_at: timestampSchema,
    version_number: z.number().int().positive(),
  })),
  review_transfers: z.array(z.object({
    id: z.string().uuid(),
    from_trainer_id: z.string().uuid(),
    to_trainer_id: z.string().uuid(),
    reason: z.string().min(1),
    created_at: timestampSchema,
  })),
});

function latestTransfer(
  transfers: z.infer<typeof queueSubmissionRowSchema>["review_transfers"],
) {
  return transfers.toSorted((left, right) => {
    const timestampOrder = Date.parse(right.created_at) - Date.parse(left.created_at);
    return timestampOrder !== 0 ? timestampOrder : right.id.localeCompare(left.id);
  })[0];
}

export async function readReviewQueue(locale: Locale): Promise<ReviewQueueItem[]> {
  const [client, principal] = await Promise.all([
    createServerClient(),
    getPrincipal(),
  ]);
  if (
    !principal.roles.some((role) => role === "trainer" || role === "admin") ||
    !principal.permissions.some((permission) =>
      permission === "review.manage" || permission === "cohort.manage"
    )
  ) {
    throw new Error("review.queue_forbidden");
  }
  const { data, error } = await client
    .from("submissions")
    .select(
      "id, state, row_version, cohort_id, learner_id, task_id, updated_at, submission_versions(submitted_at, version_number), review_transfers(id, from_trainer_id, to_trainer_id, reason, created_at)",
    )
    .in("state", ["submitted", "resubmitted"])
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error("review.queue_read_failed", { cause: error });
  }

  const canManageAll = principal.permissions.includes("cohort.manage");
  const submissions = queueSubmissionRowSchema.array().parse(data).filter((submission) => {
    if (!canManageAll && !principal.cohortIds.includes(submission.cohort_id)) return false;
    const transfer = latestTransfer(submission.review_transfers);
    return !transfer || canManageAll || transfer.to_trainer_id === principal.userId;
  });
  if (submissions.length === 0) return [];

  const learnerIds = [...new Set(submissions.map((item) => item.learner_id))];
  const groupIds = [...new Set(submissions.map((item) => item.cohort_id))];
  const taskIds = [...new Set(submissions.map((item) => item.task_id))];
  const [profiles, groups, tasks] = await Promise.all([
    client.from("profiles").select("user_id, display_name").in("user_id", learnerIds),
    client.from("cohorts").select("id, name").in("id", groupIds),
    client
      .from("task_localizations")
      .select("task_id, locale, title")
      .in("task_id", taskIds)
      .in("locale", [locale, "en"]),
  ]);
  if (profiles.error || groups.error || tasks.error) {
    throw new Error("review.queue_context_read_failed", {
      cause: profiles.error ?? groups.error ?? tasks.error,
    });
  }

  const profileNames = new Map(
    profiles.data.map((profile) => [profile.user_id, profile.display_name]),
  );
  const groupNames = new Map(groups.data.map((group) => [group.id, group.name]));
  const taskTitles = new Map<string, string>();
  for (const task of tasks.data.sort((left, right) =>
    left.locale === locale && right.locale !== locale ? -1 : 1,
  )) {
    if (!taskTitles.has(task.task_id)) taskTitles.set(task.task_id, task.title);
  }

  return submissions.map((submission) => {
    const latestVersion = submission.submission_versions.toSorted(
      (left, right) => right.version_number - left.version_number,
    )[0];
    const transfer = latestTransfer(submission.review_transfers);
    return {
      id: submission.id,
      groupId: submission.cohort_id,
      groupName: groupNames.get(submission.cohort_id) ?? submission.cohort_id,
      learnerName: profileNames.get(submission.learner_id) ?? submission.learner_id,
      taskTitle: taskTitles.get(submission.task_id) ?? submission.task_id,
      state: submission.state as "submitted" | "resubmitted",
      version: submission.row_version,
      submittedAt: new Date(
        latestVersion?.submitted_at ?? submission.updated_at,
      ).toISOString(),
      ...(transfer
        ? {
            assignedTrainerId: transfer.to_trainer_id,
            transfer: {
              id: transfer.id,
              fromTrainerId: transfer.from_trainer_id,
              toTrainerId: transfer.to_trainer_id,
              reason: transfer.reason,
              createdAt: new Date(transfer.created_at).toISOString(),
              status: "accepted" as const,
            },
          }
        : {}),
    } satisfies ReviewQueueItem;
  });
}
