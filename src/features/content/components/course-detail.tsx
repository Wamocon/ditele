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
import { CONTENT_LOCALES, isVersionEditable, type AdminCourseDetail } from "../model";

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
  const [minutes, setMinutes] = useState(course.estimatedMinutes?.toString() ?? "");
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
          },
        ];
      })
    )
  );

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      setState(await action());
    });

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

      {/* ── metadata ──────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{s.sectionMeta}</CardTitle>
          <StatusBadge state={course.state} locale={locale} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={strings.shared.slug} required>
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} />
          </Field>
          <Field label={strings.shared.minutes}>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
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
        </div>

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
                  estimatedMinutes: minutes.trim() === "" ? null : Number(minutes),
                })
              )
            }
          >
            {s.saveMeta}
          </Button>
        </div>
      </Card>

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
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
                  {localeLabel(contentLocale, strings)}
                </p>
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
