import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import { getPublishedCatalogCourseById } from "@/app/[locale]/catalog/_data/catalog-repository";
import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { localizedText } from "@/features/catalog/model/catalog";
import { isLocale } from "@/shared/i18n/config";
import { Field, Textarea } from "@/shared/ui/field";

import { requestEnrollmentAction } from "./actions";

const copy = {
  en: {
    title: "Request enrollment",
    description: "Your request will be reviewed before a group or learning path is assigned.",
    note: "Optional note",
    noteHelp: "Share relevant learning goals or scheduling needs.",
    action: "Send request",
  },
  de: {
    title: "Kurs anfragen",
    description: "Die Anfrage wird geprüft, bevor eine Gruppe oder ein Lernpfad zugewiesen wird.",
    note: "Optionale Nachricht",
    noteHelp: "Teile Lernziele oder zeitliche Anforderungen mit.",
    action: "Anfrage senden",
  },
  ru: {
    title: "Подать заявку",
    description: "Заявка будет рассмотрена до назначения группы или учебного пути.",
    note: "Необязательное сообщение",
    noteHelp: "Укажите цели обучения или пожелания по расписанию.",
    action: "Отправить заявку",
  },
} as const;

export default async function EnrollmentRequestPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId } = await params;
  if (!isLocale(locale) || !zUuid(courseId)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/enroll/${courseId}`,
      ["learner"],
    ))
  ) {
    return null;
  }
  const course = await getPublishedCatalogCourseById(courseId);
  if (!course) notFound();
  const labels = copy[locale];

  return (
    <section className="reading-column stack" aria-labelledby="enrollment-title">
      <header className="stack">
        <p className="muted">{localizedText(course.title, locale)}</p>
        <h1 id="enrollment-title">{labels.title}</h1>
        <p>{labels.description}</p>
      </header>
      <form action={requestEnrollmentAction} className="panel stack">
        <input name="locale" type="hidden" value={locale} />
        <input name="courseId" type="hidden" value={course.id} />
        <input name="idempotencyKey" type="hidden" value={`enroll-${randomUUID()}`} />
        <Field description={labels.noteHelp} htmlFor="enrollment-note" label={labels.note}>
          <Textarea id="enrollment-note" maxLength={1000} name="note" />
        </Field>
        <button className="button" type="submit">{labels.action}</button>
      </form>
    </section>
  );
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
