"use client";

import { useEffect } from "react";
import { Field, Input, Select, Textarea, cn } from "@/shared/ui";
import type { DefectReport } from "./model";
import type { LearnStrings } from "./i18n";
import { BUG_LABEL_CODES, labelName } from "@/features/arena/ticket/labels";
import { describeEnvironment } from "@/features/arena/ticket/environment";

/**
 * The defect report, laid out like a professional bug tracker.
 *
 * **The form is part of the teaching** (MASTER_PLAN §1): these students are
 * learning to write defect reports a developer can act on, so the fields are the
 * real ones — summary, severity, address, reproduction steps, expected, actual —
 * and each hint says what a good answer looks like rather than restating the
 * label. A free-text box would be quicker to build and would teach nothing.
 *
 * **WS-10 brought it to full Jira parity** (05_… §G3+G4): description, labels,
 * environment and — in the ticket module — attachments. The three original
 * reproduction fields stayed separate rather than collapsing into the new
 * description, because splitting "what you did / what you expected / what
 * happened" is the part that teaches.
 *
 * Every addition is optional at submit time. `isDefectComplete` still gates on
 * the original five, so a report that would have submitted before this change
 * still submits after it.
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

  /**
   * Prefill the environment from the real browser, once, and only into an empty
   * field on an editable attempt.
   *
   * In an effect rather than in render for two reasons: `navigator` does not
   * exist during the server render, so reading it inline would either crash or
   * produce markup the client disagrees with; and overwriting a value the
   * learner has edited — or one belonging to a submitted attempt — would be
   * worse than leaving the field blank.
   */
  useEffect(() => {
    if (disabled || value.environment.trim().length > 0) return;
    const described = describeEnvironment();
    if (described.length === 0) return;
    onChange({ ...value, environment: described });
    // `value`/`onChange` are recreated on every keystroke by the parent; this
    // must run on the mount pass only, which the two guards above already make
    // idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const toggleLabel = (code: string) => {
    const next = value.labels.includes(code)
      ? value.labels.filter((existing) => existing !== code)
      : [...value.labels, code];
    onChange({ ...value, labels: next });
    onBlur();
  };

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

      <Field label={strings.defectDescriptionField} hint={strings.defectDescriptionFieldHint}>
        <Textarea
          rows={3}
          value={value.description}
          onChange={(event) => set("description", event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={strings.defectDescriptionFieldPlaceholder}
        />
      </Field>

      {/* Labels. Checkboxes rather than a multi-select: at five options a
          multi-select hides four of them behind a click, and on a 375px screen
          a native multiple-select is close to unusable. Same chip idiom the
          assessment options already use, so the screen keeps one voice. */}
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-1 flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold leading-5">{strings.defectLabels}</span>
          <span className="text-[13px] leading-5 text-(--color-fg-muted)">
            {strings.defectLabelsHint}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {BUG_LABEL_CODES.map((code) => {
            const checked = value.labels.includes(code);
            return (
              <label
                key={code}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-md) border px-3 py-2",
                  "transition-colors duration-(--duration-fast)",
                  checked
                    ? "border-(--color-brand) bg-(--color-brand-soft)"
                    : "border-(--color-border-strong) hover:bg-(--color-surface)",
                  disabled && "cursor-default opacity-80"
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-(--color-brand)"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleLabel(code)}
                />
                <span className="text-[15px] leading-6">{labelName(code, strings)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label={strings.defectEnvironment} hint={strings.defectEnvironmentHint}>
        <Input
          value={value.environment}
          onChange={(event) => set("environment", event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={strings.defectEnvironmentPlaceholder}
        />
      </Field>

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
  ];

  // The header block carries only fields that were filled. An empty
  // "Labels:" line tells the trainer nothing and costs them a line of reading
  // on every single review — and review throughput is the constraint the whole
  // arena is designed around (05_… §6).
  if (defect.labels.length > 0) {
    lines.push(
      `${strings.defectLabels}: ${defect.labels
        .map((code) => labelName(code, strings))
        .join(", ")}`
    );
  }
  if (defect.environment.trim().length > 0) {
    lines.push(`${strings.defectEnvironment}: ${defect.environment.trim()}`);
  }
  if (defect.screenshotIds.length > 0) {
    lines.push(
      `${strings.defectScreenshots}: ${String(defect.screenshotIds.length)}`
    );
  }

  if (defect.description.trim().length > 0) {
    lines.push("", `${strings.defectDescriptionField}:`, defect.description.trim());
  }

  lines.push(
    "",
    `${strings.defectSteps}:`,
    defect.steps,
    "",
    `${strings.defectExpected}:`,
    defect.expected,
    "",
    `${strings.defectActual}:`,
    defect.actual
  );

  if (answerText.trim().length > 0) {
    lines.push("", `${strings.answerLabel}:`, answerText.trim());
  }
  return lines.join("\n");
}
