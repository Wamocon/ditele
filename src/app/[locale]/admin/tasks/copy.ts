import type { Locale } from "@/shared/i18n/config";

import type { AdminTaskListItem } from "./model";

export type AdminTasksCopy = {
  readonly title: string;
  readonly description: string;
  readonly count: (value: number) => string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly retry: string;
  readonly course: string;
  readonly stage: string;
  readonly version: string;
  readonly unversioned: string;
  readonly duration: (minutes: number) => string;
  readonly durationMissing: string;
  readonly options: (count: number) => string;
  readonly hints: (count: number) => string;
  readonly targetReady: string;
  readonly targetMissing: string;
  readonly assessmentReady: string;
  readonly assessmentMissing: string;
  readonly translations: (count: number) => string;
  readonly localeFallback: (locale: Locale) => string;
  readonly updated: string;
  readonly openCourse: string;
  readonly page: (current: number, total: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly readOnlyTitle: string;
  readonly readOnlyDescription: string;
  readonly states: Readonly<Record<AdminTaskListItem["state"], string>>;
  readonly kinds: Readonly<Record<AdminTaskListItem["kind"], string>>;
  readonly versionStates: Readonly<Record<NonNullable<AdminTaskListItem["versionState"]>, string>>;
};

export const adminTasksCopy: Record<Locale, AdminTasksCopy> = {
  en: {
    title: "Task inventory",
    description: "Inspect localized activities, assessment structure, testing targets, and their content-version scope.",
    count: (value) => `${value} ${value === 1 ? "task" : "tasks"}`,
    emptyTitle: "No tasks available",
    emptyDescription: "No task is visible in your authorized content scope.",
    forbiddenTitle: "Task administration not granted",
    forbiddenDescription: "This server session does not include the content.manage permission.",
    errorTitle: "Tasks could not be loaded",
    errorDescription: "The authorized database read failed or returned an invalid task contract.",
    loadingTitle: "Loading task inventory",
    loadingDescription: "Reading the authorized content graph…",
    retry: "Try again",
    course: "Course",
    stage: "Stage",
    version: "Content version",
    unversioned: "Legacy unversioned content",
    duration: (minutes) => `${minutes} min`,
    durationMissing: "Duration not set",
    options: (count) => `${count} ${count === 1 ? "option" : "options"}`,
    hints: (count) => `${count} ${count === 1 ? "hint" : "hints"}`,
    targetReady: "Testing target configured",
    targetMissing: "No testing target",
    assessmentReady: "Assessment configured",
    assessmentMissing: "No assessment",
    translations: (count) => `${count} of 3 locales`,
    localeFallback: (locale) => `Fallback from ${locale.toUpperCase()}`,
    updated: "Updated",
    openCourse: "Open course",
    page: (current, total) => `Page ${current} of ${total}`,
    previousPage: "Previous page",
    nextPage: "Next page",
    readOnlyTitle: "Task commands remain version-controlled",
    readOnlyDescription: "This inventory is a live read projection. Task creation, editing, ordering, answer-key changes, and deletion stay disabled until the corresponding audited authoring command is available.",
    states: { draft: "Draft", active: "Active", inactive: "Inactive", archived: "Archived" },
    kinds: { practical: "Practical", knowledge: "Knowledge", placement: "Placement" },
    versionStates: { draft: "Draft", in_review: "In review", published: "Published", archived: "Archived" },
  },
  de: {
    title: "Aufgabeninventar",
    description: "Lokalisierte Aktivitäten, Teststruktur, Testziele und ihre Inhaltsversion prüfen.",
    count: (value) => `${value} ${value === 1 ? "Aufgabe" : "Aufgaben"}`,
    emptyTitle: "Keine Aufgaben verfügbar",
    emptyDescription: "In deinem autorisierten Inhaltsbereich ist keine Aufgabe sichtbar.",
    forbiddenTitle: "Keine Aufgabenadministration",
    forbiddenDescription: "Diese Serversitzung enthält nicht die Berechtigung content.manage.",
    errorTitle: "Aufgaben konnten nicht geladen werden",
    errorDescription: "Der autorisierte Datenbankzugriff ist fehlgeschlagen oder lieferte einen ungültigen Aufgabenvertrag.",
    loadingTitle: "Aufgabeninventar wird geladen",
    loadingDescription: "Der autorisierte Inhaltsgraph wird gelesen…",
    retry: "Erneut versuchen",
    course: "Kurs",
    stage: "Stufe",
    version: "Inhaltsversion",
    unversioned: "Unversionierter Altinhalt",
    duration: (minutes) => `${minutes} Min.`,
    durationMissing: "Dauer nicht festgelegt",
    options: (count) => `${count} ${count === 1 ? "Option" : "Optionen"}`,
    hints: (count) => `${count} ${count === 1 ? "Hinweis" : "Hinweise"}`,
    targetReady: "Testziel konfiguriert",
    targetMissing: "Kein Testziel",
    assessmentReady: "Test konfiguriert",
    assessmentMissing: "Kein Test",
    translations: (count) => `${count} von 3 Sprachen`,
    localeFallback: (locale) => `Fallback aus ${locale.toUpperCase()}`,
    updated: "Aktualisiert",
    openCourse: "Kurs öffnen",
    page: (current, total) => `Seite ${current} von ${total}`,
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    readOnlyTitle: "Aufgabenbefehle bleiben versionsgesteuert",
    readOnlyDescription: "Dieses Inventar ist eine Live-Leseprojektion. Erstellen, Bearbeiten, Sortieren, Lösungsschlüssel-Änderungen und Löschen bleiben deaktiviert, bis der zugehörige auditierte Authoring-Befehl verfügbar ist.",
    states: { draft: "Entwurf", active: "Aktiv", inactive: "Inaktiv", archived: "Archiviert" },
    kinds: { practical: "Praxis", knowledge: "Wissen", placement: "Einstufung" },
    versionStates: { draft: "Entwurf", in_review: "Im Review", published: "Veröffentlicht", archived: "Archiviert" },
  },
  ru: {
    title: "Реестр заданий",
    description: "Проверка локализованных заданий, структуры оценки, тестовых целей и версий содержимого.",
    count: (value) => `${value} заданий`,
    emptyTitle: "Задания недоступны",
    emptyDescription: "В разрешённой вам области содержимого нет заданий.",
    forbiddenTitle: "Нет доступа к заданиям",
    forbiddenDescription: "Эта серверная сессия не имеет разрешения content.manage.",
    errorTitle: "Не удалось загрузить задания",
    errorDescription: "Разрешённый запрос к базе завершился ошибкой или вернул неверный контракт задания.",
    loadingTitle: "Загрузка реестра заданий",
    loadingDescription: "Чтение разрешённого графа содержимого…",
    retry: "Повторить",
    course: "Курс",
    stage: "Этап",
    version: "Версия содержимого",
    unversioned: "Старое содержимое без версии",
    duration: (minutes) => `${minutes} мин`,
    durationMissing: "Длительность не указана",
    options: (count) => `Вариантов: ${count}`,
    hints: (count) => `Подсказок: ${count}`,
    targetReady: "Тестовая цель настроена",
    targetMissing: "Нет тестовой цели",
    assessmentReady: "Оценка настроена",
    assessmentMissing: "Нет оценки",
    translations: (count) => `${count} из 3 языков`,
    localeFallback: (locale) => `Резервный перевод: ${locale.toUpperCase()}`,
    updated: "Обновлено",
    openCourse: "Открыть курс",
    page: (current, total) => `Страница ${current} из ${total}`,
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
    readOnlyTitle: "Команды заданий контролируются версиями",
    readOnlyDescription: "Это актуальное представление для чтения. Создание, редактирование, сортировка, изменение ключей ответа и удаление отключены до появления соответствующей аудируемой команды.",
    states: { draft: "Черновик", active: "Активно", inactive: "Неактивно", archived: "В архиве" },
    kinds: { practical: "Практика", knowledge: "Знания", placement: "Входная оценка" },
    versionStates: { draft: "Черновик", in_review: "На проверке", published: "Опубликована", archived: "В архиве" },
  },
};
