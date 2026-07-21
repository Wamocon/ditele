"use client";

import { Field, Input, Select, Textarea } from "@/shared/ui";
import type { DefectReport } from "./model";
import type { LearnStrings } from "./i18n";

/**
 * The defect report, laid out like a professional bug tracker.
 *
 * **The form is part of the teaching** (MASTER_PLAN §1): these students are
 * learning to write defect reports a developer can act on, so the fields are the
 * real ones — summary, severity, address, reproduction steps, expected, actual —
 * and each hint says what a good answer looks like rather than restating the
 * label. A free-text box would be quicker to build and would teach nothing.
 */
export interface DefectFormProps {
  value: DefectReport;
  onChange: (next: DefectReport) => void;
  onBlur: () => void;
  disabled: boolean;
  showErrors: boolean;
  strings: LearnStrings["task"];
}

export function DefectForm({
  value,
  onChange,
  onBlur,
  disabled,
  showErrors,
  strings,
}: DefectFormProps) {
  const set = <K extends keyof DefectReport>(key: K, next: DefectReport[K]) =>
    onChange({ ...value, [key]: next });

  // Empty is only an error once the learner has tried to submit — nagging
  // someone who has not finished typing yet is hostile.
  const missing = (field: string) => (showErrors && field.trim().length === 0 ? " " : "");

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={strings.defectSummary}
        hint={strings.defectSummaryHint}
        error={missing(value.summary)}
        required
      >
        <Input
          value={value.summary}
          onChange={(event) => set("summary", event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={strings.defectSummaryPlaceholder}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={strings.defectSeverity}>
          <Select
            value={value.severity}
            onChange={(event) => {
              set("severity", event.target.value as DefectReport["severity"]);
              onBlur();
            }}
            disabled={disabled}
          >
            <option value="low">{strings.defectSeverityLow}</option>
            <option value="medium">{strings.defectSeverityMedium}</option>
            <option value="high">{strings.defectSeverityHigh}</option>
            <option value="critical">{strings.defectSeverityCritical}</option>
          </Select>
        </Field>

        <Field
          label={strings.defectUrl}
          hint={strings.defectUrlHint}
          error={missing(value.sourceUri)}
          required
        >
          <Input
            type="url"
            inputMode="url"
            value={value.sourceUri}
            onChange={(event) => set("sourceUri", event.target.value)}
            onBlur={onBlur}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field
        label={strings.defectSteps}
        hint={strings.defectStepsHint}
        error={missing(value.steps)}
        required
      >
        <Textarea
          rows={5}
          value={value.steps}
          onChange={(event) => set("steps", event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={strings.defectStepsPlaceholder}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={strings.defectExpected} error={missing(value.expected)} required>
          <Textarea
            rows={3}
            value={value.expected}
            onChange={(event) => set("expected", event.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={strings.defectExpectedPlaceholder}
          />
        </Field>

        <Field label={strings.defectActual} error={missing(value.actual)} required>
          <Textarea
            rows={3}
            value={value.actual}
            onChange={(event) => set("actual", event.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={strings.defectActualPlaceholder}
          />
        </Field>
      </div>
    </div>
  );
}

/** True when every field a trainer needs in order to act on the report is filled. */
export function isDefectComplete(defect: DefectReport): boolean {
  return (
    defect.summary.trim().length > 0 &&
    defect.sourceUri.trim().length > 0 &&
    defect.steps.trim().length > 0 &&
    defect.expected.trim().length > 0 &&
    defect.actual.trim().length > 0
  );
}

/**
 * The report as the trainer will read it in the review screen. `answer_text` is
 * the only free-text field a submission carries, so the structured report is
 * rendered into it — the structured copy still round-trips separately through
 * `evidence_draft` so the form can be re-populated.
 */
export function formatDefectReport(
  defect: DefectReport,
  answerText: string,
  strings: LearnStrings["task"]
): string {
  const severity = {
    low: strings.defectSeverityLow,
    medium: strings.defectSeverityMedium,
    high: strings.defectSeverityHigh,
    critical: strings.defectSeverityCritical,
  }[defect.severity];

  const lines = [
    `${strings.defectSummary}: ${defect.summary}`,
    `${strings.defectSeverity}: ${severity}`,
    `${strings.defectUrl}: ${defect.sourceUri}`,
    "",
    `${strings.defectSteps}:`,
    defect.steps,
    "",
    `${strings.defectExpected}:`,
    defect.expected,
    "",
    `${strings.defectActual}:`,
    defect.actual,
  ];

  if (answerText.trim().length > 0) {
    lines.push("", `${strings.answerLabel}:`, answerText.trim());
  }
  return lines.join("\n");
}
