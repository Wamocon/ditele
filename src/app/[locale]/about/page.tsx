import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale, type Locale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { PublicHeader } from "@/shared/ui/public-header";

type AboutCopy = {
  readonly metadataTitle: string;
  readonly title: string;
  readonly introduction: string;
  readonly methodTitle: string;
  readonly method: string;
  readonly evidenceTitle: string;
  readonly evidence: string;
  readonly providerTitle: string;
  readonly provider: string;
  readonly providerLink: string;
  readonly catalogAction: string;
};

const aboutCopy: Record<Locale, AboutCopy> = {
  en: {
    metadataTitle: "About DiTeLe",
    title: "Practical testing competence, demonstrated through real work",
    introduction:
      "DiTeLe is a learning workspace for people who want to understand software testing and apply it in realistic exercises.",
    methodTitle: "Learn, practise, improve",
    method:
      "Learners connect concise theory with practical testing targets, document their approach, submit evidence, and revise their work after trainer feedback.",
    evidenceTitle: "Progress with a traceable basis",
    evidence:
      "Tasks, submissions, review history, and competency evidence keep progress explainable. Automation can support the process, while trainers remain responsible for review decisions.",
    providerTitle: "Training provider",
    provider:
      "The established DiTeLe training offer is connected with Test IT Academy.",
    providerLink: "Visit Test IT Academy",
    catalogAction: "Explore the course catalog",
  },
  de: {
    metadataTitle: "Über DiTeLe",
    title: "Praktische Testkompetenz, nachgewiesen durch echte Arbeit",
    introduction:
      "DiTeLe ist ein Lernarbeitsplatz für Menschen, die Softwaretesten verstehen und in realistischen Übungen anwenden möchten.",
    methodTitle: "Lernen, üben, verbessern",
    method:
      "Lernende verbinden kompakte Theorie mit praktischen Testzielen, dokumentieren ihr Vorgehen, reichen Evidenz ein und überarbeiten ihre Arbeit nach Trainerfeedback.",
    evidenceTitle: "Nachvollziehbarer Lernfortschritt",
    evidence:
      "Aufgaben, Abgaben, Review-Verlauf und Kompetenzevidenz machen Fortschritt erklärbar. Automatisierung kann unterstützen; Review-Entscheidungen bleiben in der Verantwortung der Trainer.",
    providerTitle: "Bildungsanbieter",
    provider:
      "Das etablierte DiTeLe-Lernangebot ist mit der Test IT Academy verbunden.",
    providerLink: "Test IT Academy besuchen",
    catalogAction: "Kurskatalog entdecken",
  },
  ru: {
    metadataTitle: "О DiTeLe",
    title: "Практические навыки тестирования, подтверждённые реальной работой",
    introduction:
      "DiTeLe — это учебная рабочая среда для тех, кто хочет понять тестирование ПО и применять знания в реалистичных упражнениях.",
    methodTitle: "Изучать, практиковаться, улучшать",
    method:
      "Учащиеся связывают краткую теорию с практическими объектами тестирования, описывают подход, прикладывают доказательства и дорабатывают результат после обратной связи тренера.",
    evidenceTitle: "Прозрачная основа прогресса",
    evidence:
      "Задания, работы, история проверок и доказательства компетенций делают прогресс объяснимым. Автоматизация помогает процессу, но решения по проверке остаются за тренерами.",
    providerTitle: "Образовательный провайдер",
    provider:
      "Сложившееся учебное предложение DiTeLe связано с Test IT Academy.",
    providerLink: "Перейти на сайт Test IT Academy",
    catalogAction: "Открыть каталог курсов",
  },
};

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: isLocale(locale) ? aboutCopy[locale].metadataTitle : "About DiTeLe",
  };
}

export default async function AboutPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = await getMessages(locale);
  const copy = aboutCopy[locale];

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="container content-section" id="main-content">
        <article className="stack reading-column">
          <header className="stack">
            <h1>{copy.title}</h1>
            <p className="muted">{copy.introduction}</p>
          </header>

          <section aria-labelledby="about-method" className="panel stack">
            <h2 id="about-method">{copy.methodTitle}</h2>
            <p>{copy.method}</p>
          </section>

          <section aria-labelledby="about-evidence" className="panel stack">
            <h2 id="about-evidence">{copy.evidenceTitle}</h2>
            <p>{copy.evidence}</p>
          </section>

          <section aria-labelledby="about-provider" className="panel stack">
            <h2 id="about-provider">{copy.providerTitle}</h2>
            <p>{copy.provider}</p>
            <Link href="https://test-it-academy.com/">
              {copy.providerLink}
            </Link>
          </section>

          <div>
            <Link
              className="button"
              href={localizedRoute(locale, "/catalog")}
            >
              {copy.catalogAction}
            </Link>
          </div>
        </article>
      </main>
    </>
  );
}
