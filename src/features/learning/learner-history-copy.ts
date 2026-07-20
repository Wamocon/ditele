import type { Locale } from "@/shared/i18n/config";

import {
  learnerHistoryEventKinds,
  type LearnerHistoryEventKind,
} from "./model/learner-history";

export interface LearnerHistoryCopy {
  readonly title: string;
  readonly description: string;
  readonly privacyTitle: string;
  readonly privacyDescription: string;
  readonly eventsOnPage: (count: number) => string;
  readonly kinds: Readonly<Record<LearnerHistoryEventKind, string>>;
  readonly course: string;
  readonly task: string;
  readonly recordedAt: string;
  readonly ordinal: string;
  readonly unknownCourse: string;
  readonly unknownTask: string;
  readonly openRelated: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly pageLimitTitle: string;
  readonly pageLimitDescription: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly page: (page: number) => string;
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
}

const eventKinds = {
  en: {
    course_requested: "Course requested",
    course_approved: "Course request approved",
    course_assigned: "Course assigned",
    course_rejected: "Course request rejected",
    course_cancelled: "Course enrollment cancelled",
    course_completed: "Course completed",
    attempt_started: "Task attempt started",
    task_submitted: "Task submitted",
    task_resubmitted: "Task resubmitted",
    review_accepted: "Submission accepted",
    review_revision_required: "Revision requested",
    question_asked: "Question asked",
    question_answered: "Question answered",
    question_archived: "Question archived",
    certificate_issued: "Certificate issued",
    certificate_available: "Certificate available",
    certificate_revoked: "Certificate revoked",
    certificate_expired: "Certificate expired",
  },
  de: {
    course_requested: "Kurs angefragt",
    course_approved: "Kursanfrage genehmigt",
    course_assigned: "Kurs zugewiesen",
    course_rejected: "Kursanfrage abgelehnt",
    course_cancelled: "Kursanmeldung storniert",
    course_completed: "Kurs abgeschlossen",
    attempt_started: "Aufgabenversuch gestartet",
    task_submitted: "Aufgabe eingereicht",
    task_resubmitted: "Aufgabe erneut eingereicht",
    review_accepted: "Einreichung angenommen",
    review_revision_required: "Überarbeitung angefordert",
    question_asked: "Frage gestellt",
    question_answered: "Frage beantwortet",
    question_archived: "Frage archiviert",
    certificate_issued: "Zertifikat ausgestellt",
    certificate_available: "Zertifikat verfügbar",
    certificate_revoked: "Zertifikat widerrufen",
    certificate_expired: "Zertifikat abgelaufen",
  },
  ru: {
    course_requested: "Курс запрошен",
    course_approved: "Заявка на курс одобрена",
    course_assigned: "Курс назначен",
    course_rejected: "Заявка на курс отклонена",
    course_cancelled: "Запись на курс отменена",
    course_completed: "Курс завершён",
    attempt_started: "Попытка задания начата",
    task_submitted: "Задание отправлено",
    task_resubmitted: "Задание отправлено повторно",
    review_accepted: "Работа принята",
    review_revision_required: "Запрошена доработка",
    question_asked: "Вопрос задан",
    question_answered: "На вопрос ответили",
    question_archived: "Вопрос архивирован",
    certificate_issued: "Сертификат выпущен",
    certificate_available: "Сертификат доступен",
    certificate_revoked: "Сертификат отозван",
    certificate_expired: "Срок сертификата истёк",
  },
} satisfies Record<
  Locale,
  Record<LearnerHistoryEventKind, string>
>;

