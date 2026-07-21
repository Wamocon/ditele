import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, MonitorPlay, ClipboardCheck, MessagesSquare } from "lucide-react";

import { Button, Card, CardTitle, CardDescription, EmptyState, ErrorState } from "@/shared/ui";
import { listCatalogCourses } from "@/shared/data/catalog";
import { getOptionalPrincipal } from "@/shared/auth/guard";
import { locales } from "@/shared/i18n/config";
import { getDict } from "./_lib/i18n";
import { Reveal } from "./_components/reveal";
import { CourseCard } from "./_components/course-card";

const PREVIEW_COUNT = 6;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(locale);
  return { title: `DiTeLe — ${dict.public.landing.title}`, description: dict.public.landing.subtitle };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDict(locale);
  const t = dict.public.landing;

  const [catalog, session] = await Promise.all([
    listCatalogCourses({ locale, limit: PREVIEW_COUNT, offset: 0 }),
    getOptionalPrincipal(),
  ]);

  const courses = catalog.ok ? catalog.data.courses : [];
  const totalCourses = catalog.ok ? catalog.data.total : 0;
  const totalTasks = courses.reduce((sum, course) => sum + (course.task_count ?? 0), 0);

  const values = [
    { icon: MonitorPlay, title: t.value1Title, body: t.value1Body },
    { icon: ClipboardCheck, title: t.value2Title, body: t.value2Body },
    { icon: MessagesSquare, title: t.value3Title, body: t.value3Body },
  ];

  const steps = [
    { title: t.step1Title, body: t.step1Body },
    { title: t.step2Title, body: t.step2Body },
    { title: t.step3Title, body: t.step3Body },
    { title: t.step4Title, body: t.step4Body },
  ];

  const stats = [
    { value: totalCourses, label: t.statCourses },
    { value: totalTasks, label: t.statTasks },
    { value: locales.length, label: t.statLanguages },
  ];

  // Bleeds to the container edge: full width on mobile, 1200px on desktop.
  const bleed = "-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8";

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className={`${bleed} -mt-6 rounded-b-(--radius-xl) bg-[linear-gradient(180deg,var(--color-brand-soft)_0%,var(--color-bg)_100%)] py-12 lg:-mt-8 lg:py-20`}
      >
        <div className="flex max-w-[720px] flex-col items-start gap-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            <span className="flex items-center gap-1" aria-hidden>
              <span className="size-2 rounded-full bg-(--color-brand)" />
              <span className="size-2 rounded-full bg-(--color-ink)" />
              <span className="size-2 rounded-full bg-(--color-brand)" />
            </span>
            {t.eyebrow}
          </p>

          <h1 className="text-[32px] font-bold leading-9 lg:text-[40px] lg:leading-[44px]">
            {t.title}
          </h1>

          <p className="max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted) lg:text-[17px] lg:leading-7">
            {t.subtitle}
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link href={`/${locale}/catalog` as Route} className="sm:w-auto">
              <Button size="lg" fullWidth iconRight={<ArrowRight className="size-4" aria-hidden />}>
                {t.ctaPrimary}
              </Button>
            </Link>
            {!session && (
              <Link href={`/${locale}/register` as Route} className="sm:w-auto">
                <Button size="lg" variant="outline" fullWidth>
                  {t.ctaSecondary}
                </Button>
              </Link>
            )}
          </div>

          <dl className="mt-4 grid w-full grid-cols-3 gap-4 border-t border-(--color-border) pt-5">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-0.5">
                <dd className="tabular text-[26px] font-semibold leading-8 lg:text-[30px]">
                  {stat.value}
                </dd>
                <dt className="text-[13px] leading-5 text-(--color-fg-muted)">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Why DiTeLe ──────────────────────────────────────────────────── */}
      <section className="py-12 lg:py-16">
        <Reveal>
          <h2 className="text-[22px] font-semibold leading-7">{t.valueTitle}</h2>
          <p className="mt-1 max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted)">
            {t.valueSubtitle}
          </p>
        </Reveal>

        <div className="mt-6 grid gap-4 md:grid-cols-3 lg:gap-5">
          {values.map((value, index) => (
            <Reveal key={value.title} delayMs={index * 40}>
              <Card className="flex h-full flex-col gap-3">
                <span className="flex size-10 items-center justify-center rounded-(--radius-md) bg-(--color-brand-soft) text-(--color-brand)">
                  <value.icon className="size-5" aria-hidden />
                </span>
                <CardTitle>{value.title}</CardTitle>
                <CardDescription className="text-[15px] leading-6">{value.body}</CardDescription>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className={`${bleed} rounded-(--radius-xl) bg-(--color-surface) py-12 lg:py-16`}>
        <Reveal>
          <h2 className="text-[22px] font-semibold leading-7">{t.howTitle}</h2>
          <p className="mt-1 max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted)">
            {t.howSubtitle}
          </p>
        </Reveal>

        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {steps.map((step, index) => (
            <Reveal key={step.title} delayMs={index * 40}>
              <li className="flex h-full flex-col gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-4 lg:p-5">
                {/* Navy, not red: white on --color-brand is only ~3.4:1 in dark
                    mode, and 13px bold does not count as large text. Ink against
                    the page background is 13.4:1 in both themes. */}
                <span className="tabular flex size-8 items-center justify-center rounded-full bg-(--color-ink) text-[13px] font-semibold text-(--color-bg)">
                  {index + 1}
                </span>
                <h3 className="text-[18px] font-semibold leading-6">{step.title}</h3>
                <p className="text-[15px] leading-6 text-(--color-fg-muted)">{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Course preview ──────────────────────────────────────────────── */}
      <section className="py-12 lg:py-16">
        <Reveal>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold leading-7">{t.coursesTitle}</h2>
              <p className="mt-1 max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted)">
                {t.coursesSubtitle}
              </p>
            </div>
            <Link
              href={`/${locale}/catalog` as Route}
              /* min-h-11 = the 44px mobile touch target. A 24px-tall standalone
                 link is a miss on a phone, and this one is a section CTA, not
                 a word inside a sentence. */
              className="flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] font-semibold text-(--color-brand) hover:underline"
            >
              {t.coursesLink}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Reveal>

        <div className="mt-6">
          {!catalog.ok ? (
            <ErrorState title={t.coursesErrorTitle} message={t.coursesErrorBody} />
          ) : courses.length === 0 ? (
            <EmptyState title={t.coursesEmptyTitle} description={t.coursesEmptyBody} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {courses.map((course, index) => (
                <li key={course.course_id}>
                  <Reveal delayMs={index * 40} className="h-full">
                    <CourseCard
                      course={course}
                      locale={locale}
                      labels={{
                        open: dict.public.catalog.open,
                        tasks: dict.public.catalog.tasksLabel,
                        hoursShort: dict.public.units.hoursShort,
                        minutesShort: dict.public.units.minutesShort,
                      }}
                    />
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Closing call to action ──────────────────────────────────────── */}
      {!session && (
        <section
          className={`${bleed} mb-2 rounded-(--radius-xl) bg-(--color-brand-soft) py-12 text-center lg:py-16`}
        >
          <Reveal>
            <h2 className="text-[26px] font-semibold leading-8 lg:text-[30px] lg:leading-9">
              {t.finalTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-6 text-(--color-fg-muted)">
              {t.finalBody}
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={`/${locale}/register` as Route}>
                <Button size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  {t.finalAction}
                </Button>
              </Link>
              <Link
                href={`/${locale}/login` as Route}
                className="inline-flex min-h-11 items-center text-[15px] font-semibold text-(--color-brand) hover:underline"
              >
                {t.finalSecondary}
              </Link>
            </div>
          </Reveal>
        </section>
      )}
    </>
  );
}
