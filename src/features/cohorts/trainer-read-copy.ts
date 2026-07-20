import type { Locale } from "@/shared/i18n/config";

import type {
  TrainerCohortContext,
  TrainerProgressEnrollmentStatus,
} from "./trainer-read-model";

interface RouteStateCopy {
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
}

export interface TrainerGroupsCopy extends RouteStateCopy {
  readonly title: string;
  readonly description: string;
  readonly groupCount: (count: number) => string;
  readonly course: string;
  readonly lifecycle: string;
  readonly progressionMode: string;
  readonly learners: string;
  readonly trainers: string;
  readonly starts: string;
  readonly ends: string;
  readonly notScheduled: string;
  readonly openEnded: string;
  readonly openGroup: string;
  readonly localizedFallback: (locale: Locale | null) => string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly states: Readonly<Record<TrainerCohortContext["state"], string>>;
  readonly modes: Readonly<
    Record<TrainerCohortContext["progressionMode"], string>
  >;
}

export interface TrainerProgressCopy extends RouteStateCopy {
  readonly title: string;
  readonly description: string;
  readonly learnerCount: (count: number) => string;
  readonly learner: string;
  readonly cohort: string;
  readonly course: string;
  readonly enrollment: string;
  readonly attempts: string;
  readonly active: string;
  readonly accepted: string;
  readonly lastActivity: string;
  readonly assigned: string;
  readonly noActivity: string;
  readonly unknownLearner: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly enrollmentScopeNote: string;
  readonly enrollmentStates: Readonly<
    Record<TrainerProgressEnrollmentStatus, string>
  >;
}