export const learnerHistoryCopy = {
  en: {
    title: "Learning history",
    description:
      "A chronological record of your course, task, review, question, and certificate milestones.",
    privacyTitle: "Privacy-minimized timeline",
    privacyDescription:
      "This view intentionally omits answer text, evidence, trainer comments, question messages, contact details, and certificate verification material.",
    eventsOnPage: (count: number) =>
      `${count} ${count === 1 ? "event" : "events"} on this page`,
    kinds: eventKinds.en,
    course: "Course",
    task: "Task",
    recordedAt: "Recorded",
    ordinal: "Attempt or version",
    unknownCourse: "Course title unavailable",
    unknownTask: "Task title unavailable",
    openRelated: "Open related record",
    emptyTitle: "No learning history yet",
    emptyDescription:
      "Recorded course, task, review, question, and certificate events will appear here.",
    pageLimitTitle: "Older events are outside this bounded view",
    pageLimitDescription:
      "This page is the navigation limit for the current snapshot. Answer, evidence, comment, message, contact, and verification fields remain excluded.",
    previousPage: "Previous page",
    nextPage: "Next page",
    page: (page: number) => `Page ${page}`,
    forbiddenTitle: "Learning history access not granted",
    forbiddenDescription:
      "An active learner role, organization, and self-scoped learning permission are required.",
    loadingTitle: "Loading learning history…",
    loadingDescription: "Your authorized learning events are being read.",
    errorTitle: "Learning history could not be loaded",
    errorDescription:
      "The authorized history query failed or returned an invalid data contract.",
    retry: "Try again",
  },
  de: {
    title: "Lernverlauf",
    description:
      "Eine chronologische Aufzeichnung deiner Kurs-, Aufgaben-, Review-, Fragen- und Zertifikatsmeilensteine.",
    privacyTitle: "Datensparsamer Verlauf",
    privacyDescription:
      "Diese Ansicht enthält bewusst keine Antworttexte, Nachweise, Trainerkommentare, Fragenachrichten, Kontaktdaten oder Zertifikatsprüfdaten.",
    eventsOnPage: (count: number) =>
      `${count} ${count === 1 ? "Ereignis" : "Ereignisse"} auf dieser Seite`,
    kinds: eventKinds.de,
    course: "Kurs",
    task: "Aufgabe",
    recordedAt: "Erfasst",
    ordinal: "Versuch oder Version",
    unknownCourse: "Kurstitel nicht verfügbar",
    unknownTask: "Aufgabentitel nicht verfügbar",
    openRelated: "Zugehörigen Eintrag öffnen",
    emptyTitle: "Noch kein Lernverlauf",
    emptyDescription:
      "Gespeicherte Kurs-, Aufgaben-, Review-, Fragen- und Zertifikatsereignisse erscheinen hier.",
    pageLimitTitle: "Ältere Ereignisse liegen außerhalb dieser begrenzten Ansicht",
    pageLimitDescription:
      "Diese Seite ist die Navigationsgrenze des aktuellen Snapshots. Antworten, Nachweise, Kommentare, Nachrichten, Kontakt- und Prüfdaten bleiben ausgeschlossen.",
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    page: (page: number) => `Seite ${page}`,
    forbiddenTitle: "Kein Zugriff auf den Lernverlauf",
    forbiddenDescription:
      "Erforderlich sind eine aktive Lernendenrolle, Organisation und selbstbezogene Lernberechtigung.",
    loadingTitle: "Lernverlauf wird geladen…",
    loadingDescription: "Deine autorisierten Lernereignisse werden gelesen.",
    errorTitle: "Lernverlauf konnte nicht geladen werden",
    errorDescription:
      "Die autorisierte Verlaufsabfrage ist fehlgeschlagen oder lieferte einen ungültigen Datenvertrag.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "История обучения",
    description:
      "Хронологическая запись ключевых событий курсов, заданий, проверок, вопросов и сертификатов.",
    privacyTitle: "Минимизация персональных данных",
    privacyDescription:
      "В этой истории намеренно не показываются тексты ответов, доказательства, комментарии тренера, сообщения вопросов, контактные данные и материалы проверки сертификатов.",
    eventsOnPage: (count: number) => `Событий на этой странице: ${count}`,
    kinds: eventKinds.ru,
    course: "Курс",
    task: "Задание",
    recordedAt: "Зафиксировано",
    ordinal: "Попытка или версия",
    unknownCourse: "Название курса недоступно",
    unknownTask: "Название задания недоступно",
    openRelated: "Открыть связанную запись",
    emptyTitle: "История обучения пока пуста",
    emptyDescription:
      "Здесь появятся зафиксированные события курсов, заданий, проверок, вопросов и сертификатов.",
    pageLimitTitle: "Более ранние события не входят в эту ограниченную выборку",
    pageLimitDescription:
      "Это предел навигации для текущего снимка. Ответы, доказательства, комментарии, сообщения, контакты и проверочные данные остаются исключёнными.",
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
    page: (page: number) => `Страница ${page}`,
    forbiddenTitle: "Нет доступа к истории обучения",
    forbiddenDescription:
      "Нужны активная роль учащегося, организация и разрешение на чтение собственных учебных данных.",
    loadingTitle: "Загрузка истории обучения…",
    loadingDescription: "Чтение доступных вам учебных событий.",
    errorTitle: "Не удалось загрузить историю обучения",
    errorDescription:
      "Авторизованный запрос истории завершился ошибкой или вернул неверный формат данных.",
    retry: "Повторить",
  },
} satisfies Record<Locale, LearnerHistoryCopy>;

export function hasCompleteLearnerHistoryCopy(
  copy: LearnerHistoryCopy,
): boolean {
  return learnerHistoryEventKinds.every((kind) => copy.kinds[kind].length > 0);
}
