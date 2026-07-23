import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap, Bug, Send, MessagesSquare } from "lucide-react";

import { Button, EmptyState, ErrorState, DotMark } from "@/shared/ui";
import { listActiveCourses } from "@/shared/data/catalog";
import { getOptionalPrincipal } from "@/shared/auth/guard";
import { Reveal } from "./_components/reveal";
import { CourseCard } from "./_components/course-card";

const HERO_TITLE = "Softwaretesten lernt man durch Testen.";
const HERO_SUBTITLE =
  "DiTeLe bringt dir Softwaretesten mit echten Aufgaben und Bug-Hunts bei — Schritt für Schritt, mit Feedback von echten Trainerinnen und Trainern.";

export function generateMetadata(): Metadata {
  return { title: `DiTeLe — ${HERO_TITLE}`, description: HERO_SUBTITLE };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  const [catalog, session] = await Promise.all([listActiveCourses(), getOptionalPrincipal()]);
  const courses = catalog.ok ? catalog.data : [];

  // The four steps of the loop, in order — this is the whole product in one line.
  const steps = [
    {
      icon: GraduationCap,
      title: "Lernen",
      body: "Arbeite dich durch die Kursaufgaben — mit Videos, Hinweisen und einer Pflichtfrage je Aufgabe.",
    },
    {
      icon: Bug,
      title: "Üben",
      body: "Finde in der Arena echte Fehler in HTML-Oberflächen. Jeder gelöste Bug-Hunt schaltet den nächsten frei.",
    },
    {
      icon: Send,
      title: "Einreichen",
      body: "Reiche deine Lösung ein — bei Bug-Hunts mit Screenshots und einer Beschreibung jedes gefundenen Fehlers.",
    },
    {
      icon: MessagesSquare,
      title: "Feedback",
      body: "Trainer prüfen deine Abgabe, geben Rückmeldung und vergeben XP und Abzeichen für angenommene Bug-Hunts.",
    },
  ];

  // Bleeds to the container edge: full width on mobile, up to the container on desktop.
  const bleed = "-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8";

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className={`${bleed} -mt-6 rounded-b-(--radius-xl) bg-[linear-gradient(180deg,var(--color-brand-soft)_0%,var(--color-bg)_100%)] py-12 lg:-mt-8 lg:py-20`}
      >
        <div className="flex max-w-[720px] flex-col items-start gap-5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-(--color-fg-muted)">
            <DotMark />
            DiTeLe · Digital Testing Learning
          </p>

          <h1 className="text-[32px] font-bold leading-9 lg:text-[40px] lg:leading-[44px]">
            {HERO_TITLE}
          </h1>

          <p className="max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted) lg:text-[17px] lg:leading-7">
            {HERO_SUBTITLE}
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link href={`/${locale}/catalog` as Route} className="sm:w-auto">
              <Button size="lg" fullWidth iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Kurse ansehen
              </Button>
            </Link>
            {!session && (
              <Link href={`/${locale}/login` as Route} className="sm:w-auto">
                <Button size="lg" variant="outline" fullWidth>
                  Anmelden
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── So funktioniert's ───────────────────────────────────────────── */}
      <section className={`${bleed} rounded-(--radius-xl) bg-(--color-surface) py-12 lg:py-16`}>
        <Reveal>
          <h2 className="text-[22px] font-semibold leading-7">So funktioniert&rsquo;s</h2>
          <p className="mt-1 max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted)">
            Vier Schritte, die sich für jede Aufgabe wiederholen: Lernen, Üben, Einreichen, Feedback.
          </p>
        </Reveal>

        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {steps.map((step, index) => (
            <Reveal key={step.title} delayMs={index * 40}>
              <li className="flex h-full flex-col gap-2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) p-4 lg:p-5">
                <span className="flex items-center gap-2">
                  {/* Navy number chip: ink on the page background keeps 13px bold
                      well above contrast minimums in both themes. */}
                  <span className="tabular flex size-8 items-center justify-center rounded-full bg-(--color-ink) text-[13px] font-semibold text-(--color-bg)">
                    {index + 1}
                  </span>
                  <step.icon className="size-5 text-(--color-brand)" aria-hidden />
                </span>
                <h3 className="text-[18px] font-semibold leading-6">{step.title}</h3>
                <p className="text-[15px] leading-6 text-(--color-fg-muted)">{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Aktuelle Kurse ──────────────────────────────────────────────── */}
      <section className="py-12 lg:py-16">
        <Reveal>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[22px] font-semibold leading-7">Aktuelle Kurse</h2>
              <p className="mt-1 max-w-[60ch] text-[15px] leading-6 text-(--color-fg-muted)">
                Diese Kurse sind derzeit verfügbar. Ein Administrator weist dir Kurse zu.
              </p>
            </div>
            <Link
              href={`/${locale}/catalog` as Route}
              className="flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] font-semibold text-(--color-brand) hover:underline"
            >
              Alle Kurse
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Reveal>

        <div className="mt-6">
          {!catalog.ok ? (
            <ErrorState
              title="Kurse konnten nicht geladen werden"
              message="Bitte laden Sie die Seite neu oder versuchen Sie es später erneut."
            />
          ) : courses.length === 0 ? (
            <EmptyState
              title="Noch keine Kurse"
              description="Sobald ein Kurs freigeschaltet ist, erscheint er hier."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {courses.map((course, index) => (
                <li key={course.id}>
                  <Reveal delayMs={index * 40} className="h-full">
                    <CourseCard course={course} locale={locale} labels={{ open: "Ansehen" }} />
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Abschluss-CTA (nur für Gäste) ───────────────────────────────── */}
      {!session && (
        <section
          className={`${bleed} mb-2 rounded-(--radius-xl) bg-(--color-brand-soft) py-12 text-center lg:py-16`}
        >
          <Reveal>
            <h2 className="text-[26px] font-semibold leading-8 lg:text-[30px] lg:leading-9">
              Schon dabei?
            </h2>
            <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-6 text-(--color-fg-muted)">
              Konten werden von der Administration angelegt. Melde dich mit deinen Zugangsdaten an, um deine Kurse und die Arena zu öffnen.
            </p>
            <div className="mt-6 flex justify-center">
              <Link href={`/${locale}/login` as Route}>
                <Button size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Anmelden
                </Button>
              </Link>
            </div>
          </Reveal>
        </section>
      )}
    </>
  );
}