export const trainerGroupsCopy = {
  en: {
    title: "Assigned groups",
    description:
      "Live cohort assignments, schedules, course context, and active membership totals in your authorized scope.",
    groupCount: (count: number) => `${count} ${count === 1 ? "group" : "groups"}`,
    course: "Course",
    lifecycle: "Lifecycle",
    progressionMode: "Progression",
    learners: "Learners",
    trainers: "Trainers",
    starts: "Starts",
    ends: "Ends",
    notScheduled: "Not scheduled",
    openEnded: "Open-ended",
    openGroup: "Open group workspace",
    localizedFallback: (locale: Locale | null) =>
      locale ? `Course title fallback: ${locale.toUpperCase()}` : "Course title unavailable",
    emptyTitle: "No assigned groups",
    emptyDescription:
      "No active trainer membership is visible for this account.",
    forbiddenTitle: "Group access not granted",
    forbiddenDescription:
      "This server session does not include the cohort.read permission.",
    loadingTitle: "Loading assigned groups…",
    loadingDescription: "Reading your authorized cohort scope.",
    errorTitle: "Assigned groups could not be loaded",
    errorDescription:
      "The authorized database read failed or returned an invalid contract.",
    retry: "Try again",
    states: {
      waiting: "Waiting",
      active: "Active",
      completed: "Completed",
      cancelled: "Cancelled",
    },
    modes: { scheduled: "Scheduled", flexible: "Flexible" },
  },
  de: {
    title: "Zugewiesene Gruppen",
    description:
      "Aktuelle Kohortenzuweisungen, Zeitpläne, Kurskontext und aktive Mitgliedschaften im autorisierten Bereich.",
    groupCount: (count: number) => `${count} ${count === 1 ? "Gruppe" : "Gruppen"}`,
    course: "Kurs",
    lifecycle: "Lebenszyklus",
    progressionMode: "Fortschrittsmodus",
    learners: "Lernende",
    trainers: "Trainer",
    starts: "Beginn",
    ends: "Ende",
    notScheduled: "Nicht terminiert",
    openEnded: "Ohne Enddatum",
    openGroup: "Gruppenbereich öffnen",
    localizedFallback: (locale: Locale | null) =>
      locale ? `Kurstitel-Fallback: ${locale.toUpperCase()}` : "Kurstitel nicht verfügbar",
    emptyTitle: "Keine zugewiesenen Gruppen",
    emptyDescription:
      "Für dieses Konto ist keine aktive Trainer-Mitgliedschaft sichtbar.",
    forbiddenTitle: "Kein Gruppenzugriff",
    forbiddenDescription:
      "Diese Serversitzung enthält nicht die Berechtigung cohort.read.",
    loadingTitle: "Zugewiesene Gruppen werden geladen…",
    loadingDescription: "Der autorisierte Kohortenbereich wird gelesen.",
    errorTitle: "Zugewiesene Gruppen konnten nicht geladen werden",
    errorDescription:
      "Die autorisierte Datenbankabfrage ist fehlgeschlagen oder lieferte einen ungültigen Vertrag.",
    retry: "Erneut versuchen",
    states: {
      waiting: "Wartend",
      active: "Aktiv",
      completed: "Abgeschlossen",
      cancelled: "Abgebrochen",
    },
    modes: { scheduled: "Termingesteuert", flexible: "Flexibel" },
  },
  ru: {
    title: "Назначенные группы",
    description:
      "Текущие назначения, расписание, курс и активные участники в разрешённой области.",
    groupCount: (count: number) => `Групп: ${count}`,
    course: "Курс",
    lifecycle: "Состояние",
    progressionMode: "Режим обучения",
    learners: "Учащиеся",
    trainers: "Тренеры",
    starts: "Начало",
    ends: "Окончание",
    notScheduled: "Дата не задана",
    openEnded: "Без даты окончания",
    openGroup: "Открыть рабочую область",
    localizedFallback: (locale: Locale | null) =>
      locale ? `Резервный язык названия: ${locale.toUpperCase()}` : "Название курса недоступно",
    emptyTitle: "Нет назначенных групп",
    emptyDescription:
      "Для этой учётной записи не найдена активная роль тренера в группе.",
    forbiddenTitle: "Нет доступа к группам",
    forbiddenDescription:
      "В серверной сессии отсутствует разрешение cohort.read.",
    loadingTitle: "Загрузка назначенных групп…",
    loadingDescription: "Чтение разрешённой области групп.",
    errorTitle: "Не удалось загрузить группы",
    errorDescription:
      "Разрешённый запрос к базе данных завершился ошибкой или вернул неверный формат.",
    retry: "Повторить",
    states: {
      waiting: "Ожидает запуска",
      active: "Активна",
      completed: "Завершена",
      cancelled: "Отменена",
    },
    modes: { scheduled: "По расписанию", flexible: "Гибкий" },
  },
} satisfies Record<Locale, TrainerGroupsCopy>;

