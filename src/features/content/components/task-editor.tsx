"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea, cn } from "@/shared/ui";
import { saveTaskAction, type ActionState } from "../actions";
import type { AdminStrings } from "../i18n";
import { CONTENT_LOCALES, TASK_KINDS, type SkillOption, type StudioTask } from "../model";

const BASIS_POINTS = 10000;

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

interface SkillDraft {
  skillId: string;
  /** Held as a percentage in the UI; converted to basis points on save. */
  percent: number;
  evidenceRequired: boolean;
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
    skills: task.skills.map(
      (skill): SkillDraft => ({
        skillId: skill.skillId,
        percent: Math.round(skill.weightBasisPoints / 100),
        evidenceRequired: skill.evidenceRequired,
      })
    ),
  };
}

export interface TaskEditorProps {
  locale: string;
  courseId: string;
  versionId: string;
  task: StudioTask;
  skills: SkillOption[];
  strings: AdminStrings;
  readOnly: boolean;
  onSaved: () => void;
}

export function TaskEditor({
  locale,
  courseId,
  versionId,
  task,
  skills,
  strings,
  readOnly,
  onSaved,
}: TaskEditorProps) {
  const s = strings.studio;
  const initial = toDrafts(task);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const [kind, setKind] = useState(task.kind);
  const [minutes, setMinutes] = useState(task.expectedMinutes?.toString() ?? "");
  const [targetUrl, setTargetUrl] = useState(task.targetUrl ?? "");
  const [localizations, setLocalizations] = useState(initial.localizations);
  const [hints, setHints] = useState<HintDraft[]>(initial.hints);
  const [options, setOptions] = useState<OptionDraft[]>(initial.options);
  const [question, setQuestion] = useState(initial.question);
  const [selectionMode, setSelectionMode] = useState(initial.selectionMode);
  const [skillDrafts, setSkillDrafts] = useState<SkillDraft[]>(initial.skills);

  const percentTotal = skillDrafts.reduce((sum, skill) => sum + (skill.percent || 0), 0);
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
        expectedMinutes: minutes.trim() === "" ? null : Number(minutes),
        targetUrl: targetUrl.trim() === "" ? null : targetUrl.trim(),
        localizations: CONTENT_LOCALES.map((contentLocale) => ({
          locale: contentLocale,
          title: localizations[contentLocale]?.title ?? "",
          instructionsHtml: localizations[contentLocale]?.instructionsHtml ?? "",
        })),
        hints: hints.map((hint) => ({ translations: hint.translations })),
        skills: skillDrafts
          .filter((skill) => skill.skillId)
          .map((skill) => ({
            skillId: skill.skillId,
            weightBasisPoints: Math.round((skill.percent || 0) * 100),
            evidenceRequired: skill.evidenceRequired,
          })),
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
    <div className="flex flex-col gap-5 border-t border-[--color-border] pt-4">
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-[--radius-md] bg-[--color-danger-soft] px-3 py-2 text-[13px] text-[--color-danger]"
        >
          {state.message}
        </p>
      )}

      {/* ── basics ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={s.taskKind}>
          <Select value={kind} onChange={(event) => setKind(event.target.value)} disabled={readOnly}>
            {TASK_KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={s.taskMinutes}>
          <Input
            type="number"
            min={0}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            disabled={readOnly}
          />
        </Field>
      </div>

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

      {/* ── localizations ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {CONTENT_LOCALES.map((contentLocale) => (
          <div key={contentLocale} className="flex flex-col gap-3 rounded-[--radius-md] bg-[--color-surface] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[--color-fg-muted]">
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
            <p className="text-[13px] text-[--color-fg-muted]">{s.taskHintsHint}</p>
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
          <p className="text-[13px] text-[--color-fg-muted]">{s.taskHintsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hints.map((hint, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-[--radius-md] border border-[--color-border] p-3">
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

      {/* ── skills ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-[15px] font-semibold">{s.taskSkills}</h4>
            <p className="text-[13px] text-[--color-fg-muted]">{s.taskSkillsHint}</p>
          </div>
          {!readOnly && skills.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              iconLeft={<Plus className="size-4" aria-hidden />}
              onClick={() =>
                setSkillDrafts((current) => [
                  ...current,
                  {
                    skillId: skills[0]?.id ?? "",
                    percent: current.length === 0 ? 100 : 0,
                    evidenceRequired: false,
                  },
                ])
              }
            >
              {s.taskSkillAdd}
            </Button>
          )}
        </div>

        {skillDrafts.length === 0 ? (
          <p className="text-[13px] text-[--color-fg-muted]">{s.taskSkillsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {skillDrafts.map((skill, index) => (
              <li
                key={index}
                className="grid gap-2 rounded-[--radius-md] border border-[--color-border] p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
              >
                <Field label={s.taskSkills}>
                  <Select
                    value={skill.skillId}
                    disabled={readOnly}
                    onChange={(event) =>
                      setSkillDrafts((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, skillId: event.target.value } : item
                        )
                      )
                    }
                  >
                    {skills.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.labels[locale] || option.labels.de || option.code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={s.taskSkillWeight} className="sm:w-28">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={skill.percent}
                    disabled={readOnly}
                    onChange={(event) =>
                      setSkillDrafts((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, percent: Number(event.target.value) } : item
                        )
                      )
                    }
                  />
                </Field>
                <label className="flex h-11 items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="size-4 accent-[--color-brand]"
                    checked={skill.evidenceRequired}
                    disabled={readOnly}
                    onChange={(event) =>
                      setSkillDrafts((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, evidenceRequired: event.target.checked } : item
                        )
                      )
                    }
                  />
                  {s.taskSkillEvidence}
                </label>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${strings.shared.delete} ${index + 1}`}
                    onClick={() =>
                      setSkillDrafts((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p
          className={cn(
            "tabular text-[13px] font-semibold",
            percentTotal === 100 ? "text-[--color-success]" : "text-[--color-warning]"
          )}
        >
          {percentTotal} % / 100 %
        </p>
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
          <p className="text-[13px] text-[--color-fg-muted]">{s.taskOptionsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((option, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-[--radius-md] border border-[--color-border] p-3">
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
                      className="size-4 accent-[--color-brand]"
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
          {percentTotal !== BASIS_POINTS / 100 && (
            <p className="self-center text-[13px] text-[--color-fg-muted]">{s.taskSkillsHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
