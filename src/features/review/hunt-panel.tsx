import { Badge, Card, EmptyState, SectionLabel } from "@/shared/ui";
import { getTranslator } from "./i18n";
import {
  getHuntScenarioCodeForSubmission,
  getScenarioGroundTruth,
  listTicketsForSubmission,
  type HuntTicket,
} from "@/features/arena/ticket/data";
import {
  describeGroundTruth,
  rankMatches,
  type MatchSuggestion,
} from "@/features/arena/ticket/matching";
import { BUG_LABEL_CODES, BUG_LABEL_STRING_KEYS } from "@/features/arena/ticket/labels";
import { TicketView, type TicketViewLabels } from "@/features/arena/ticket/ticket-view";
import { HuntVerdicts } from "./hunt-verdicts";

/**
 * ⭐ The trainer's ground-truth panel — decision **D2**, and the load
 * mitigation the whole Bug Arena rests on.
 *
 * `05_…` §6 states the risk plainly: ten students × six milestones is sixty
 * free-text reports per cohort, and a trainer covering three cohorts would do
 * nothing else. This panel is the answer. It shows, above the fold:
 *
 *   * the report as a **ticket**, not prose, with missing fields called out;
 *   * the **ranked planted-bug match**, pre-selected but never applied;
 *   * **"2 von 5 gefunden"** — where this learner stands on the hunt;
 *   * what is **still outstanding**, which is trainer-only and never shown to
 *     a student.
 *
 * A Server Component, so the ground truth never reaches the browser: the
 * outstanding-defect list is the answer key, and shipping it to the client
 * would put it one devtools panel away from every student. Only the codes a
 * trainer may pick from cross the boundary, and only inside the trainer's own
 * authenticated render.
 *
 * ⚠️ **Not yet composed into the review screen.** WS-10 owns
 * `features/review/hunt-*.tsx` but neither `decision-panel.tsx` nor the route
 * that renders it. `ISSUES.md` I-046 carries the exact wiring for WS-13.
 */

export interface HuntPanelProps {
  locale: string;
  submissionId: string;
  /** False once the submission is decided; the panel goes read-only with it. */
  editable: boolean;
}

