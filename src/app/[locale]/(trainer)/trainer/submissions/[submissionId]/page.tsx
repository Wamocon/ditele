import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/shared/layout";
import { Badge, Card, ErrorState, StatusBadge } from "@/shared/ui";
import { requireRole } from "@/shared/auth/guard";
import { getReviewDetail, listCohortTrainers, type ReviewDetail } from "@/shared/data/review";
import { getTranslator, type Translate } from "@/features/review/i18n";
import { formatDateTime, formatDuration } from "@/features/review/format";
import { MetaStrip } from "@/features/review/meta-strip";
import { PanelTabs } from "@/features/review/panel-tabs";
import { DecisionPanel } from "@/features/review/decision-panel";
import { HuntPanel } from "@/features/review/hunt-panel";
import { getHuntScenarioCodeForSubmission } from "@/features/arena/ticket/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslator(locale);
  return { title: t("trainer.review.title") };
}

/**
 * ⭐ Signature screen. The task and the learner's answer sit side by side with
 * the numbers above them and the decision beneath, so a review is one scroll
 * and one click — not a hunt across three screens.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; submissionId: string }>;
}) {
  const { locale, submissionId } = await params;
  const { principal } = await requireRole(["trainer", "admin"], locale);
  const t = await getTranslator(locale);

  const queueHref = `/${locale}/trainer/submissions`;
  const detail = await getReviewDetail(submissionId, locale);

  // Never render a submission the database refused — show why, offer a way back.
  if (!detail.ok) {
    return (
      <>
        <PageHeader
          title={t("trainer.review.notFoundTitle")}
          locale={locale}
          breadcrumbs={[{ label: t("trainer.queue.title"), href: queueHref }]}
        />
        <ErrorState title={t("trainer.review.notFoundTitle")} message={detail.error.message} />
        <Link
          href={queueHref as Route}
          className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-(--color-brand) underline-offset-4 hover:underline"
        >
          {t("trainer.shared.backToQueue")}
        </Link>
      </>
    );
  }

  const review = detail.data;
  const trainers = await listCohortTrainers(review.cohortId, principal.userId);
  const trainerOptions = trainers.ok ? trainers.data : [];

  const decision = (
    <DecisionSection
      review={review}
      t={t}
      locale={locale}
      trainers={trainerOptions}
      queueHref={queueHref}
    />
  );

  /**
   * ⭐ Decision **D2** — the ground-truth panel, wired in by WS-13 (ISSUES.md
   * I-046). WS-10 built and tested it but owned neither this route nor
   * `decision-panel.tsx`, so it shipped unreachable.
   *
   * `HuntPanel` works out for itself whether this submission is a hunt and
   * returns `null` for every other task kind, so the desktop branch renders it
   * unconditionally. The **mobile tab** cannot be unconditional: a tab whose
   * body is `null` is an empty tab on every practical review, so the page asks
   * the same question the panel does and only offers the tab when the answer is
   * yes. One extra query on a screen that already makes several, in exchange
   * for a tab bar that never lies.
   */
  const huntScenario = await getHuntScenarioCodeForSubmission(review.id);
  const isHunt = huntScenario.ok && huntScenario.data !== null;
  const huntPanel = <HuntPanel locale={locale} submissionId={review.id} editable={review.decidable} />;

  return (
    <>
      <PageHeader
        title={review.taskTitle}
        description={`${review.learnerName} · ${review.courseTitle}`}
        locale={locale}
        breadcrumbs={[
          { label: t("trainer.queue.title"), href: queueHref },
          { label: t("trainer.review.breadcrumb") },
        ]}
        actions={<StatusBadge state={review.state} locale={locale} />}
      />

      <MetaStrip
        className="mb-6"
        items={[
          { label: t("trainer.shared.learner"), value: review.learnerName },
          { label: t("trainer.shared.course"), value: review.courseTitle },
          {
            label: t("trainer.shared.attempt"),
            value: t("trainer.shared.attemptNumber", { number: review.attemptNumber }),
          },
          {
            label: t("trainer.review.timeSpent"),
            value: formatDuration(review.elapsedSeconds, t),
          },
          {
            label: t("trainer.review.hintsUsed"),
            value: String(review.hintsUsed.length || (review.hintUsed ? 1 : 0)),
            emphasis: review.hintUsed,
          },
          {
            label: t("trainer.shared.submittedAt"),
            value: formatDateTime(review.submittedAt, locale),
          },
        ]}
      />

      <PanelTabs
        tabs={[
          {
            id: "answer",
            label: t("trainer.review.tabAnswer"),
            content: <AnswerPanel review={review} t={t} locale={locale} />,
          },
          {
            id: "task",
            label: t("trainer.review.tabTask"),
            content: <TaskPanel review={review} t={t} />,
          },
          ...(isHunt
            ? [{ id: "hunt", label: t("trainer.hunt.title"), content: huntPanel }]
            : []),
          { id: "decision", label: t("trainer.review.tabDecision"), content: decision },
        ]}
        desktop={
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 items-start gap-6">
              <TaskPanel review={review} t={t} />
              <AnswerPanel review={review} t={t} locale={locale} />
            </div>
            {huntPanel}
            {decision}
          </div>
        }
      />
    </>
  );
}

/* ── Panels ─────────────────────────────────────────────────────────────── */

