"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { Button, Card, CardTitle, Field, Input, Textarea } from "@/shared/ui";
import { createCourseAction } from "../actions";
import type { AdminStrings } from "../i18n";

/** `Grundlagen des Testens!` → `grundlagen-des-testens`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** exactOptionalPropertyTypes: an absent error must be an absent prop, not undefined. */
const errorProp = (message: string | undefined) => (message ? { error: message } : {});

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function CourseForm({ locale, strings }: { locale: string; strings: AdminStrings }) {
  const s = strings.courseNew;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [titleDe, setTitleDe] = useState("");
  const [summaryDe, setSummaryDe] = useState("");
  const [descriptionDe, setDescriptionDe] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [defaultLocale, setDefaultLocale] = useState("de");
  // Course media — §1.1. The columns shipped in Phase 1a and had no input on
  // any screen until now, so a cover image or motivational video could only be
  // set with SQL.
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [examVideoUrl, setExamVideoUrl] = useState("");
  const [completionVideoUrl, setCompletionVideoUrl] = useState("");

  const effectiveSlug = slugTouched ? slug : slugify(titleDe);

  const submit = () => {
    const errors: Record<string, string> = {};
    if (!titleDe.trim()) errors.titleDe = s.errorTitleRequired;
    if (!summaryDe.trim()) errors.summaryDe = s.errorSummaryRequired;
    if (!SLUG_PATTERN.test(effectiveSlug)) errors.slug = s.errorSlugFormat;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = await createCourseAction({
        locale,
        slug: effectiveSlug,
        defaultLocale,
        estimatedMinutes: minutes.trim() === "" ? null : Number(minutes),
        heroImageUrl,
        examVideoUrl,
        completionVideoUrl,
        titleDe,
        summaryDe,
        descriptionDe,
        // Course content is German-only (CONTENT_LOCALES === ["de"]). The action
        // still accepts these, so send empties rather than change its contract.
        titleEn: "",
        summaryEn: "",
        titleRu: "",
        summaryRu: "",
      });

      if (result.status === "error") {
        // 23505 is the slug's unique index — the one collision an author can fix.
        setError(result.message.includes("bereits") ? s.errorSlug : result.message);
        return;
      }
      // Straight into the studio: an empty course is not the finish line.
      router.push(
        `/${locale}/admin/courses/${result.courseId}/versions/${result.versionId}` as Route
      );
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-(--radius-md) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger)"
        >
          {error}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <CardTitle>{s.sectionBasics}</CardTitle>

        <Field label={s.titleDe} required {...errorProp(fieldErrors.titleDe)}>
          <Input value={titleDe} onChange={(event) => setTitleDe(event.target.value)} />
        </Field>

        <Field label={strings.shared.slug} hint={s.slugHint} required {...errorProp(fieldErrors.slug)}>
          <Input
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.shared.minutes} hint={s.minutesHint}>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
          <Field label={s.defaultLocale}>
            <select
              value={defaultLocale}
              onChange={(event) => setDefaultLocale(event.target.value)}
              className="h-11 w-full rounded-(--radius-md) border border-(--color-border-strong) bg-(--color-bg) px-3 pr-8 text-[15px] text-(--color-fg)"
            >
              <option value="de">{strings.shared.localeDe}</option>
              <option value="en">{strings.shared.localeEn}</option>
              <option value="ru">{strings.shared.localeRu}</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>{s.sectionLocalizations}</CardTitle>

        <Field label={s.summaryDe} required {...errorProp(fieldErrors.summaryDe)}>
          <Textarea rows={2} value={summaryDe} onChange={(event) => setSummaryDe(event.target.value)} />
        </Field>
        <Field label={s.descriptionDe} hint={s.descriptionHint}>
          <Textarea
            rows={4}
            value={descriptionDe}
            onChange={(event) => setDescriptionDe(event.target.value)}
          />
        </Field>
      </Card>

      {/**
        * Course media — FEATURE_BUILD_PLAN §1.1.
        *
        * ⚠️ There is deliberately NO redirect-URL field. It appeared in the
        * first mock-up and was explicitly dropped; adding one back because the
        * mock-up shows it is the single easiest mistake to make on this form.
        *
        * The two videos are per-locale in the schema (`course_localizations`)
        * because §1.1 marks them translated. Only the German row is written
        * here, matching how the rest of this form treats course content —
        * CONTENT_LOCALES === ["de"], and the studio has no locale tabs for
        * media yet.
        */}
      <Card className="flex flex-col gap-4">
        <CardTitle>{s.sectionMedia}</CardTitle>

        <Field label={s.heroImage} hint={s.heroImageHint}>
          <Input
            value={heroImageUrl}
            onChange={(event) => setHeroImageUrl(event.target.value)}
            placeholder="https://…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={s.examVideo} hint={s.videoHint}>
            <Input
              value={examVideoUrl}
              onChange={(event) => setExamVideoUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label={s.completionVideo} hint={s.videoHint}>
            <Input
              value={completionVideoUrl}
              onChange={(event) => setCompletionVideoUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>
      </Card>


      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} loading={pending}>
          {pending ? s.submitting : s.submit}
        </Button>
      </div>
    </div>
  );
}