export async function HuntPanel({ locale, submissionId, editable }: HuntPanelProps) {
  // The panel works out for itself whether this is a hunt, so it is safe to
  // drop into the review screen unconditionally and renders nothing for every
  // other task kind. The alternative was making the route decide what a hunt
  // is -- and that decision belongs here, next to everything else that knows.
  const codeResult = await getHuntScenarioCodeForSubmission(submissionId);
  const scenarioCode = codeResult.ok ? codeResult.data : null;
  if (!scenarioCode) return null;

  const t = await getTranslator(locale);
  const [ticketResult, groundTruthResult] = await Promise.all([
    listTicketsForSubmission(submissionId),
    getScenarioGroundTruth(scenarioCode),
  ]);

  const tickets = ticketResult.ok ? ticketResult.data : [];
  const scenario = groundTruthResult.ok ? groundTruthResult.data : null;
  const planted = scenario?.planted ?? [];

  const progress = describeGroundTruth(
    tickets,
    planted,
    scenario ? ({ expectedFindings: scenario.expectedFindings } as never) : null,
  );

  const ticketLabels: TicketViewLabels = {
    summary: t("learn.task.defectSummary"),
    severity: t("learn.task.defectSeverity"),
    severityLow: t("learn.task.defectSeverityLow"),
    severityMedium: t("learn.task.defectSeverityMedium"),
    severityHigh: t("learn.task.defectSeverityHigh"),
    severityCritical: t("learn.task.defectSeverityCritical"),
    url: t("learn.task.defectUrl"),
    steps: t("learn.task.defectSteps"),
    expected: t("learn.task.defectExpected"),
    actual: t("learn.task.defectActual"),
    description: t("learn.task.defectDescriptionField"),
    labels: t("learn.task.defectLabels"),
    environment: t("learn.task.defectEnvironment"),
    screenshots: t("learn.task.defectScreenshots"),
    screenshotCount: t("trainer.hunt.screenshotCount"),
    missing: t("trainer.hunt.fieldMissing"),
    fieldsComplete: t("trainer.hunt.fieldsComplete"),
    fieldsIncomplete: t("trainer.hunt.fieldsIncomplete"),
    labelNames: Object.fromEntries(
      BUG_LABEL_CODES.map((code) => [
        BUG_LABEL_STRING_KEYS[code],
        t(`learn.task.${BUG_LABEL_STRING_KEYS[code]}`),
      ]),
    ),
  };

  const verdictLabels = {
    legend: t("trainer.hunt.verdictLegend"),
    confirm: t("trainer.hunt.confirm"),
    bonus: t("trainer.hunt.bonus"),
    duplicate: t("trainer.hunt.duplicate"),
    invalid: t("trainer.hunt.invalid"),
    reopen: t("trainer.hunt.reopen"),
    matchedCode: t("trainer.hunt.matchedCode"),
    chooseCode: t("trainer.hunt.chooseCode"),
    noCodes: t("trainer.hunt.noCodes"),
    decided: t("trainer.hunt.decided"),
    verdictConfirmed: t("trainer.hunt.verdictConfirmed"),
    verdictBonus: t("trainer.hunt.verdictBonus"),
    verdictDuplicate: t("trainer.hunt.verdictDuplicate"),
    verdictInvalid: t("trainer.hunt.verdictInvalid"),
    verdictPending: t("trainer.hunt.verdictPending"),
    decoyWarning: t("trainer.hunt.decoyWarning"),
  };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[18px] font-semibold leading-6">{t("trainer.hunt.title")}</h2>
          {/* Course material: German only, CONTENT_LOCALES === ["de"]. */}
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">
            {scenario?.title || scenarioCode}
          </p>
        </div>
        <Badge tone={progress.complete ? "success" : "info"} dot>
          {t("trainer.hunt.progress", {
            found: progress.found,
            expected: progress.expected,
          })}
        </Badge>
      </div>

      {/* No ground truth is the NORMAL state until WS-9 seeds scenarios. Say so
          plainly rather than rendering an empty suggestion area that looks
          broken -- the report and the field checklist below are still useful. */}
      {planted.length === 0 && (
        <p className="rounded-(--radius-md) bg-(--color-surface) p-3 text-[13px] leading-5 text-(--color-fg-muted)">
          {t("trainer.hunt.noGroundTruth")}
        </p>
      )}

      {tickets.length === 0 ? (
        <EmptyState
          title={t("trainer.hunt.emptyTitle")}
          description={t("trainer.hunt.emptyDescription")}
        />
      ) : (
        <ul className="flex flex-col gap-5">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="flex flex-col gap-3">
              <TicketView
                report={ticket.report}
                labels={ticketLabels}
                fallbackSummary={ticket.reportedSummary}
              />
              <Suggestions
                ticket={ticket}
                matches={rankMatches(ticket.report, planted)}
                label={t("trainer.hunt.suggestions")}
                strongLabel={t("trainer.hunt.matchStrong")}
                possibleLabel={t("trainer.hunt.matchPossible")}
                decoyLabel={t("trainer.hunt.matchDecoy")}
                noneLabel={t("trainer.hunt.noMatch")}
              />
              <HuntVerdicts
                locale={locale}
                submissionId={submissionId}
                findingId={ticket.id}
                expectedVersion={ticket.rowVersion}
                verdict={ticket.verdict}
                plantedCode={ticket.plantedCode}
                codeOptions={planted.map((defect) => ({
                  code: defect.code,
                  decoy: defect.decoy,
                }))}
                suggestedCode={
                  rankMatches(ticket.report, planted).find((m) => !m.defect.decoy)?.defect
                    .code ?? ""
                }
                labels={verdictLabels}
                editable={editable}
              />
            </li>
          ))}
        </ul>
      )}

      {/* The answer key. Trainer-only, and it never leaves the server render. */}
      {progress.outstanding.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-(--color-border) pt-3">
          <SectionLabel>{t("trainer.hunt.outstanding")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {progress.outstanding.map((defect) => (
              <Badge key={defect.code} tone="neutral">
                {defect.code}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Suggestions({
  ticket,
  matches,
  label,
  strongLabel,
  possibleLabel,
  decoyLabel,
  noneLabel,
}: {
  ticket: HuntTicket;
  matches: MatchSuggestion[];
  label: string;
  strongLabel: string;
  possibleLabel: string;
  decoyLabel: string;
  noneLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      {matches.length === 0 ? (
        // Honest about not knowing. A weak guess dressed up as a match teaches
        // the trainer to click through, and D2 becomes a rubber stamp.
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{noneLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {matches.map((match) => (
            <li
              key={`${ticket.id}-${match.defect.code}`}
              className="flex flex-wrap items-center gap-2"
            >
              <Badge
                tone={
                  match.defect.decoy
                    ? "warning"
                    : match.confidence === "strong"
                      ? "success"
                      : "neutral"
                }
                dot
              >
                {match.defect.decoy
                  ? decoyLabel
                  : match.confidence === "strong"
                    ? strongLabel
                    : possibleLabel}
              </Badge>
              <span className="font-mono text-[13px] font-semibold">{match.defect.code}</span>
              {/* The words that drove the match. A trainer can sanity-check the
                  suggestion without re-reading the whole report. */}
              <span className="text-[13px] text-(--color-fg-muted)">
                {match.overlap.slice(0, 6).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
