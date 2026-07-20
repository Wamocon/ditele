import type { Locale } from "@/shared/i18n/config";

import type {
  CohortManagementDetail,
  CohortScheduleItem,
} from "./cohort-management-model";

export type CohortManagementNotice =
  | "started"
  | "completed"
  | "cancelled"
  | "schedule_saved"
  | "stale";

export interface CohortManagementCopy {
  readonly back: string;
  readonly pageDescription: string;
  readonly course: string;
  readonly lifecycle: string;
  readonly progression: string;
  readonly contentVersion: string;
  readonly versionValue: (version: number) => string;
  readonly archivedPin: string;
  readonly pinUnavailable: string;
  readonly learners: string;
  readonly trainers: string;
  readonly capacity: string;
  readonly unlimited: string;
  readonly starts: string;
  readonly ends: string;
  readonly completedAt: string;
  readonly notSet: string;
  readonly updated: string;
  readonly states: Readonly<Record<CohortManagementDetail["state"], string>>;
  readonly modes: Readonly<Record<CohortManagementDetail["progressionMode"], string>>;
  readonly taskKinds: Readonly<Record<CohortScheduleItem["taskKind"], string>>;
  readonly fallback: (locale: Locale | null) => string;
  readonly lifecycleTitle: string;
  readonly lifecycleDescription: string;
  readonly noLifecycleCommand: string;
  readonly terminalLifecycle: string;
  readonly startTitle: string;
  readonly startDescription: string;
  readonly start: string;
  readonly starting: string;
  readonly completeTitle: string;
  readonly completeDescription: string;
  readonly complete: string;
  readonly completing: string;
  readonly cancelTitle: string;
  readonly cancelDescription: string;
  readonly cancel: string;
  readonly cancelling: string;
  readonly reason: string;
  readonly reasonPlaceholder: string;
  readonly schedulesTitle: string;
  readonly schedulesDescription: string;
  readonly noSchedulesTitle: string;
  readonly noSchedulesDescription: string;
  readonly stage: string;
  readonly availableFrom: string;
  readonly dueAt: string;
  readonly scheduleVersion: (version: number) => string;
  readonly scheduleMissing: string;
  readonly lastChange: string;
  readonly utcNote: string;
  readonly saveSchedule: string;
  readonly savingSchedule: string;
  readonly scheduleReadOnly: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
  readonly invalidInput: string;
  readonly requiredField: string;
  readonly sessionExpired: string;
  readonly forbidden: string;
  readonly illegalTransition: string;
  readonly invalidSchedule: string;
  readonly idempotencyConflict: string;
  readonly failed: string;
  readonly notices: Readonly<Record<CohortManagementNotice, string>>;
}

