import type { Locale } from "@/shared/i18n/config";

import type { TrainerReviewHistoryItem } from "./trainer-history-model";

export interface TrainerHistoryCopy {
  readonly title: string;
  readonly description: string;
  readonly reviewCount: (count: number) => string;
  readonly newestLimit: (limit: number) => string;
  readonly learner: string;
  readonly group: string;
  readonly course: string;
  readonly task: string;
  readonly unknownLearner: string;
  readonly unknownTask: string;
  readonly comment: string;
  readonly decidedAt: string;
  readonly openSubmission: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
  readonly decisions: Readonly<
    Record<TrainerReviewHistoryItem["decision"], string>
  >;
}

export const trainerHistoryCopy = {
  en: {
    title: "Review history",
    description:
      "Completed decisions with their immutable learner, task, group, comment, and timestamp context.",
    reviewCount: (count: number) => `${count} ${count === 1 ? "review" : "reviews"}`,
    newestLimit: (limit: number) => `Showing up to the newest ${limit} authorized reviews.`,
    learner: "Learner",
    group: "Group",
    course: "Course",
    task: "Task",
    unknownLearner: "Learner profile unavailable",
    unknownTask: "Task title unavailable",
    comment: "Trainer comment",
    decidedAt: "Decision recorded",
    openSubmission: "Open submission record",
    emptyTitle: "No completed reviews",
    emptyDescription:
      "Completed review decisions in your authorized groups will appear here.",
    forbiddenTitle: "Review history access not granted",
    forbiddenDescription:
      "This server session requires cohort.read and review.manage permissions.",
    loadingTitle: "Loading review history…",
    loadingDescription: "Reading completed decisions in your authorized scope.",
    errorTitle: "Review history could not be loaded",
    errorDescription:
      "The authorized database read failed or returned an invalid contract.",
    retry: "Try again",
    decisions: {
      accepted: "Accepted",
      revision_required: "Revision required",
    },
  },
  de: {
    title: "Review-Verlauf",
    description:
      "Abgeschlossene Entscheidungen mit unveränderlichem Lernenden-, Aufgaben-, Gruppen-, Kommentar- und Zeitkontext.",
    reviewCount: (count: number) => `${count} ${count === 1 ? "Review" : "Reviews"}`,
    newestLimit: (limit: number) => `Bis zu ${limit} neueste autorisierte Reviews werden angezeigt.`,
    learner: "Lernende",
    group: "Gruppe",
    course: "Kurs",
    task: "Aufgabe",
    unknownLearner: "Lernendenprofil nicht verfügbar",
    unknownTask: "Aufgabentitel nicht verfügbar",
    comment: "Trainerkommentar",
    decidedAt: "Entscheidung erfasst",
    openSubmission: "Einreichungsdatensatz öffnen",
    emptyTitle: "Keine abgeschlossenen Reviews",
    emptyDescription:
      "Abgeschlossene Entscheidungen in den autorisierten Gruppen erscheinen hier.",
    forbiddenTitle: "Kein Zugriff auf den Review-Verlauf",
    forbiddenDescription:
      "Diese Serversitzung benötigt die Berechtigungen cohort.read und review.manage.",
    loadingTitle: "Review-Verlauf wird geladen…",
    loadingDescription:
      "Abgeschlossene Entscheidungen im autorisierten Bereich werden gelesen.",
    errorTitle: "Review-Verlauf konnte nicht geladen werden",
    errorDescription:
      "Die autorisierte Datenbankabfrage ist fehlgeschlagen oder lieferte einen ungültigen Vertrag.",
    retry: "Erneut versuchen",
    decisions: {
      accepted: "Akzeptiert",
      revision_required: "Überarbeitung erforderlich",
    },
  },
  ru: {
    title: "История проверок",
    description:
      "Завершённые решения с неизменяемым контекстом учащегося, задания, группы, комментария и времени.",
    reviewCount: (count: number) => `Проверок: ${count}`,
    newestLimit: (limit: number) => `Показаны до ${limit} последних разрешённых проверок.`,
    learner: "Учащийся",
    group: "Группа",
    course: "Курс",
    task: "Задание",
    unknownLearner: "Профиль учащегося недоступен",
    unknownTask: "Название задания недоступно",
    comment: "Комментарий тренера",
    decidedAt: "Решение зафиксировано",
    openSubmission: "Открыть запись работы",
    emptyTitle: "Нет завершённых проверок",
    emptyDescription:
      "Завершённые решения в разрешённых группах появятся здесь.",
    forbiddenTitle: "Нет доступа к истории проверок",
    forbiddenDescription:
      "Серверной сессии нужны разрешения cohort.read и review.manage.",
    loadingTitle: "Загрузка истории проверок…",
    loadingDescription: "Чтение завершённых решений в разрешённой области.",
    errorTitle: "Не удалось загрузить историю проверок",
    errorDescription:
      "Разрешённый запрос к базе данных завершился ошибкой или вернул неверный формат.",
    retry: "Повторить",
    decisions: {
      accepted: "Принято",
      revision_required: "Требуется доработка",
    },
  },
} satisfies Record<Locale, TrainerHistoryCopy>;
