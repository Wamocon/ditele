import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Button, Card, CardTitle, CardDescription, ErrorState } from "@/shared/ui";
import { getCatalogCourse, resolveLocalization } from "@/shared/data/catalog";
import { getOptionalPrincipal } from "@/shared/auth/guard";
import { getDict } from "../../_lib/i18n";
import { formatDate, formatDuration, plainText, richTextParagraphs } from "../../_lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const dict = getDict(locale);
  const result = await getCatalogCourse(slug);
  if (!result.ok || !result.data) {
    return { title: `${dict.public.course.notFoundTitle} · DiTeLe` };
  }
  const localized = resolveLocalization(result.data, locale);
  return {
    title: `${localized?.title ?? result.data.slug} · DiTeLe`,
    description: localized?.summary ?? plainText(localized?.description_html),
  };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const dict = getDict(locale);
  const t = dict.public.course;

  const [result, session] = await Promise.all([getCatalogCourse(slug), getOptionalPrincipal()]);

  if (!result.ok) {
    return (
      <>
        <PageHeader title={t.errorTitle} />
        <ErrorState title={t.errorTitle} message={t.errorBody} />
      </>
    );
  }

  // An unknown slug comes back as an empty array from the RPC (I-016), not as
  // an error. That is a 404, not a failure.
  //
  // WS-1 had to render the view directly here, because a `not-found.tsx` inside
  // a route group is never the boundary for a nested segment and every miss
  // fell through to Next's unbranded English default (I-025). WS-7 added
  // `[locale]/not-found.tsx`, which *is* the nearest boundary, so this is a
  // real `notFound()` again — and the response is a real 404 instead of the
  // soft 200 that search engines would have indexed.
  if (!result.data) notFound();

  const course = result.data;
  const localized = resolveLocalization(course, locale);
  const title = localized?.title ?? course.slug;
  const paragraphs = richTextParagraphs(localized?.description_html);
  const outcomes = localized?.learning_outcomes ?? [];
  const duration = formatDuration(course.estimated_minutes, {
    hours: dict.public.units.hoursShort,
    minutes: dict.public.units.minutesShort,
  });
  // The language the visitor is reading in comes first; the rest keep a stable
  // alphabetical order rather than the RPC's insertion order.
  const languages = (course.localizations ?? [])
    .map((l) => l.locale)
    .sort((a, b) => (a === locale ? -1 : b === locale ? 1 : a.localeCompare(b)))
    .map((code) => code.toUpperCase())
    .join(" · ");

  const facts = [
    ...(duration ? [{ label: t.durationLabel, value: duration }] : []),
    { label: t.tasksLabel, value: String(course.task_count ?? 0) },
    ...(course.published_at
      ? [{ label: t.publishedLabel, value: formatDate(course.published_at, locale) }]
      : []),
    ...(course.version_number !== null
      ? [{ label: t.versionLabel, value: String(course.version_number) }]
      : []),
    ...(languages ? [{ label: t.languagesLabel, value: languages }] : []),
  ];

  const uiRole = session?.uiRole ?? null;

  return (
    <>
      <PageHeader
        title={title}
        {...(localized?.summary ? { description: localized.summary } : {})}
        breadcrumbs={[
          { label: t.breadcrumb, href: `/${locale}/catalog` },
          { label: title },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex flex-col gap-6">
          {paragraphs.length > 0 && (
            <section>
              <h2 className="mb-2 text-[22px] font-semibold leading-7">{t.overviewTitle}</h2>
              <div className="prose-measure flex flex-col gap-3">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-[15px] leading-6 text-(--color-fg-muted)">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          )}

          {outcomes.length > 0 && (
            <section>
              <h2 className="mb-3 text-[22px] font-semibold leading-7">{t.outcomesTitle}</h2>
              <ul className="prose-measure flex flex-col gap-2">
                {outcomes.map((outcome) => (
                  <li key={outcome} className="flex items-start gap-2 text-[15px] leading-6">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--color-success)" aria-hidden />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Anon cannot read `stages` or `tasks` at all (I-016), so the public
              page says so plainly instead of faking a curriculum accordion. */}
          <section>
            <h2 className="mb-3 text-[22px] font-semibold leading-7">{t.curriculumTitle}</h2>
            <Card className="flex items-start gap-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-(--color-fg-subtle)" aria-hidden />
              <p className="text-[15px] leading-6 text-(--color-fg-muted)">{t.curriculumLocked}</p>
            </Card>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-height)+16px)] lg:self-start">
          <Card className="flex flex-col gap-3">
            <CardTitle className="text-[15px] uppercase tracking-[0.04em] text-(--color-fg-muted)">
              {t.factsTitle}
            </CardTitle>
            <dl className="flex flex-col gap-2">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex items-baseline justify-between gap-3 border-b border-(--color-border) pb-2 last:border-0 last:pb-0"
                >
                  <dt className="text-[13px] text-(--color-fg-muted)">{fact.label}</dt>
                  <dd className="tabular text-[15px] font-semibold">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="flex flex-col gap-3">
            {uiRole === null && (
              <>
                <CardTitle>{t.ctaGuestTitle}</CardTitle>
                <CardDescription>{t.ctaGuestBody}</CardDescription>
                <Link href={`/${locale}/register` as Route}>
                  <Button fullWidth iconRight={<ArrowRight className="size-4" aria-hidden />}>
                    {t.ctaGuestAction}
                  </Button>
                </Link>
                <Link
                  href={`/${locale}/login` as Route}
                  className="text-center text-[13px] font-semibold text-(--color-brand) hover:underline"
                >
                  {t.ctaGuestSecondary}
                </Link>
              </>
            )}

            {uiRole === "student" && (
              <>
                <CardTitle>{t.ctaStudentTitle}</CardTitle>
                <CardDescription>{t.ctaStudentBody}</CardDescription>
                {/* Owned by WS-3. */}
                <Link href={`/${locale}/learn/enroll/${course.course_id}` as Route}>
                  <Button fullWidth iconRight={<ArrowRight className="size-4" aria-hidden />}>
                    {t.ctaStudentAction}
                  </Button>
                </Link>
              </>
            )}

            {(uiRole === "trainer" || uiRole === "admin") && (
              <>
                <CardTitle>{t.ctaStaffTitle}</CardTitle>
                <CardDescription>{t.ctaStaffBody}</CardDescription>
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
