import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Badge, Card, ErrorState, StatusBadge, cn } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getQuestionDetail, listQuestionTrainers } from "@/shared/data/review";
import { getTranslator } from "@/features/review/i18n";
import { formatDateTime } from "@/features/review/format";
import { MetaStrip } from "@/features/review/meta-strip";
import { QuestionActions } from "@/features/review/question-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.questions.threadTitle") };
}

/** The thread, then the one action that is actually available right now. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; questionId: string }>;
}) {
  const { locale, questionId } = await params;
  const { principal } = await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const listHref = `/${locale}/trainer/questions`;
  const result = await getQuestionDetail(questionId, locale, principal.userId);

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title={t("trainer.questions.notFoundTitle")}
          locale={locale}
          breadcrumbs={[{ label: t("trainer.questions.title"), href: listHref }]}
        />
        <ErrorState title={t("trainer.questions.notFoundTitle")} message={result.error.message} />
        <Link
          href={listHref as Route}
          className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-(--color-brand) underline-offset-4 hover:underline"
        >
          {t("trainer.questions.backToQuestions")}
        </Link>
      </>
    );
  }

  const question = result.data;
  const trainers = await listQuestionTrainers(question.cohortId, principal.userId);
  const isArchived = question.state === "archived";

  return (
    <>
      <PageHeader
        title={question.subject}
        description={`${question.learnerName} · ${question.taskTitle}`}
        locale={locale}
        breadcrumbs={[
          { label: t("trainer.questions.title"), href: listHref },
          { label: t("trainer.questions.threadTitle") },
        ]}
        actions={<StatusBadge state={question.state} locale={locale} />}
      />

      <MetaStrip
        className="mb-6"
        items={[
          { label: t("trainer.shared.learner"), value: question.learnerName },
          { label: t("trainer.shared.course"), value: question.courseTitle },
          { label: t("trainer.shared.task"), value: question.taskTitle },
          {
            label: t("trainer.questions.assignedTo"),
            value: question.assignedTrainerName ?? t("trainer.questions.unassigned"),
            emphasis: question.assignedTrainerId === principal.userId,
          },
          {
            label: t("trainer.questions.askedAt"),
            value: formatDateTime(question.createdAt, locale),
          },
          { label: t("trainer.questions.messages"), value: String(question.messageCount) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Card className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold leading-6">{t("trainer.questions.messages")}</h2>
          <ol className="flex flex-col gap-3">
            {question.messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "flex flex-col gap-1 rounded-(--radius-md) p-3",
                  message.kind === "system"
                    ? "border border-dashed border-(--color-border-strong)"
                    : message.isTrainer
                      ? "bg-(--color-brand-soft)"
                      : "bg-(--color-surface)"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold leading-4">{message.authorName}</span>
                  {message.kind === "system" && (
                    <Badge tone="neutral">{t("trainer.questions.systemMessage")}</Badge>
                  )}
                  <span className="text-[13px] text-(--color-fg-muted)">
                    {formatDateTime(message.createdAt, locale)}
                  </span>
                </div>
                <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6">{message.body}</p>
              </li>
            ))}
          </ol>
        </Card>

        <QuestionActions
          locale={locale}
          questionId={question.id}
          expectedVersion={question.rowVersion}
          canClaim={question.canClaim}
          canAnswer={question.canAnswer}
          isArchived={isArchived}
          trainers={trainers.ok ? trainers.data : []}
          labels={{
            claim: t("trainer.questions.claim"),
            claimHint: t("trainer.questions.claimHint"),
            answerLabel: t("trainer.questions.answerLabel"),
            answerPlaceholder: t("trainer.questions.answerPlaceholder"),
            answerRequired: t("trainer.questions.answerRequired"),
            answer: t("trainer.questions.answer"),
            transfer: t("trainer.questions.transfer"),
            transferTo: t("trainer.review.transferTo"),
            transferReason: t("trainer.review.transferReason"),
            transferReasonPlaceholder: t("trainer.review.transferReasonPlaceholder"),
            transferSubmit: t("trainer.review.transferSubmit"),
            transferNoTrainers: t("trainer.review.transferNoTrainers"),
            archive: t("trainer.questions.archive"),
            archiveConfirm: t("trainer.questions.archiveConfirm"),
            cancel: t("trainer.review.cancel"),
            confirm: t("trainer.review.confirm"),
            notYours: t("trainer.questions.notYours"),
            isArchived: t("trainer.questions.isArchived"),
          }}
        />
      </div>
    </>
  );
}
