"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/shared/ui";
import { saveTaskAction, type ActionState } from "../actions";
import type { AdminStrings } from "../i18n";
import { CONTENT_LOCALES, TASK_KINDS, type StudioTask } from "../model";

/** Same mapping stage-card uses; kept local so this file has no new import. */
function localeLabel(contentLocale: string, strings: AdminStrings): string {
  if (contentLocale === "de") return strings.shared.localeDe;
  if (contentLocale === "en") return strings.shared.localeEn;
  return strings.shared.localeRu;
}

interface LocalizedDraft {
  title: string;
  instructionsHtml: string;
}

interface HintDraft {
  translations: Record<string, string>;
}

interface OptionDraft {
  labels: Record<string, string>;
  isCorrect: boolean;
}

function emptyTranslations(): Record<string, string> {
  return Object.fromEntries(CONTENT_LOCALES.map((locale) => [locale, ""]));
}

function toDrafts(task: StudioTask) {
  const localizations: Record<string, LocalizedDraft> = {};
  for (const locale of CONTENT_LOCALES) {
    const entry = task.localizations.find((item) => item.locale === locale);
    localizations[locale] = {
      title: entry?.title ?? "",
      instructionsHtml: entry?.instructionsHtml ?? "",
    };
  }
  return {
    localizations,
    hints: task.hints.map((hint) => ({
      translations: { ...emptyTranslations(), ...hint.translations } as Record<string, string>,
    })),
    options: task.options.map((option) => ({
      labels: { ...emptyTranslations(), ...option.labels } as Record<string, string>,
      isCorrect: option.isCorrect,
    })),
    question: { ...emptyTranslations(), ...(task.assessment?.question ?? {}) } as Record<
      string,
      string
    >,
    selectionMode: (task.assessment?.selectionMode === "multiple" ? "multiple" : "single") as
      | "single"
      | "multiple",
  };
}

export interface TaskEditorProps {
  locale: string;
  courseId: string;
  versionId: string;
  task: StudioTask;
  /**
   * Active Arena scenarios, for the gate picker. Defaulted to `[]` so the
   * editor still renders where the caller has not fetched them — the picker
   * then simply offers "no gate", which is the honest state.
   */
  scenarios?: { id: string; code: string; title: string }[];
  strings: AdminStrings;
  readOnly: boolean;
  onSaved: () => void;
}

