"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import { Badge, Button, Card, CardTitle, Field, Input, StatusBadge, Textarea } from "@/shared/ui";
import {
  createVersionAction,
  saveCourseLocalizationAction,
  saveCourseMetaAction,
  setCourseStateAction,
  type ActionState,
} from "../actions";
import { adminStrings, format, formatDate, type AdminStrings } from "../i18n";
import {
  CONTENT_LOCALES,
  SHOW_CONTENT_LOCALE_LABELS,
  isVersionEditable,
  type AdminCourseDetail,
} from "../model";

function localeLabel(locale: string, strings: AdminStrings): string {
  if (locale === "de") return strings.shared.localeDe;
  if (locale === "en") return strings.shared.localeEn;
  return strings.shared.localeRu;
}

export function CourseDetail({
  locale,
  course,
}: {
  locale: string;
  course: AdminCourseDetail;
}) {
  const strings = adminStrings(locale);
  const s = strings.course;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });

  const [slug, setSlug] = useState(course.slug);
  const [defaultLocale, setDefaultLocale] = useState(course.defaultLocale);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      CONTENT_LOCALES.map((contentLocale) => {
        const entry = course.localizations.find((item) => item.locale === contentLocale);
        return [
          contentLocale,
          {
            title: entry?.title ?? "",
            summary: entry?.summary ?? "",
            descriptionHtml: entry?.descriptionHtml ?? "",
            // §1.1 marks both videos translated, and course_localizations keeps
            // a row per locale, so they belong in the per-locale block rather
            // than beside the slug.
            examVideoUrl: entry?.examVideoUrl ?? "",
            completionVideoUrl: entry?.completionVideoUrl ?? "",
          },
        ];
      })
    )
  );

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      setState(await action());
    });

  // §1.1's cover image, editable after creation — the create form could set it
  // and nothing could change it afterwards.
  const [heroImageUrl, setHeroImageUrl] = useState(course.heroImageUrl);

  const archived = course.state === "archived";

  return (
    <div className="flex flex-col gap-4">
      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger)"
        >
          {state.message}
        </p>
      )}
      {state.status === "ok" && (
        <p
          role="status"
          className="rounded-(--radius-md) bg-(--color-success-soft) px-3 py-2 text-[13px] text-(--color-success)"
        >
          {strings.shared.saved}
        </p>
      )}

      {/**
        * ── TASKS, first ────────────────────────────────────────────────────
        *
        * This card exists because there was no way to reach a task from the
        * course. Tasks lived two clicks down, behind a "Versions" list and an
        * "Edit content" button — and a version is an internal concept an admin
        * never asked for. The reported symptom was exactly that: "I cannot see
        * the option to add task in the course."
        *
        * So the course page now opens with its tasks, and the version it edits
        * is chosen here rather than by the admin:
        *
        *   a DRAFT version if there is one   — edits go to the draft, as they must
        *   otherwise the PUBLISHED one       — "Edit tasks" then creates the draft
        *
        * The Versions card below is kept for the cases it is genuinely for —
        * publishing history, and deliberately starting a second draft — but it
        * is no longer the only door to a task.
        */}
      {(() => {
        const draft = course.versions.find((version) => version.state === "draft");
        const published = course.versions.find((version) => version.state === "published");
        const editable = draft ?? course.versions.find((v) => v.state === "in_review") ?? published;
        return (
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{s.sectionTasks}</CardTitle>
                <p className="mt-1 text-[13px] leading-5 text-(--color-fg-muted)">{s.tasksHint}</p>
              </div>
              {editable && (
                <Link
                  href={`/${locale}/admin/courses/${course.id}/versions/${editable.id}` as Route}
                >
                  <Button iconLeft={<Plus className="size-4" aria-hidden />}>
                    {editable.taskCount === 0 ? s.taskAdd : s.tasksOpen}
                  </Button>
                </Link>
              )}
            </div>

            {!editable ? (
              <p className="rounded-(--radius-md) border border-dashed border-(--color-border-strong) px-3 py-6 text-center text-[13px] text-(--color-fg-muted)">
                {s.tasksNoVersion}
              </p>
            ) : editable.taskCount === 0 ? (
              <p className="rounded-(--radius-md) border border-dashed border-(--color-border-strong) px-3 py-6 text-center text-[13px] text-(--color-fg-muted)">
                {s.tasksEmpty}
              </p>
            ) : (
              <p className="text-[15px]">
                {format(s.tasksCount, {
                  count: editable.taskCount,
                  stages: editable.stageCount,
                })}
              </p>
            )}
          </Card>
        );
      })()}

      {/* ── metadata ──────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{s.sectionMeta}</CardTitle>
          <StatusBadge state={course.state} locale={locale} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.shared.slug} required>
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} />
          </Field>
          {/* A picker with one option is not a choice. `defaultLocale` still
              rides along in state and still posts — the value is simply the
              only one there is, so there is nothing to ask. */}
          {SHOW_CONTENT_LOCALE_LABELS && (
            <Field label={strings.courseNew.defaultLocale}>
              <select
                value={defaultLocale}
                onChange={(event) => setDefaultLocale(event.target.value)}
                className="h-11 w-full rounded-(--radius-md) border border-(--color-border-strong) bg-(--color-bg) px-3 pr-8 text-[15px] text-(--color-fg)"
              >
                {CONTENT_LOCALES.map((contentLocale) => (
                  <option key={contentLocale} value={contentLocale}>
                    {localeLabel(contentLocale, strings)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <Field label={strings.courseNew.heroImage} hint={strings.courseNew.heroImageHint}>
          <Input
            value={heroImageUrl}
            onChange={(event) => setHeroImageUrl(event.target.value)}
            placeholder="https://…"
          />
        </Field>

        <div>
          <Button
            loading={pending}
            onClick={() =>
              run(() =>
                saveCourseMetaAction({
                  locale,
                  courseId: course.id,
                  slug,
                  defaultLocale,
                  estimatedMinutes: null,
                  heroImageUrl,
                })
              )
            }
          >
            {s.saveMeta}
          </Button>
        </div>
      </Card>

      {/* ── availability ──────────────────────────────────────────────────
          The lifecycle bar governs a *version* (draft → in review → published).
          This governs the *course*: whether the catalogue offers it at all. Two
          separate axes — a published version on an inactive course is invisible,
          which is exactly what an admin wants while preparing the next intake. */}
      {!archived && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{s.sectionAvailability}</CardTitle>
            <StatusBadge state={course.state} locale={locale} />
          </div>
          <p className="text-[13px] leading-5 text-(--color-fg-muted)">{s.availabilityHint}</p>
          <div>
            {course.state === "active" ? (
              <Button
                variant="outline"
                loading={pending}
                onClick={() =>
                  run(() =>
                    setCourseStateAction({ locale, courseId: course.id, state: "inactive" })
                  )
                }
              >
                {s.deactivate}
              </Button>
            ) : (
              <Button
                loading={pending}
                onClick={() =>
                  run(() => setCourseStateAction({ locale, courseId: course.id, state: "active" }))
                }
              >
                {s.activate}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── localizations ─────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>{s.sectionLocalizations}</CardTitle>
          <p className="mt-1 text-[13px] leading-5 text-(--color-fg-muted)">
            {strings.courseNew.optionalLocalesHint}
          </p>
        </div>

        {CONTENT_LOCALES.map((contentLocale) => {
          const draft = drafts[contentLocale]!;
          const complete =
            draft.title.trim() !== "" &&
            draft.summary.trim() !== "" &&
            draft.descriptionHtml.trim() !== "";
          return (
            <div
              key={contentLocale}
              className="flex flex-col gap-3 rounded-(--radius-md) bg-(--color-surface) p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {SHOW_CONTENT_LOCALE_LABELS && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
                    {localeLabel(contentLocale, strings)}
                  </p>
                )}
                <Badge tone={complete ? "success" : "warning"}>
                  {complete ? (
                    <Check className="size-3" aria-hidden />
                  ) : (
                    <X className="size-3" aria-hidden />
                  )}
                  {complete ? s.localeComplete : s.localeMissing}
                </Badge>
              </div>

              <Field label={strings.shared.title} required>
                <Input
                  value={draft.title}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [contentLocale]: { ...current[contentLocale]!, title: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label={strings.shared.summary} required>
                <Textarea
                  rows={2}
                  value={draft.summary}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [contentLocale]: { ...current[contentLocale]!, summary: event.target.value },
                    }))
                  }
                />
              </Field>
              <Field label={strings.shared.description} hint={strings.courseNew.descriptionHint} required>
                <Textarea
                  rows={3}
                  value={draft.descriptionHtml}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [contentLocale]: {
                        ...current[contentLocale]!,
                        descriptionHtml: event.target.value,
                      },
                    }))
                  }
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={strings.courseNew.examVideo} hint={strings.courseNew.videoHint}>
                  <Input
                    value={draft.examVideoUrl}
                    placeholder="https://…"
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [contentLocale]: {
                          ...current[contentLocale]!,
                          examVideoUrl: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
                <Field label={strings.courseNew.completionVideo} hint={strings.courseNew.videoHint}>
                  <Input
                    value={draft.completionVideoUrl}
                    placeholder="https://…"
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [contentLocale]: {
                          ...current[contentLocale]!,
                          completionVideoUrl: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
              </div>

              <div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  onClick={() =>
                    run(() =>
                      saveCourseLocalizationAction({
                        locale,
                        courseId: course.id,
                        contentLocale,
                        title: draft.title,
                        summary: draft.summary,
                        descriptionHtml: draft.descriptionHtml,
                        examVideoUrl: draft.examVideoUrl,
                        completionVideoUrl: draft.completionVideoUrl,
                      })
                    )
                  }
                >
                  {s.saveLocalization}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      {/* ── versions ──────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{s.sectionVersions}</CardTitle>
            <p className="mt-1 text-[13px] leading-5 text-(--color-fg-muted)">{s.versionNewHint}</p>
          </div>
          <Button
            variant="outline"
            loading={pending}
            iconLeft={<Plus className="size-4" aria-hidden />}
            onClick={() =>
              startTransition(async () => {
                const result = await createVersionAction({ locale, courseId: course.id });
                setState(result);
                if (result.versionId) {
                  router.push(
                    `/${locale}/admin/courses/${course.id}/versions/${result.versionId}` as Route
                  );
                }
              })
            }
          >
            {s.versionNew}
          </Button>
        </div>

        {course.versions.length === 0 ? (
          <p className="rounded-(--radius-md) border border-dashed border-(--color-border-strong) px-3 py-6 text-center text-[13px] text-(--color-fg-muted)">
            {s.versionsEmptyDescription}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {course.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-border) p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">
                      {format(s.versionNumber, { number: version.versionNumber })}
                    </span>
                    <StatusBadge state={version.state} locale={locale} />
                    {isVersionEditable(version.state) && (
                      <Badge tone="brand">{strings.shared.edit}</Badge>
                    )}
                  </div>
                  <p className="text-[13px] text-(--color-fg-muted)">
                    {version.changeSummary || "—"} ·{" "}
                    <span className="tabular">
                      {version.stageCount} {strings.studio.stages} · {version.taskCount}{" "}
                      {strings.studio.tasks}
                    </span>
                    {version.publishedAt && (
                      <>
                        {" · "}
                        {format(s.versionPublished, {
                          date: formatDate(version.publishedAt, locale),
                        })}
                      </>
                    )}
                  </p>
                </div>

                <Link
                  href={`/${locale}/admin/courses/${course.id}/versions/${version.id}` as Route}
                  className="inline-flex min-h-11 items-center rounded-(--radius-md) border border-(--color-border-strong) px-4 text-[15px] font-semibold hover:bg-(--color-surface)"
                >
                  {s.versionOpen}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── archive ───────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-3 border-(--color-danger)">
        <CardTitle>{s.sectionDanger}</CardTitle>
        <p className="text-[13px] leading-5 text-(--color-fg-muted)">{s.archiveHint}</p>

        {archived ? (
          <div>
            <Button
              variant="outline"
              loading={pending}
              onClick={() =>
                run(() => setCourseStateAction({ locale, courseId: course.id, state: "active" }))
              }
            >
              {s.unarchive}
            </Button>
          </div>
        ) : confirmArchive ? (
          <div className="flex flex-wrap items-center gap-2 rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px]">
            <span className="text-(--color-danger)">{s.archiveConfirm}</span>
            <Button
              size="sm"
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() =>
                  setCourseStateAction({ locale, courseId: course.id, state: "archived" })
                )
              }
            >
              {s.archive}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>
              {strings.studio.cancelTask}
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="danger" onClick={() => setConfirmArchive(true)}>
              {s.archive}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
