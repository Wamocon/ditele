import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";
import { z } from "zod";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { readActiveCohortTrainers } from "@/features/cohorts/server/active-trainers";
import { createServerClient } from "@/shared/database/server";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

import { reviewDetailCopy } from "./copy";
import { readReviewSubmission } from "./data";
import { ReviewPanel } from "./review-panel";
import { ReviewedPanel } from "./reviewed-panel";

const submissionIdSchema = z.string().uuid();

export default async function TrainerSubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; submissionId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale, submissionId } = await params;
  const { notice } = await searchParams;
  if (!isLocale(locale) || !submissionIdSchema.safeParse(submissionId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/submissions/${submissionId}`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const submission = await readReviewSubmission(locale, submissionId);
  if (!submission) notFound();
  const principal = await getPrincipal();
  const copy = reviewDetailCopy[locale];
  const canAct =
    !submission.assignedTrainerId ||
    submission.assignedTrainerId === principal.userId ||
    principal.permissions.includes("cohort.manage");
  const reviewable = submission.state === "submitted" || submission.state === "resubmitted";
  const availableTrainers = reviewable && canAct
    ? await readActiveCohortTrainers(
        await createServerClient(),
        submission.groupId,
        principal.userId,
      )
    : [];
  const content =
    !reviewable ? (
      <ReviewedPanel locale={locale} submission={submission} />
    ) : !canAct ? (
      <StatePanel
        description={copy.otherOwnerDescription}
        title={copy.otherOwnerTitle}
      />
    ) : !submission.rubric || submission.rubric.criteria.length === 0 ? (
      <StatePanel
        description={copy.missingRubricDescription}
        title={copy.missingRubricTitle}
        tone="danger"
      />
    ) : (
      <ReviewPanel
        availableTrainers={availableTrainers}
        locale={locale}
        submission={submission}
        transferIdempotencyKey={`submission-transfer:${randomUUID()}`}
      />
    );

  return (
    <div className="stack">
      {notice === "stale" ? (
        <div role="alert">
          <StatePanel
            description={copy.stale}
            title={copy.staleTitle}
            tone="danger"
          />
        </div>
      ) : null}
      {content}
    </div>
  );
}
