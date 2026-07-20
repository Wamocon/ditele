import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { canRenderProtectedPage } from "@/app/[locale]/_data/principal";
import { getMessages } from "@/shared/i18n/get-messages";
import { createServerClient } from "@/shared/database/server";
import { Field, Textarea } from "@/shared/ui/field";
import { StatePanel } from "@/shared/ui/state-panel";

import { decideEnrollmentAction } from "./actions";

const copy = {
  en: {
    title: "Enrollment applications",
    empty: "No pending applications",
    emptyDescription: "New course requests will appear here for review.",
    learner: "Learner",
    course: "Course",
    note: "Learner note",
    noNote: "No note provided.",
    reason: "Decision reason",
    reasonHelp: "This reason is recorded in the audit history.",
    approve: "Approve request",
    reject: "Reject request",
  },
  de: {
    title: "Kursanfragen",
    empty: "Keine offenen Anfragen",
    emptyDescription: "Neue Kursanfragen erscheinen hier zur Prüfung.",
    learner: "Lernende Person",
    course: "Kurs",
    note: "Nachricht",
    noNote: "Keine Nachricht angegeben.",
    reason: "Entscheidungsgrund",
    reasonHelp: "Der Grund wird im Audit-Verlauf gespeichert.",
    approve: "Anfrage genehmigen",
    reject: "Anfrage ablehnen",
  },
  ru: {
    title: "Заявки на обучение",
    empty: "Нет ожидающих заявок",
    emptyDescription: "Новые заявки на курсы появятся здесь.",
    learner: "Учащийся",
    course: "Курс",
    note: "Комментарий",
    noNote: "Комментарий не указан.",
    reason: "Причина решения",
    reasonHelp: "Причина сохраняется в журнале аудита.",
    approve: "Одобрить",
    reject: "Отклонить",
  },
} as const;

export default async function EnrollmentApplicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/admin/applications`,
      ["admin"],
    ))
  ) {
    const messages = await getMessages(locale);
    return (
      <StatePanel
        description={messages.errors.forbiddenDescription}
        title={messages.errors.forbiddenTitle}
        tone="danger"
      />
    );
  }
  const labels = copy[locale];
  const client = await createServerClient();
  const { data, error } = await client
    .from("enrollments")
    .select(
      "id, learner_id, course_id, request_note, row_version, courses!inner(course_localizations(locale, title))",
    )
    .eq("state", "requested")
    .order("created_at", { ascending: true });
  if (error) throw new Error("enrollment.applications_read_failed", { cause: error });

  return (
    <section className="stack" aria-labelledby="applications-title">
      <header className="page-heading">
        <h1 id="applications-title">{labels.title}</h1>
      </header>
      {data.length === 0 ? (
        <StatePanel description={labels.emptyDescription} title={labels.empty} />
      ) : (
        <ul className="stack">
          {data.map((application) => {
            const localizations = application.courses.course_localizations;
            const courseTitle =
              localizations.find((item) => item.locale === locale)?.title ??
              localizations.find((item) => item.locale === "en")?.title ??
              application.course_id;
            return (
              <li key={application.id}>
                <article className="panel stack">
                  <dl className="workspace-grid">
                    <div>
                      <dt>{labels.learner}</dt>
                      <dd>{application.learner_id}</dd>
                    </div>
                    <div>
                      <dt>{labels.course}</dt>
                      <dd>{courseTitle}</dd>
                    </div>
                    <div>
                      <dt>{labels.note}</dt>
                      <dd>{application.request_note || labels.noNote}</dd>
                    </div>
                  </dl>
                  <form action={decideEnrollmentAction} className="stack">
                    <input name="locale" type="hidden" value={locale} />
                    <input name="enrollmentId" type="hidden" value={application.id} />
                    <input name="expectedVersion" type="hidden" value={application.row_version} />
                    <Field description={labels.reasonHelp} htmlFor={`reason-${application.id}`} label={labels.reason}>
                      <Textarea id={`reason-${application.id}`} maxLength={1000} minLength={3} name="reason" required />
                    </Field>
                    <div className="cluster">
                      <button className="button" name="decision" type="submit" value="approved">{labels.approve}</button>
                      <button className="button button--danger" name="decision" type="submit" value="rejected">{labels.reject}</button>
                    </div>
                  </form>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
