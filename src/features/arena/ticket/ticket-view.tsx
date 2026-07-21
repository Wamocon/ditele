import { Badge, Card, SectionLabel } from "@/shared/ui";
import type { DefectReport } from "@/features/learning/model";
import { labelName } from "./labels";
import { describeCompleteness } from "./matching";

/**
 * The defect report as a ticket — the shape a tester will meet on their first
 * day in a real team (`05_…` §G3+G4).
 *
 * **Presentational and string-fed.** No `"use client"`, no data access, no
 * translator import: every word arrives through `labels`, exactly the way
 * `DecisionPanel` takes its own. That is what lets one component serve the
 * trainer's review screen and the student's own view of what they filed
 * without either side owning the other's i18n namespace.
 *
 * Fields the learner left empty are **shown as missing rather than hidden**.
 * Hiding them makes a thin report look complete, and "this report has no
 * reproduction steps" is the single most useful thing a trainer can learn in
 * the first two seconds — it is the most common reason a report goes back.
 */

export interface TicketViewLabels {
  summary: string;
  severity: string;
  severityLow: string;
  severityMedium: string;
  severityHigh: string;
  severityCritical: string;
  url: string;
  steps: string;
  expected: string;
  actual: string;
  description: string;
  labels: string;
  environment: string;
  screenshots: string;
  /** A template containing `{count}`. Props crossing to a client must serialize. */
  screenshotCount: string;
  /** Shown in place of a field the learner left blank. */
  missing: string;
  fieldsComplete: string;
  fieldsIncomplete: string;
  /** Label names, keyed by `defectLabel*` — the shape `labelName` reads. */
  labelNames: Record<string, string>;
}

export interface TicketViewProps {
  report: DefectReport;
  labels: TicketViewLabels;
  /** Falls back into the summary slot when the structured report is empty. */
  fallbackSummary?: string;
}

const SEVERITY_TONE = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
} as const;

export function TicketView({ report, labels, fallbackSummary = "" }: TicketViewProps) {
  const completeness = describeCompleteness(report);
  const summary = report.summary.trim() || fallbackSummary.trim();

  const severityLabel = {
    low: labels.severityLow,
    medium: labels.severityMedium,
    high: labels.severityHigh,
    critical: labels.severityCritical,
  }[report.severity];

  return (
    <Card className="flex flex-col gap-4">
      {/* ── The header line: what it is, how bad, and is it actionable ──── */}
      <div className="flex flex-col gap-2">
        <SectionLabel>{labels.summary}</SectionLabel>
        <p className="text-[18px] font-semibold leading-6">
          {summary || <span className="text-(--color-fg-muted)">{labels.missing}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[report.severity]} dot>
            {`${labels.severity}: ${severityLabel}`}
          </Badge>
          <Badge tone={completeness.complete ? "success" : "warning"} dot>
            {completeness.complete ? labels.fieldsComplete : labels.fieldsIncomplete}
          </Badge>
          {report.screenshotIds.length > 0 && (
            <Badge tone="neutral">
              {labels.screenshotCount.replace(
                "{count}",
                String(report.screenshotIds.length)
              )}
            </Badge>
          )}
        </div>
      </div>

      {report.labels.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{labels.labels}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {report.labels.map((code) => (
              <Badge key={code} tone="brand">
                {labelName(code, labels.labelNames)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── The reproduction fields, in the order a tester reads them ───── */}
      <dl className="flex flex-col gap-3">
        <TicketField label={labels.url} value={report.sourceUri} missing={labels.missing} link />
        <TicketField label={labels.steps} value={report.steps} missing={labels.missing} />
        <TicketField label={labels.expected} value={report.expected} missing={labels.missing} />
        <TicketField label={labels.actual} value={report.actual} missing={labels.missing} />
        {report.description.trim().length > 0 && (
          <TicketField
            label={labels.description}
            value={report.description}
            missing={labels.missing}
          />
        )}
        {report.environment.trim().length > 0 && (
          <TicketField
            label={labels.environment}
            value={report.environment}
            missing={labels.missing}
          />
        )}
      </dl>
    </Card>
  );
}

function TicketField({
  label,
  value,
  missing,
  link = false,
}: {
  label: string;
  value: string;
  missing: string;
  link?: boolean;
}) {
  const filled = value.trim().length > 0;

  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
        {label}
      </dt>
      <dd className="text-[15px] leading-6">
        {!filled ? (
          // A muted line rather than a red one. A missing optional field is not
          // an error, and the completeness badge above already carries the
          // verdict — saying it twice in red would read as a broken form.
          <span className="text-(--color-fg-muted)">{missing}</span>
        ) : link ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center break-all text-(--color-brand) underline-offset-4 hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="block max-w-[68ch] whitespace-pre-wrap">{value}</span>
        )}
      </dd>
    </div>
  );
}