export function TaskEditor({
  locale,
  courseId,
  versionId,
  task,
  scenarios = [],
  strings,
  readOnly,
  onSaved,
}: TaskEditorProps) {
  const s = strings.studio;
  const initial = toDrafts(task);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const [kind, setKind] = useState(task.kind);
  const [targetUrl, setTargetUrl] = useState(task.targetUrl ?? "");
  const [localizations, setLocalizations] = useState(initial.localizations);
  const [hints, setHints] = useState<HintDraft[]>(initial.hints);
  const [options, setOptions] = useState<OptionDraft[]>(initial.options);
  const [question, setQuestion] = useState(initial.question);
  const [selectionMode, setSelectionMode] = useState(initial.selectionMode);
  // The two Phase 1c gates (§1.6). Both were reachable only by SQL until now.
  const [requiredScenarioId, setRequiredScenarioId] = useState(task.requiredHuntScenarioId ?? "");
  const [gateQuestion, setGateQuestion] = useState<Record<string, string>>({
    ...emptyTranslations(),
    ...(task.gateQuestion ?? {}),
  });

  const kindLabel: Record<string, string> = {
    knowledge: s.taskKindKnowledge,
    practical: s.taskKindPractical,
    placement: s.taskKindPlacement,
  };

  const setLocalized = (contentLocale: string, patch: Partial<LocalizedDraft>) => {
    setLocalizations((current) => ({
      ...current,
      [contentLocale]: { ...current[contentLocale]!, ...patch },
    }));
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveTaskAction({
        locale,
        courseId,
        versionId,
        taskId: task.id,
        kind,
        targetUrl: targetUrl.trim() === "" ? null : targetUrl.trim(),
        requiredHuntScenarioId: requiredScenarioId === "" ? null : requiredScenarioId,
        // All three locales or nothing. A partly-filled question would be
        // refused by set_task_gate_question anyway — the same three-locale rule
        // the snapshot validator applies — so it is treated as "no question"
        // rather than sent to fail.
        gateQuestion: CONTENT_LOCALES.every(
          (contentLocale) => (gateQuestion[contentLocale] ?? "").trim() !== ""
        )
          ? Object.fromEntries(
              CONTENT_LOCALES.map((contentLocale) => [
                contentLocale,
                (gateQuestion[contentLocale] ?? "").trim(),
              ])
            )
          : null,
        localizations: CONTENT_LOCALES.map((contentLocale) => ({
          locale: contentLocale,
          title: localizations[contentLocale]?.title ?? "",
          instructionsHtml: localizations[contentLocale]?.instructionsHtml ?? "",
        })),
        hints: hints.map((hint) => ({ translations: hint.translations })),
        assessment:
          options.length === 0
            ? null
            : { question, selectionMode, options },
      });
      setState(result);
      if (result.status === "ok") onSaved();
    });
  };

  return (
    <div className="flex flex-col gap-5 border-t border-(--color-border) pt-4">
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger)"
        >
          {state.message}
        </p>
      )}

      {/* ── basics ────────────────────────────────────────────────────── */}
      <Field label={s.taskKind}>
        <Select value={kind} onChange={(event) => setKind(event.target.value)} disabled={readOnly}>
          {TASK_KINDS.map((value) => (
            <option key={value} value={value}>
              {kindLabel[value]}
            </option>
          ))}
        </Select>
      </Field>

      {kind === "practical" && (
        <Field label={s.taskTargetUrl} hint={s.taskTargetUrlHint}>
          <Input
            type="url"
            inputMode="url"
            placeholder="https://"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            disabled={readOnly}
          />
        </Field>
      )}

      {/**
        * ── The gate chain, §1.6 ──────────────────────────────────────────
        *
        * Two independent gates on the same task, and they are deliberately
        * not one control:
        *
        *   the Arena gate   locks THIS task until a hunt of that scenario has
        *                    been accepted;
        *   the question     is asked before THIS task and locks the NEXT one
        *                    until it is answered — a skipped question does
        *                    not block the task it belongs to.
        *
        * Both can be set on one task and both can be outstanding at once,
        * which is why the learner's row shows two sentences rather than one.
        */}
      {kind !== "hunt" && (
        <Field label={s.taskRequiredHunt} hint={s.taskRequiredHuntHint}>
          <Select
            value={requiredScenarioId}
            onChange={(event) => setRequiredScenarioId(event.target.value)}
            disabled={readOnly}
          >
            <option value="">{s.taskRequiredHuntNone}</option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title} ({scenario.code})
              </option>
            ))}
          </Select>
        </Field>
      )}

      <fieldset className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) p-3">
        <legend className="px-1 text-[13px] font-semibold">{s.taskGateQuestion}</legend>
        <p className="text-[13px] text-(--color-fg-muted)">{s.taskGateQuestionHint}</p>
        {CONTENT_LOCALES.map((contentLocale) => (
          <Field key={contentLocale} label={localeLabel(contentLocale, strings)}>
            <Input
              value={gateQuestion[contentLocale] ?? ""}
              onChange={(event) =>
                setGateQuestion((current) => ({
                  ...current,
                  [contentLocale]: event.target.value,
                }))
              }
              disabled={readOnly}
            />
          </Field>
        ))}
      </fieldset>

      {/* ── localizations ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {CONTENT_LOCALES.map((contentLocale) => (
          <div key={contentLocale} className="flex flex-col gap-3 rounded-(--radius-md) bg-(--color-surface) p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
              {contentLocale === "de"
                ? strings.shared.localeDe
                : contentLocale === "en"
                  ? strings.shared.localeEn
                  : strings.shared.localeRu}
            </p>
            <Field label={strings.shared.title} required>
              <Input
                value={localizations[contentLocale]?.title ?? ""}
                onChange={(event) => setLocalized(contentLocale, { title: event.target.value })}
                disabled={readOnly}
              />
            </Field>
            <Field label={s.taskInstructions} hint={s.taskInstructionsHint} required>
              <Textarea
                rows={3}
                value={localizations[contentLocale]?.instructionsHtml ?? ""}
                onChange={(event) =>
                  setLocalized(contentLocale, { instructionsHtml: event.target.value })
                }
                disabled={readOnly}
              />
            </Field>
          </div>
        ))}
      </div>

      {/* ── hints ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-[15px] font-semibold">{s.taskHints}</h4>
            <p className="text-[13px] text-(--color-fg-muted)">{s.taskHintsHint}</p>
          </div>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              iconLeft={<Plus className="size-4" aria-hidden />}
              onClick={() => setHints((current) => [...current, { translations: emptyTranslations() }])}
            >
              {s.taskHintAdd}
            </Button>
          )}
        </div>

        {hints.length === 0 ? (
          <p className="text-[13px] text-(--color-fg-muted)">{s.taskHintsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hints.map((hint, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{index + 1}.</span>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${strings.shared.delete} ${index + 1}`}
                      onClick={() => setHints((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CONTENT_LOCALES.map((contentLocale) => (
                    <Input
                      key={contentLocale}
                      aria-label={`${s.taskHints} ${index + 1} ${contentLocale.toUpperCase()}`}
                      placeholder={contentLocale.toUpperCase()}
                      value={hint.translations[contentLocale] ?? ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        setHints((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  translations: {
                                    ...item.translations,
                                    [contentLocale]: event.target.value,
                                  },
                                }
                              : item
                          )
                        )
                      }
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── assessment ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[15px] font-semibold">{s.taskAssessment}</h4>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              iconLeft={<Plus className="size-4" aria-hidden />}
              onClick={() =>
                setOptions((current) => [...current, { labels: emptyTranslations(), isCorrect: false }])
              }
            >
              {s.taskOptionAdd}
            </Button>
          )}
        </div>

        {options.length > 0 && (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONTENT_LOCALES.map((contentLocale) => (
                <Field key={contentLocale} label={`${s.taskAssessmentQuestion} ${contentLocale.toUpperCase()}`}>
                  <Input
                    value={question[contentLocale] ?? ""}
                    disabled={readOnly}
                    onChange={(event) =>
                      setQuestion((current) => ({ ...current, [contentLocale]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label={s.taskAssessmentMode} className="sm:max-w-60">
              <Select
                value={selectionMode}
                disabled={readOnly}
                onChange={(event) =>
                  setSelectionMode(event.target.value === "multiple" ? "multiple" : "single")
                }
              >
                <option value="single">{s.taskAssessmentSingle}</option>
                <option value="multiple">{s.taskAssessmentMultiple}</option>
              </Select>
            </Field>
          </>
        )}

        {options.length === 0 ? (
          <p className="text-[13px] text-(--color-fg-muted)">{s.taskOptionsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border) p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {CONTENT_LOCALES.map((contentLocale) => (
                    <Input
                      key={contentLocale}
                      aria-label={`${s.taskOptions} ${index + 1} ${contentLocale.toUpperCase()}`}
                      placeholder={contentLocale.toUpperCase()}
                      value={option.labels[contentLocale] ?? ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        setOptions((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  labels: { ...item.labels, [contentLocale]: event.target.value },
                                }
                              : item
                          )
                        )
                      }
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="size-4 accent-(--color-brand)"
                      checked={option.isCorrect}
                      disabled={readOnly}
                      onChange={(event) =>
                        setOptions((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, isCorrect: event.target.checked }
                              : selectionMode === "single"
                                ? { ...item, isCorrect: false }
                                : item
                          )
                        )
                      }
                    />
                    {s.taskOptionCorrect}
                  </label>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${strings.shared.delete} ${index + 1}`}
                      onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} loading={pending}>
            {s.saveTask}
          </Button>
          <Button variant="ghost" onClick={onSaved} disabled={pending}>
            {s.cancelTask}
          </Button>
        </div>
      )}
    </div>
  );
}
