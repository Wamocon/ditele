import type { Locale } from "@/shared/i18n/config";

import type {
  LearnerCohortNotificationState,
  LearnerNotificationChannel,
  LearnerNotificationEventFamily,
  LearnerNotificationKind,
} from "./learner-model";

export type LearnerNotificationCopy = {
  readonly title: string;
  readonly description: string;
  readonly inboxTitle: string;
  readonly count: (total: number) => string;
  readonly unreadCount: (total: number) => string;
  readonly kinds: Readonly<Record<LearnerNotificationKind, string>>;
  readonly kindDescriptions: Readonly<Record<LearnerNotificationKind, string>>;
  readonly enrollmentStates: Readonly<Record<string, string>>;
  readonly reviewDecisions: Readonly<Record<string, string>>;
  readonly cohortStates: Readonly<
    Record<LearnerCohortNotificationState, string>
  >;
  readonly unread: string;
  readonly read: string;
  readonly open: string;
  readonly markRead: string;
  readonly markingRead: string;
  readonly markAllRead: string;
  readonly markingAllRead: string;
  readonly markReadSuccess: string;
  readonly markAllReadSuccess: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly page: (page: number, totalPages: number) => string;
  readonly preferencesTitle: string;
  readonly preferencesDescription: string;
  readonly providerNoticeTitle: string;
  readonly providerNoticeDescription: string;
  readonly eventFamilies: Readonly<
    Record<LearnerNotificationEventFamily, string>
  >;
  readonly channels: Readonly<Record<LearnerNotificationChannel, string>>;
  readonly savePreferences: string;
  readonly savingPreferences: string;
  readonly preferenceSaved: string;
  readonly invalidInput: string;
  readonly sessionExpired: string;
  readonly forbidden: string;
  readonly conflict: string;
  readonly failed: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
};

export type LearnerNotificationClientCopy = Omit<
  LearnerNotificationCopy,
  "count" | "page" | "unreadCount"
>;

export function toLearnerNotificationClientCopy(
  copy: LearnerNotificationCopy,
): LearnerNotificationClientCopy {
  const { count: _count, page: _page, unreadCount: _unreadCount, ...clientCopy } =
    copy;
  void _count;
  void _page;
  void _unreadCount;
  return clientCopy;
}

const commonKinds = {
  en: {
    enrollment_assigned: "Course assignment",
    enrollment_decided: "Enrollment update",
    review_decided: "Trainer review",
    question_answered: "Question answered",
    question_transferred: "Question transferred",
    question_claimed: "Trainer assigned",
    cohort_started: "Cohort started",
    cohort_completed: "Cohort completed",
    cohort_cancelled: "Cohort cancelled",
    task_schedule_created: "Task schedule created",
    task_schedule_updated: "Task schedule updated",
    unknown: "Account update",
  },
  de: {
    enrollment_assigned: "Kurszuweisung",
    enrollment_decided: "Anmeldestatus",
    review_decided: "Trainerbewertung",
    question_answered: "Frage beantwortet",
    question_transferred: "Frage weitergegeben",
    question_claimed: "Trainer zugewiesen",
    cohort_started: "Lerngruppe gestartet",
    cohort_completed: "Lerngruppe abgeschlossen",
    cohort_cancelled: "Lerngruppe abgebrochen",
    task_schedule_created: "Aufgabenzeitplan erstellt",
    task_schedule_updated: "Aufgabenzeitplan geändert",
    unknown: "Kontoinformation",
  },
  ru: {
    enrollment_assigned: "Назначение курса",
    enrollment_decided: "Статус заявки",
    review_decided: "Проверка тренера",
    question_answered: "Ответ на вопрос",
    question_transferred: "Вопрос передан",
    question_claimed: "Тренер назначен",
    cohort_started: "Обучение в группе началось",
    cohort_completed: "Обучение в группе завершено",
    cohort_cancelled: "Обучение в группе отменено",
    task_schedule_created: "Расписание задания создано",
    task_schedule_updated: "Расписание задания изменено",
    unknown: "Обновление учётной записи",
  },
} satisfies Record<Locale, Record<LearnerNotificationKind, string>>;