export const trainerProgressCopy = {
  en: {
    title: "Learner progress",
    description:
      "Active learner assignments and real attempt totals across the cohorts you are authorized to train.",
    learnerCount: (count: number) => `${count} ${count === 1 ? "learner" : "learners"}`,
    learner: "Learner",
    cohort: "Group",
    course: "Course",
    enrollment: "Enrollment",
    attempts: "Attempts",
    active: "Active",
    accepted: "Accepted",
    lastActivity: "Last activity",
    assigned: "Assigned",
    noActivity: "No task activity yet",
    unknownLearner: "Learner profile unavailable",
    emptyTitle: "No learner assignments",
    emptyDescription:
      "No active learner membership is visible in your authorized groups.",
    enrollmentScopeNote:
      "Enrollment lifecycle states are shown only when this session has enrollment-decision scope. Otherwise, the view reports only verified cohort assignment or an enrollment reference from an authorized attempt.",
    forbiddenTitle: "Progress access not granted",
    forbiddenDescription:
      "This server session requires cohort.read and review.manage permissions.",
    loadingTitle: "Loading learner progress…",
    loadingDescription: "Calculating authorized attempt totals.",
    errorTitle: "Learner progress could not be loaded",
    errorDescription:
      "The authorized database read failed or returned an invalid contract.",
    retry: "Try again",
    enrollmentStates: {
      requested: "Requested",
      approved: "Approved",
      rejected: "Rejected",
      assigned: "Assigned",
      cancelled: "Cancelled",
      completed: "Completed",
      recorded: "Enrollment recorded",
      cohort_assignment: "Cohort assignment",
    },
  },
  de: {
    title: "Lernfortschritt",
    description:
      "Aktive Lernenden-Zuweisungen und reale Versuchszahlen in den autorisierten Gruppen.",
    learnerCount: (count: number) => `${count} ${count === 1 ? "Lernende:r" : "Lernende"}`,
    learner: "Lernende",
    cohort: "Gruppe",
    course: "Kurs",
    enrollment: "Einschreibung",
    attempts: "Versuche",
    active: "Aktiv",
    accepted: "Akzeptiert",
    lastActivity: "Letzte Aktivität",
    assigned: "Zugewiesen",
    noActivity: "Noch keine Aufgabenaktivität",
    unknownLearner: "Lernendenprofil nicht verfügbar",
    emptyTitle: "Keine Lernenden-Zuweisungen",
    emptyDescription:
      "In den autorisierten Gruppen ist keine aktive Lernenden-Mitgliedschaft sichtbar.",
    enrollmentScopeNote:
      "Einschreibungsstatus werden nur mit Entscheidungsberechtigung angezeigt. Andernfalls zeigt die Ansicht ausschließlich eine verifizierte Gruppenzuweisung oder eine Einschreibungsreferenz aus einem autorisierten Versuch.",
    forbiddenTitle: "Kein Zugriff auf den Fortschritt",
    forbiddenDescription:
      "Diese Serversitzung benötigt die Berechtigungen cohort.read und review.manage.",
    loadingTitle: "Lernfortschritt wird geladen…",
    loadingDescription: "Autorisierte Versuchszahlen werden berechnet.",
    errorTitle: "Lernfortschritt konnte nicht geladen werden",
    errorDescription:
      "Die autorisierte Datenbankabfrage ist fehlgeschlagen oder lieferte einen ungültigen Vertrag.",
    retry: "Erneut versuchen",
    enrollmentStates: {
      requested: "Beantragt",
      approved: "Genehmigt",
      rejected: "Abgelehnt",
      assigned: "Zugewiesen",
      cancelled: "Abgebrochen",
      completed: "Abgeschlossen",
      recorded: "Einschreibung erfasst",
      cohort_assignment: "Gruppenzuweisung",
    },
  },
  ru: {
    title: "Прогресс учащихся",
    description:
      "Активные назначения учащихся и фактические итоги попыток в разрешённых группах.",
    learnerCount: (count: number) => `Учащихся: ${count}`,
    learner: "Учащийся",
    cohort: "Группа",
    course: "Курс",
    enrollment: "Зачисление",
    attempts: "Попытки",
    active: "Активные",
    accepted: "Принятые",
    lastActivity: "Последняя активность",
    assigned: "Назначен",
    noActivity: "Активности по заданиям пока нет",
    unknownLearner: "Профиль учащегося недоступен",
    emptyTitle: "Нет назначенных учащихся",
    emptyDescription:
      "В разрешённых группах нет видимых активных участников-учащихся.",
    enrollmentScopeNote:
      "Состояние зачисления показывается только при наличии права принимать решения. В остальных случаях отображается только подтверждённое назначение в группу или ссылка на зачисление из разрешённой попытки.",
    forbiddenTitle: "Нет доступа к прогрессу",
    forbiddenDescription:
      "Серверной сессии нужны разрешения cohort.read и review.manage.",
    loadingTitle: "Загрузка прогресса…",
    loadingDescription: "Подсчёт разрешённых попыток.",
    errorTitle: "Не удалось загрузить прогресс",
    errorDescription:
      "Разрешённый запрос к базе данных завершился ошибкой или вернул неверный формат.",
    retry: "Повторить",
    enrollmentStates: {
      requested: "Запрошено",
      approved: "Одобрено",
      rejected: "Отклонено",
      assigned: "Назначено",
      cancelled: "Отменено",
      completed: "Завершено",
      recorded: "Зачисление зарегистрировано",
      cohort_assignment: "Назначение в группу",
    },
  },
} satisfies Record<Locale, TrainerProgressCopy>;