export const cohortManagementCopy = {
  en: {
    back: "Back to groups",
    pageDescription:
      "Manage this cohort’s explicit lifecycle and the activation schedule pinned to its published course version.",
    course: "Course",
    lifecycle: "Lifecycle",
    progression: "Progression",
    contentVersion: "Pinned content",
    versionValue: (version: number) => `Published version ${version}`,
    archivedPin: "Archived source retained for this cohort",
    pinUnavailable: "No valid published content version is pinned",
    learners: "Active learners",
    trainers: "Active trainers",
    capacity: "Capacity",
    unlimited: "Unlimited",
    starts: "Starts",
    ends: "Planned end",
    completedAt: "Completed",
    notSet: "Not set",
    updated: "Updated",
    states: {
      waiting: "Waiting",
      active: "Active",
      completed: "Completed",
      cancelled: "Cancelled",
    },
    modes: { scheduled: "Scheduled", flexible: "Flexible" },
    taskKinds: {
      practical: "Practical task",
      knowledge: "Knowledge task",
      placement: "Placement task",
    },
    fallback: (locale: Locale | null) =>
      locale ? `Translation fallback: ${locale.toUpperCase()}` : "Translation unavailable",
    lifecycleTitle: "Lifecycle command",
    lifecycleDescription:
      "Every state change uses optimistic locking and creates an audit event, outbox event, and learner notifications.",
    noLifecycleCommand: "No lifecycle command is authorized for this session.",
    terminalLifecycle: "This cohort is terminal and cannot be reopened.",
    startTitle: "Start cohort",
    startDescription:
      "Starting makes the pinned published course version available to assigned learners.",
    start: "Start cohort",
    starting: "Starting…",
    completeTitle: "Complete cohort",
    completeDescription:
      "Complete the learning period. This terminal decision cannot be reversed.",
    complete: "Complete cohort",
    completing: "Completing…",
    cancelTitle: "Cancel cohort",
    cancelDescription:
      "Cancel this cohort without recording successful completion. Only a cohort manager may cancel.",
    cancel: "Cancel cohort",
    cancelling: "Cancelling…",
    reason: "Reason",
    reasonPlaceholder: "Record why this command is necessary",
    schedulesTitle: "Task activation schedule",
    schedulesDescription:
      "Availability is managed against the immutable content version pinned to this cohort.",
    noSchedulesTitle: "No published tasks available",
    noSchedulesDescription:
      "A published content version must be pinned before task schedules can be managed.",
    stage: "Stage",
    availableFrom: "Available from (UTC)",
    dueAt: "Due at (UTC)",
    scheduleVersion: (version: number) => `Schedule version ${version}`,
    scheduleMissing: "No schedule configured",
    lastChange: "Last change",
    utcNote: "Dates and times are stored in UTC. Leave a field empty to remove that boundary.",
    saveSchedule: "Save schedule",
    savingSchedule: "Saving…",
    scheduleReadOnly:
      "Schedule changes are unavailable because the cohort is terminal or this session is not an assigned trainer or cohort manager.",
    loadingTitle: "Loading group workspace",
    loadingDescription: "Reading the authorized lifecycle and pinned task schedule…",
    errorTitle: "Group workspace could not be loaded",
    errorDescription:
      "The authorized database read failed or returned an invalid cohort contract.",
    retry: "Try again",
    invalidInput: "Check the highlighted fields and try again.",
    requiredField: "Enter a valid value.",
    sessionExpired: "Your session expired. Sign in again before retrying.",
    forbidden: "This session is not authorized for that cohort command.",
    illegalTransition: "That lifecycle transition is no longer available.",
    invalidSchedule:
      "The schedule is closed, the task is not part of the pinned course version, or the dates are invalid.",
    idempotencyConflict:
      "This command key was already used with different data. Reload before retrying.",
    failed: "The command could not be completed. Reload and try again.",
    notices: {
      started: "The cohort was started and assigned learners were notified.",
      completed: "The cohort was completed and assigned learners were notified.",
      cancelled: "The cohort was cancelled and assigned learners were notified.",
      schedule_saved: "The task schedule was saved and assigned learners were notified.",
      stale: "The record changed before your command was applied. Review the fresh values and retry.",
    },
  },
  de: {
    back: "Zurück zu den Gruppen",
    pageDescription:
      "Expliziten Gruppenlebenszyklus und Aktivierungsplan der fest zugeordneten veröffentlichten Kursversion verwalten.",
    course: "Kurs",
    lifecycle: "Lebenszyklus",
    progression: "Fortschritt",
    contentVersion: "Fest zugeordneter Inhalt",
    versionValue: (version: number) => `Veröffentlichte Version ${version}`,
    archivedPin: "Archivierte Quelle bleibt für diese Gruppe erhalten",
    pinUnavailable: "Keine gültige veröffentlichte Inhaltsversion ist zugeordnet",
    learners: "Aktive Lernende",
    trainers: "Aktive Trainer:innen",
    capacity: "Kapazität",
    unlimited: "Unbegrenzt",
    starts: "Beginn",
    ends: "Geplantes Ende",
    completedAt: "Abgeschlossen",
    notSet: "Nicht festgelegt",
    updated: "Aktualisiert",
    states: {
      waiting: "Wartend",
      active: "Aktiv",
      completed: "Abgeschlossen",
      cancelled: "Abgebrochen",
    },
    modes: { scheduled: "Termingesteuert", flexible: "Flexibel" },
    taskKinds: {
      practical: "Praxisaufgabe",
      knowledge: "Wissensaufgabe",
      placement: "Einstufungsaufgabe",
    },
    fallback: (locale: Locale | null) =>
      locale ? `Übersetzungs-Fallback: ${locale.toUpperCase()}` : "Übersetzung nicht verfügbar",
    lifecycleTitle: "Lebenszyklusbefehl",
    lifecycleDescription:
      "Jede Statusänderung verwendet optimistische Sperren und erzeugt Audit-, Outbox- und Lernenden-Benachrichtigungen.",
    noLifecycleCommand: "Für diese Sitzung ist kein Lebenszyklusbefehl autorisiert.",
    terminalLifecycle: "Diese Gruppe ist beendet und kann nicht erneut geöffnet werden.",
    startTitle: "Gruppe starten",
    startDescription:
      "Beim Start wird die fest zugeordnete veröffentlichte Kursversion für Lernende verfügbar.",
    start: "Gruppe starten",
    starting: "Wird gestartet…",
    completeTitle: "Gruppe abschließen",
    completeDescription:
      "Lernzeitraum erfolgreich abschließen. Diese endgültige Entscheidung kann nicht rückgängig gemacht werden.",
    complete: "Gruppe abschließen",
    completing: "Wird abgeschlossen…",
    cancelTitle: "Gruppe abbrechen",
    cancelDescription:
      "Gruppe ohne erfolgreichen Abschluss abbrechen. Nur die Gruppenverwaltung darf abbrechen.",
    cancel: "Gruppe abbrechen",
    cancelling: "Wird abgebrochen…",
    reason: "Begründung",
    reasonPlaceholder: "Grund für diesen Befehl dokumentieren",
    schedulesTitle: "Aufgaben-Aktivierungsplan",
    schedulesDescription:
      "Verfügbarkeit wird für die unveränderliche, dieser Gruppe zugeordnete Inhaltsversion verwaltet.",
    noSchedulesTitle: "Keine veröffentlichten Aufgaben verfügbar",
    noSchedulesDescription:
      "Vor der Zeitplanverwaltung muss eine veröffentlichte Inhaltsversion zugeordnet sein.",
    stage: "Stufe",
    availableFrom: "Verfügbar ab (UTC)",
    dueAt: "Fällig am (UTC)",
    scheduleVersion: (version: number) => `Zeitplanversion ${version}`,
    scheduleMissing: "Kein Zeitplan konfiguriert",
    lastChange: "Letzte Änderung",
    utcNote: "Datum und Uhrzeit werden in UTC gespeichert. Ein leeres Feld entfernt die Grenze.",
    saveSchedule: "Zeitplan speichern",
    savingSchedule: "Wird gespeichert…",
    scheduleReadOnly:
      "Zeitplanänderungen sind nicht verfügbar, weil die Gruppe beendet ist oder diese Sitzung keiner autorisierten Trainer- bzw. Verwaltungszuweisung entspricht.",
    loadingTitle: "Gruppenbereich wird geladen",
    loadingDescription: "Autorisierter Lebenszyklus und Aufgabenzeitplan werden gelesen…",
    errorTitle: "Gruppenbereich konnte nicht geladen werden",
    errorDescription:
      "Der autorisierte Datenbankzugriff ist fehlgeschlagen oder lieferte einen ungültigen Gruppenvertrag.",
    retry: "Erneut versuchen",
    invalidInput: "Bitte die markierten Felder prüfen und erneut versuchen.",
    requiredField: "Gültigen Wert eingeben.",
    sessionExpired: "Die Sitzung ist abgelaufen. Vor dem erneuten Versuch bitte anmelden.",
    forbidden: "Diese Sitzung ist für diesen Gruppenbefehl nicht autorisiert.",
    illegalTransition: "Dieser Lebenszyklusübergang ist nicht mehr verfügbar.",
    invalidSchedule:
      "Der Zeitplan ist geschlossen, die Aufgabe gehört nicht zur zugeordneten Version oder die Daten sind ungültig.",
    idempotencyConflict:
      "Dieser Befehlsschlüssel wurde bereits mit anderen Daten verwendet. Bitte neu laden.",
    failed: "Der Befehl konnte nicht ausgeführt werden. Bitte neu laden und erneut versuchen.",
    notices: {
      started: "Die Gruppe wurde gestartet und zugewiesene Lernende wurden benachrichtigt.",
      completed: "Die Gruppe wurde abgeschlossen und zugewiesene Lernende wurden benachrichtigt.",
      cancelled: "Die Gruppe wurde abgebrochen und zugewiesene Lernende wurden benachrichtigt.",
      schedule_saved: "Der Aufgabenzeitplan wurde gespeichert und Lernende wurden benachrichtigt.",
      stale: "Der Datensatz wurde zwischenzeitlich geändert. Bitte die neuen Werte prüfen und erneut versuchen.",
    },
  },
  ru: {
    back: "Назад к группам",
    pageDescription:
      "Управление жизненным циклом группы и расписанием версии курса, закреплённой после публикации.",
    course: "Курс",
    lifecycle: "Состояние",
    progression: "Режим обучения",
    contentVersion: "Закреплённый контент",
    versionValue: (version: number) => `Опубликованная версия ${version}`,
    archivedPin: "Архивная версия сохранена для этой группы",
    pinUnavailable: "Действующая опубликованная версия не закреплена",
    learners: "Активные учащиеся",
    trainers: "Активные тренеры",
    capacity: "Вместимость",
    unlimited: "Без ограничения",
    starts: "Начало",
    ends: "Плановое окончание",
    completedAt: "Завершено",
    notSet: "Не задано",
    updated: "Обновлено",
    states: {
      waiting: "Ожидает запуска",
      active: "Активна",
      completed: "Завершена",
      cancelled: "Отменена",
    },
    modes: { scheduled: "По расписанию", flexible: "Гибкий" },
    taskKinds: {
      practical: "Практическое задание",
      knowledge: "Теоретическое задание",
      placement: "Входное задание",
    },
    fallback: (locale: Locale | null) =>
      locale ? `Резервный язык: ${locale.toUpperCase()}` : "Перевод недоступен",
    lifecycleTitle: "Команда жизненного цикла",
    lifecycleDescription:
      "Каждое изменение использует оптимистическую блокировку и создаёт аудит, событие интеграции и уведомления учащимся.",
    noLifecycleCommand: "Для этой сессии нет разрешённой команды жизненного цикла.",
    terminalLifecycle: "Эта группа находится в конечном состоянии и не может быть открыта снова.",
    startTitle: "Запустить группу",
    startDescription:
      "После запуска закреплённая опубликованная версия курса станет доступна учащимся.",
    start: "Запустить группу",
    starting: "Запуск…",
    completeTitle: "Завершить группу",
    completeDescription:
      "Успешно завершить период обучения. Это окончательное решение нельзя отменить.",
    complete: "Завершить группу",
    completing: "Завершение…",
    cancelTitle: "Отменить группу",
    cancelDescription:
      "Отменить группу без успешного завершения. Отмена доступна только администратору группы.",
    cancel: "Отменить группу",
    cancelling: "Отмена…",
    reason: "Причина",
    reasonPlaceholder: "Укажите причину этой команды",
    schedulesTitle: "Расписание заданий",
    schedulesDescription:
      "Доступность относится только к неизменяемой версии контента, закреплённой за группой.",
    noSchedulesTitle: "Нет опубликованных заданий",
    noSchedulesDescription:
      "Для управления расписанием сначала необходимо закрепить опубликованную версию.",
    stage: "Этап",
    availableFrom: "Доступно с (UTC)",
    dueAt: "Срок (UTC)",
    scheduleVersion: (version: number) => `Версия расписания ${version}`,
    scheduleMissing: "Расписание не настроено",
    lastChange: "Последнее изменение",
    utcNote: "Дата и время сохраняются в UTC. Пустое поле удаляет ограничение.",
    saveSchedule: "Сохранить расписание",
    savingSchedule: "Сохранение…",
    scheduleReadOnly:
      "Изменение расписания недоступно: группа завершена либо сессия не принадлежит назначенному тренеру или администратору группы.",
    loadingTitle: "Загрузка рабочей области группы",
    loadingDescription: "Чтение разрешённого состояния и расписания закреплённой версии…",
    errorTitle: "Не удалось загрузить группу",
    errorDescription:
      "Разрешённый запрос к базе данных завершился ошибкой или вернул неверный контракт.",
    retry: "Повторить",
    invalidInput: "Проверьте отмеченные поля и повторите попытку.",
    requiredField: "Введите допустимое значение.",
    sessionExpired: "Сессия истекла. Войдите снова перед повторной попыткой.",
    forbidden: "Эта сессия не имеет права выполнять команду для данной группы.",
    illegalTransition: "Этот переход состояния больше недоступен.",
    invalidSchedule:
      "Расписание закрыто, задание не входит в закреплённую версию или даты недопустимы.",
    idempotencyConflict:
      "Этот ключ команды уже использован с другими данными. Обновите страницу.",
    failed: "Не удалось выполнить команду. Обновите страницу и повторите попытку.",
    notices: {
      started: "Группа запущена; назначенные учащиеся получили уведомления.",
      completed: "Группа завершена; назначенные учащиеся получили уведомления.",
      cancelled: "Группа отменена; назначенные учащиеся получили уведомления.",
      schedule_saved: "Расписание сохранено; назначенные учащиеся получили уведомления.",
      stale: "Запись была изменена до выполнения команды. Проверьте новые данные и повторите попытку.",
    },
  },
} satisfies Record<Locale, CohortManagementCopy>;

export function parseCohortManagementNotice(
  value: string | string[] | undefined,
): CohortManagementNotice | null {
  const candidate = typeof value === "string" ? value : null;
  return candidate === "started" ||
    candidate === "completed" ||
    candidate === "cancelled" ||
    candidate === "schedule_saved" ||
    candidate === "stale"
    ? candidate
    : null;
}