function TaskPanel({ review, t }: { review: ReviewDetail; t: Translate }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[18px] font-semibold leading-6">{t("trainer.review.taskPanel")}</h2>

      {review.taskInstructionsHtml ? (
        <div
          className="max-w-[68ch] text-[15px] leading-6 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3"
          // Authored by an admin in the content studio and stored as HTML.
          dangerouslySetInnerHTML={{ __html: review.taskInstructionsHtml }}
        />
      ) : (
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">
          {t("trainer.review.noInstructions")}
        </p>
      )}

      {review.assessmentQuestion && (
        <div className="flex flex-col gap-1 rounded-(--radius-md) bg-(--color-surface) p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {t("trainer.review.assessmentQuestion")}
          </span>
          <p className="text-[15px] leading-6">{review.assessmentQuestion}</p>
        </div>
      )}

      {review.targetUrl && (
        <div className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {t("trainer.review.practiceTarget")}
          </span>
          <a
            href={review.targetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center break-all text-[13px] text-(--color-brand) underline-offset-4 hover:underline"
          >
            {t("trainer.review.openTarget")}
          </a>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
          {t("trainer.review.hintsUsed")}
        </span>
        {review.hintsUsed.length === 0 ? (
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{t("trainer.review.noHints")}</p>
        ) : (
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-5">
            {review.hintsUsed.map((hint, index) => (
              <li key={`${index}-${hint.slice(0, 12)}`}>{hint}</li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function AnswerPanel({
  review,
  t,
  locale,
}: {
  review: ReviewDetail;
  t: Translate;
  locale: string;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[18px] font-semibold leading-6">{t("trainer.review.answerPanel")}</h2>

      {review.answerText ? (
        <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6">{review.answerText}</p>
      ) : (
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{t("trainer.review.noAnswer")}</p>
      )}

      {review.selectedOptions.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {review.selectedOptions.map((option) => (
            <li key={option.id} className="flex flex-wrap items-center gap-2 text-[15px] leading-6">
              <Badge tone={option.selected ? "success" : "neutral"} dot>
                {option.selected ? t("trainer.review.selected") : t("trainer.review.notSelected")}
              </Badge>
              <span className={option.selected ? "font-semibold" : "text-(--color-fg-muted)"}>
                {option.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
          {t("trainer.review.evidence")}
        </span>
        {review.evidence.length === 0 ? (
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">
            {t("trainer.review.noEvidence")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {review.evidence.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 rounded-(--radius-md) border border-(--color-border) p-3"
              >
                <span className="text-[15px] font-semibold leading-5">{item.title}</span>
                <span className="text-[13px] text-(--color-fg-muted)">
                  {formatDateTime(item.capturedAt, locale)}
                </span>
                {item.sourceUri && (
                  <a
                    href={item.sourceUri}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center break-all text-[13px] text-(--color-brand) underline-offset-4 hover:underline"
                  >
                    {t("trainer.review.openEvidence")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {review.pastDecisions.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-(--color-border) pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            {t("trainer.review.previousDecisions")}
          </span>
          <ul className="flex flex-col gap-2">
            {review.pastDecisions.map((decision) => (
              <li key={decision.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge state={decision.decision} locale={locale} />
                  <span className="text-[13px] text-(--color-fg-muted)">
                    {decision.reviewerName} · {formatDateTime(decision.createdAt, locale)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-5">{decision.comment}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DecisionSection({
  review,
  t,
  locale,
  trainers,
  queueHref,
}: {
  review: ReviewDetail;
  t: Translate;
  locale: string;
  trainers: { id: string; name: string }[];
  queueHref: string;
}) {
  return (
    <DecisionPanel
      locale={locale}
      submissionId={review.id}
      submissionVersionId={review.submissionVersionId}
      expectedVersion={review.rowVersion}
      criteria={review.criteria}
      trainers={trainers}
      decidable={review.decidable}
      queueHref={queueHref}
      labels={{
        decision: t("trainer.review.decision"),
        rubric: review.rubricTitle || t("trainer.review.rubric"),
        rubricRequired: t("trainer.review.rubricRequired"),
        points: t("trainer.review.points"),
        maxPointsTemplate: t("trainer.review.maxPoints"),
        comment: t("trainer.review.comment"),
        commentPlaceholder: t("trainer.review.commentPlaceholder"),
        commentRequired: t("trainer.review.commentRequired"),
        accept: t("trainer.review.accept"),
        requestRevision: t("trainer.review.requestRevision"),
        transfer: t("trainer.review.transfer"),
        transferTo: t("trainer.review.transferTo"),
        transferReason: t("trainer.review.transferReason"),
        transferReasonPlaceholder: t("trainer.review.transferReasonPlaceholder"),
        transferSubmit: t("trainer.review.transferSubmit"),
        transferNoTrainers: t("trainer.review.transferNoTrainers"),
        cancel: t("trainer.review.cancel"),
        confirmAcceptTitle: t("trainer.review.confirmAcceptTitle"),
        confirmRevisionTitle: t("trainer.review.confirmRevisionTitle"),
        confirmText: t("trainer.review.confirmText"),
        confirm: t("trainer.review.confirm"),
        lockedTitle: t("trainer.review.lockedTitle"),
        lockedReason: lockedReason(review, t),
      }}
    />
  );
}

/** Say WHY a decision is impossible. A disabled control with no reason is a support ticket. */
function lockedReason(review: ReviewDetail, t: Translate): string {
  if (review.state !== "submitted" && review.state !== "resubmitted") {
    return t("trainer.review.lockedDecided");
  }
  if (review.courseState !== "active") return t("trainer.review.lockedCourse");
  return t("trainer.review.lockedRubric");
}