export const learnerNotificationCopy: Record<Locale, LearnerNotificationCopy> = {
  en: {
    title: "Notifications",
    description: "Review account and learning updates delivered to your secure inbox.",
    inboxTitle: "Inbox",
    count: (total) => `${total} notifications`,
    unreadCount: (total) => `${total} unread`,
    kinds: commonKinds.en,
    kindDescriptions: {
      enrollment_assigned: "A course and learning group are ready for you.",
      enrollment_decided: "Your course enrollment request has a new status.",
      review_decided: "A trainer completed a review of your submitted work.",
      question_answered: "A trainer answered your learning question.",
      question_transferred: "Your question was transferred to another trainer.",
      question_claimed: "A trainer is now responsible for your question.",
      cohort_started: "Your learning group has started. Open the course to continue.",
      cohort_completed: "Your learning group has been completed.",
      cohort_cancelled: "Your learning group has been cancelled.",
      task_schedule_created: "A task schedule is now available for your learning group.",
      task_schedule_updated: "A task schedule in your learning group has changed.",
      unknown: "A new account notification is available.",
    },
    enrollmentStates: {
      requested: "Requested",
      approved: "Approved",
      rejected: "Rejected",
      assigned: "Assigned",
      cancelled: "Cancelled",
      completed: "Completed",
    },
    reviewDecisions: {
      accepted: "Accepted",
      revision_required: "Revision required",
      transferred: "Transferred",
    },
    cohortStates: {
      active: "Active",
      completed: "Completed",
      cancelled: "Cancelled",
    },
    unread: "Unread",
    read: "Read",
    open: "Open update",
    markRead: "Mark as read",
    markingRead: "Marking…",
    markAllRead: "Mark all as read",
    markingAllRead: "Marking all…",
    markReadSuccess: "Notification marked as read.",
    markAllReadSuccess: "Inbox snapshot marked as read.",
    emptyTitle: "No notifications yet",
    emptyDescription: "Learning and account updates will appear here.",
    previousPage: "Previous page",
    nextPage: "Next page",
    page: (page, totalPages) => `Page ${page} of ${totalPages}`,
    preferencesTitle: "Notification preferences",
    preferencesDescription: "Choose the channels recorded for each event family.",
    providerNoticeTitle: "Delivery availability",
    providerNoticeDescription:
      "These preferences are saved securely. Email and push providers are not connected in this environment, so enabling them does not confirm delivery.",
    eventFamilies: {
      enrollment: "Enrollment",
      review: "Reviews",
      question: "Questions",
      submission: "Submissions",
      certificate: "Certificates",
    },
    channels: { in_app: "In-app", email: "Email", push: "Push" },
    savePreferences: "Save preferences",
    savingPreferences: "Saving…",
    preferenceSaved: "Preferences saved.",
    invalidInput: "The notification request is invalid.",
    sessionExpired: "Your session expired. Sign in again.",
    forbidden: "This notification is not available to your account.",
    conflict: "The notification state changed. Reload before trying again.",
    failed: "The notification request failed. Try again.",
    loadingTitle: "Loading notifications",
    loadingDescription: "Your secure inbox and preferences are being loaded.",
    errorTitle: "Notifications could not be loaded",
    errorDescription: "The secure notification inbox is temporarily unavailable.",
    retry: "Try again",
  },
  de: {
    title: "Benachrichtigungen",
    description: "Prüfe Konto- und Lernupdates in deinem geschützten Posteingang.",
    inboxTitle: "Posteingang",
    count: (total) => `${total} Benachrichtigungen`,
    unreadCount: (total) => `${total} ungelesen`,
    kinds: commonKinds.de,
    kindDescriptions: {
      enrollment_assigned: "Ein Kurs und eine Lerngruppe stehen für dich bereit.",
      enrollment_decided: "Der Status deiner Kursanmeldung wurde geändert.",
      review_decided: "Ein Trainer hat deine eingereichte Arbeit bewertet.",
      question_answered: "Ein Trainer hat deine Lernfrage beantwortet.",
      question_transferred: "Deine Frage wurde an einen anderen Trainer weitergegeben.",
      question_claimed: "Ein Trainer ist jetzt für deine Frage zuständig.",
      cohort_started: "Deine Lerngruppe wurde gestartet. Öffne den Kurs, um weiterzulernen.",
      cohort_completed: "Deine Lerngruppe wurde abgeschlossen.",
      cohort_cancelled: "Deine Lerngruppe wurde abgebrochen.",
      task_schedule_created: "Für deine Lerngruppe ist jetzt ein Aufgabenzeitplan verfügbar.",
      task_schedule_updated: "Ein Aufgabenzeitplan deiner Lerngruppe wurde geändert.",
      unknown: "Eine neue Kontobenachrichtigung ist verfügbar.",
    },
    enrollmentStates: {
      requested: "Angefragt",
      approved: "Genehmigt",
      rejected: "Abgelehnt",
      assigned: "Zugewiesen",
      cancelled: "Storniert",
      completed: "Abgeschlossen",
    },
    reviewDecisions: {
      accepted: "Angenommen",
      revision_required: "Überarbeitung nötig",
      transferred: "Weitergegeben",
    },
    cohortStates: {
      active: "Aktiv",
      completed: "Abgeschlossen",
      cancelled: "Abgebrochen",
    },
    unread: "Ungelesen",
    read: "Gelesen",
    open: "Update öffnen",
    markRead: "Als gelesen markieren",
    markingRead: "Wird markiert…",
    markAllRead: "Alle als gelesen markieren",
    markingAllRead: "Alle werden markiert…",
    markReadSuccess: "Benachrichtigung als gelesen markiert.",
    markAllReadSuccess: "Posteingangssnapshot als gelesen markiert.",
    emptyTitle: "Noch keine Benachrichtigungen",
    emptyDescription: "Lern- und Kontoupdates erscheinen hier.",
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    page: (page, totalPages) => `Seite ${page} von ${totalPages}`,
    preferencesTitle: "Benachrichtigungseinstellungen",
    preferencesDescription: "Wähle die gespeicherten Kanäle je Ereignisfamilie.",
    providerNoticeTitle: "Zustellverfügbarkeit",
    providerNoticeDescription:
      "Diese Einstellungen werden sicher gespeichert. E-Mail- und Push-Anbieter sind in dieser Umgebung nicht verbunden; Aktivieren bestätigt keine Zustellung.",
    eventFamilies: {
      enrollment: "Anmeldung",
      review: "Bewertungen",
      question: "Fragen",
      submission: "Einreichungen",
      certificate: "Zertifikate",
    },
    channels: { in_app: "In der App", email: "E-Mail", push: "Push" },
    savePreferences: "Einstellungen speichern",
    savingPreferences: "Wird gespeichert…",
    preferenceSaved: "Einstellungen gespeichert.",
    invalidInput: "Die Benachrichtigungsanfrage ist ungültig.",
    sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
    forbidden: "Diese Benachrichtigung ist für dein Konto nicht verfügbar.",
    conflict: "Der Status wurde geändert. Lade die Seite vor dem nächsten Versuch neu.",
    failed: "Die Anfrage ist fehlgeschlagen. Versuche es erneut.",
    loadingTitle: "Benachrichtigungen werden geladen",
    loadingDescription: "Dein geschützter Posteingang und die Einstellungen werden geladen.",
    errorTitle: "Benachrichtigungen konnten nicht geladen werden",
    errorDescription: "Der geschützte Posteingang ist vorübergehend nicht verfügbar.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "Уведомления",
    description: "Просматривайте обновления учётной записи и обучения в защищённом ящике.",
    inboxTitle: "Входящие",
    count: (total) => `Уведомлений: ${total}`,
    unreadCount: (total) => `Непрочитанных: ${total}`,
    kinds: commonKinds.ru,
    kindDescriptions: {
      enrollment_assigned: "Вам доступны курс и учебная группа.",
      enrollment_decided: "Статус заявки на курс изменился.",
      review_decided: "Тренер завершил проверку отправленной работы.",
      question_answered: "Тренер ответил на ваш учебный вопрос.",
      question_transferred: "Ваш вопрос передан другому тренеру.",
      question_claimed: "Теперь за ваш вопрос отвечает тренер.",
      cohort_started: "Обучение в вашей группе началось. Откройте курс, чтобы продолжить.",
      cohort_completed: "Обучение в вашей группе завершено.",
      cohort_cancelled: "Обучение в вашей группе отменено.",
      task_schedule_created: "Для вашей группы доступно расписание задания.",
      task_schedule_updated: "Расписание задания в вашей группе изменилось.",
      unknown: "Доступно новое уведомление учётной записи.",
    },
    enrollmentStates: {
      requested: "Запрошено",
      approved: "Одобрено",
      rejected: "Отклонено",
      assigned: "Назначено",
      cancelled: "Отменено",
      completed: "Завершено",
    },
    reviewDecisions: {
      accepted: "Принято",
      revision_required: "Требуется доработка",
      transferred: "Передано",
    },
    cohortStates: {
      active: "Активна",
      completed: "Завершена",
      cancelled: "Отменена",
    },
    unread: "Не прочитано",
    read: "Прочитано",
    open: "Открыть",
    markRead: "Отметить прочитанным",
    markingRead: "Отмечается…",
    markAllRead: "Отметить всё прочитанным",
    markingAllRead: "Всё отмечается…",
    markReadSuccess: "Уведомление отмечено прочитанным.",
    markAllReadSuccess: "Снимок входящих отмечен прочитанным.",
    emptyTitle: "Уведомлений пока нет",
    emptyDescription: "Здесь появятся обновления обучения и учётной записи.",
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
    page: (page, totalPages) => `Страница ${page} из ${totalPages}`,
    preferencesTitle: "Настройки уведомлений",
    preferencesDescription: "Выберите сохраняемые каналы для каждой группы событий.",
    providerNoticeTitle: "Доступность доставки",
    providerNoticeDescription:
      "Настройки сохраняются безопасно. В этой среде провайдеры электронной почты и push не подключены, поэтому включение не подтверждает доставку.",
    eventFamilies: {
      enrollment: "Заявки",
      review: "Проверки",
      question: "Вопросы",
      submission: "Работы",
      certificate: "Сертификаты",
    },
    channels: { in_app: "В приложении", email: "Эл. почта", push: "Push" },
    savePreferences: "Сохранить настройки",
    savingPreferences: "Сохранение…",
    preferenceSaved: "Настройки сохранены.",
    invalidInput: "Некорректный запрос уведомления.",
    sessionExpired: "Сеанс истёк. Войдите снова.",
    forbidden: "Это уведомление недоступно вашей учётной записи.",
    conflict: "Статус изменился. Обновите страницу и повторите попытку.",
    failed: "Не удалось выполнить запрос. Повторите попытку.",
    loadingTitle: "Загрузка уведомлений",
    loadingDescription: "Загружаются защищённые входящие и настройки.",
    errorTitle: "Не удалось загрузить уведомления",
    errorDescription: "Защищённый ящик уведомлений временно недоступен.",
    retry: "Повторить",
  },
};
