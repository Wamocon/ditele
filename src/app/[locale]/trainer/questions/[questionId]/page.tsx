import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";
import { z } from "zod";

import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { QuestionThreadView } from "@/features/mentoring/question-thread-view";
import {
  ClaimQuestionAction,
  TrainerQuestionActions,
} from "@/features/mentoring/trainer-question-actions";
import {
  questionWorkflowCopy,
  toTrainerQuestionActionCopy,
} from "@/features/mentoring/question-workflow-copy";
import { isQuestionHistoryState } from "@/features/mentoring/question-workflow-model";
import { readTrainerQuestionDetail } from "@/features/mentoring/server/question-workflow-data";
import { isLocale } from "@/shared/i18n/config";
import { localizedDynamicRoute, localizedRoute } from "@/shared/i18n/routes";
import { StatePanel } from "@/shared/ui/state-panel";

import {
  answerQuestionAction,
  claimQuestionAction,
  transferQuestionAction,
} from "../actions";

export default async function TrainerQuestionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; questionId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale, questionId } = await params;
  const { notice } = await searchParams;
  if (!isLocale(locale) || !z.string().uuid().safeParse(questionId).success) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/trainer/questions/${questionId}`,
      ["trainer", "admin"],
    ))
  ) {
    return null;
  }

  const workspace = await readTrainerQuestionDetail(locale, questionId);
  if (!workspace) notFound();
  const copy = questionWorkflowCopy[locale];
  const actionCopy = toTrainerQuestionActionCopy(copy.trainer);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const answerAction = answerQuestionAction.bind(null, locale);
  const claimAction = claimQuestionAction.bind(null, locale);
  const transferAction = transferQuestionAction.bind(null, locale);
  const showClaimedNotice =
    notice === "claimed" &&
    workspace.question.state === "assigned" &&
    workspace.isOwner;

  let actions;
  if (workspace.question.state === "open") {
    actions = (
      <ClaimQuestionAction
        action={claimAction}
        expectedVersion={workspace.question.version}
        idempotencyKey={`question-claim:${randomUUID()}`}
        labels={actionCopy}
        questionId={workspace.question.id}
      />
    );
  } else if (workspace.canAct) {
    actions = (
      <TrainerQuestionActions
        answerAction={answerAction}
        answerIdempotencyKey={`question-answer:${randomUUID()}`}
        candidates={workspace.candidates}
        expectedVersion={workspace.question.version}
        labels={actionCopy}
        questionId={workspace.question.id}
        transferAction={transferAction}
        transferIdempotencyKey={`question-transfer:${randomUUID()}`}
      />
    );
  } else if (
    (workspace.question.state === "assigned" || workspace.question.state === "transferred") &&
    !workspace.isOwner
  ) {
    actions = (
      <StatePanel
        description={copy.trainer.otherOwnerDescription}
        title={copy.trainer.otherOwnerTitle}
      />
    );
  } else {
    actions = (
      <StatePanel
        description={copy.trainer.closedDescription}
        title={copy.trainer.closedTitle}
      />
    );
  }

  const backHref = isQuestionHistoryState(workspace.question.state)
    ? localizedDynamicRoute(locale, "/trainer/questions/archive")
    : localizedRoute(locale, "/trainer/questions");

  return (
    <div className="stack">
      {notice === "stale" ? (
        <div role="alert">
          <StatePanel
            description={copy.trainer.conflict}
            title={copy.trainer.conflictTitle}
            tone="danger"
          />
        </div>
      ) : null}
      {showClaimedNotice ? (
        <div aria-live="polite" role="status">
          <StatePanel
            description={copy.trainer.claimSuccess}
            title={copy.trainer.claimSuccessTitle}
          />
        </div>
      ) : null}
      <QuestionThreadView
        actions={actions}
        backHref={backHref}
        formatDateTime={(value) => formatter.format(new Date(value))}
        labels={copy.common}
        question={workspace.question}
      />
    </div>
  );
}
