import type { Locale } from "@/shared/i18n/config";

import type { ContentReadinessIssue } from "./model";

export interface ContentLifecycleCopy {
  readonly title: string;
  readonly description: string;
  readonly permissionTitle: string;
  readonly permissionDescription: string;
  readonly archivedTitle: string;
  readonly archivedDescription: string;
  readonly submitTitle: string;
  readonly submitDescription: string;
  readonly submit: string;
  readonly submitting: string;
  readonly reviewTitle: string;
  readonly reviewDescription: string;
  readonly decisionLabel: string;
  readonly decisionPlaceholder: string;
  readonly decisions: Readonly<Record<"approved" | "changes_requested", string>>;
  readonly commentLabel: string;
  readonly commentPlaceholder: string;
  readonly saveReview: string;
  readonly savingReview: string;
  readonly latestReviewTitle: string;
  readonly currentApproval: string;
  readonly previousReview: string;
  readonly publishTitle: string;
  readonly publishDescription: string;
  readonly publish: string;
  readonly publishing: string;
  readonly awaitingApprovalTitle: string;
  readonly awaitingApprovalDescription: string;
  readonly archiveTitle: string;
  readonly archiveWarning: string;
  readonly impactTitle: string;
  readonly impactTasks: string;
  readonly impactSchedules: string;
  readonly impactAttempts: string;
  readonly impactOpenAttempts: string;
  readonly impactSubmissions: string;
  readonly impactFingerprint: string;
  readonly archiveReasonLabel: string;
  readonly archiveReasonPlaceholder: string;
  readonly confirmImpact: string;
  readonly archive: string;
  readonly archiving: string;
  readonly impactUnavailableTitle: string;
  readonly impactUnavailableDescription: string;
  readonly invalidInput: string;
  readonly requiredField: string;
  readonly sessionExpired: string;
  readonly forbidden: string;
  readonly readinessFailed: string;
  readonly approvalRequired: string;
  readonly idempotencyConflict: string;
  readonly failed: string;
  readonly notices: Readonly<Record<
    "stale" | "submitted" | "review_approved" | "changes_requested" | "published" | "archived",
    { readonly title: string; readonly description: string }
  >>;
}

export interface AdminContentCopy {
  readonly title: string;
  readonly description: string;
  readonly courseCount: (count: number) => string;
  readonly page: (current: number, total: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly loading: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
  readonly openCourse: string;
  readonly backToCourses: string;
  readonly updated: string;
  readonly estimatedDuration: string;
  readonly minutes: (count: number) => string;
  readonly versions: (count: number) => string;
  readonly stages: (count: number) => string;
  readonly tasks: (count: number) => string;
  readonly translations: string;
  readonly complete: string;
  readonly incomplete: string;
  readonly noSummary: string;
  readonly courseDetails: string;
  readonly contentVersions: string;
  readonly noVersionsTitle: string;
  readonly noVersionsDescription: string;
  readonly openVersion: string;
  readonly versionTitle: (version: number) => string;
  readonly versionDetails: string;
  readonly changeSummary: string;
  readonly noChangeSummary: string;
  readonly publishedAt: string;
  readonly notPublished: string;
  readonly rowVersion: string;
  readonly contentTree: string;
  readonly noStagesTitle: string;
  readonly noStagesDescription: string;
  readonly noTasks: string;
  readonly taskKind: string;
  readonly taskTarget: string;
  readonly assessmentOptions: (count: number) => string;
  readonly assessmentQuestion: string;
  readonly media: string;
  readonly reviews: string;
  readonly localeFallback: (locale: string) => string;
  readonly validation: string;
  readonly validationPassed: string;
  readonly validationFailed: (count: number) => string;
  readonly readinessIssues: Readonly<Record<ContentReadinessIssue["code"], string>>;
  readonly mutationUnavailableTitle: string;
  readonly mutationUnavailableDescription: string;
  readonly lifecycle: ContentLifecycleCopy;
  readonly preview: string;
  readonly previewAs: string;
  readonly previewRole: Readonly<Record<"learner" | "trainer" | "admin", string>>;
  readonly previewNotice: string;
  readonly previewProjectionTitle: string;
  readonly previewBack: string;
  readonly previewTarget: string;
  readonly previewNoTarget: string;
  readonly previewHintAvailable: string;
  readonly previewHintUnavailable: string;
  readonly previewImmutableNotice: string;
  readonly localeNames: Readonly<Record<Locale, string>>;
  readonly courseStates: Readonly<Record<"draft" | "active" | "inactive" | "archived", string>>;
  readonly versionStates: Readonly<Record<"draft" | "in_review" | "published" | "archived", string>>;
  readonly taskKinds: Readonly<Record<"practical" | "knowledge" | "placement", string>>;
}

export const adminContentCopy = {
  en: {
    title: "Course content studio",
    description: "Inspect localized courses, version lifecycle records, stages, and learner-safe task previews.",
    courseCount: (count: number) => `${count} ${count === 1 ? "course" : "courses"}`,
    page: (current: number, total: number) => `Page ${current} of ${total}`,
    previousPage: "Previous page",
    nextPage: "Next page",
    emptyTitle: "No courses available",
    emptyDescription: "No course is visible in your authorized content scope.",
    forbiddenTitle: "Content access not granted",
    forbiddenDescription: "This server session does not include the content.manage permission.",
    loading: "Loading course content…",
    errorTitle: "Course content could not be loaded",
    errorDescription: "The authorized database read failed or returned an invalid contract. Try again.",
    retry: "Try again",
    openCourse: "Open course",
    backToCourses: "All courses",
    updated: "Updated",
    estimatedDuration: "Estimated duration",
    minutes: (count: number) => `${count} min`,
    versions: (count: number) => `${count} ${count === 1 ? "version" : "versions"}`,
    stages: (count: number) => `${count} ${count === 1 ? "stage" : "stages"}`,
    tasks: (count: number) => `${count} ${count === 1 ? "task" : "tasks"}`,
    translations: "Translations",
    complete: "Complete",
    incomplete: "Incomplete",
    noSummary: "No localized summary is available.",
    courseDetails: "Course details",
    contentVersions: "Content versions",
    noVersionsTitle: "No content versions",
    noVersionsDescription: "This course has no version record yet.",
    openVersion: "Inspect version",
    versionTitle: (version: number) => `Version ${version}`,
    versionDetails: "Version details",
    changeSummary: "Change summary",
    noChangeSummary: "No change summary was recorded.",
    publishedAt: "Published",
    notPublished: "Not published",
    rowVersion: "Revision",
    contentTree: "Stages and tasks",
    noStagesTitle: "No stages in this version",
    noStagesDescription: "The normalized content rows do not contain stages for this version.",
    noTasks: "No tasks in this stage.",
    taskKind: "Type",
    taskTarget: "Testing target",
    assessmentOptions: (count: number) => `${count} assessment ${count === 1 ? "option" : "options"}`,
    assessmentQuestion: "Knowledge check",
    media: "Media",
    reviews: "Reviews",
    localeFallback: (locale: string) => `Fallback from ${locale.toUpperCase()}`,
    validation: "Publication readiness",
    validationPassed: "The read-side completeness checks passed.",
    validationFailed: (count: number) => `${count} ${count === 1 ? "issue requires" : "issues require"} attention.`,
    readinessIssues: {
      missing_course_locale: "A required course translation is incomplete.",
      missing_stage: "At least one stage is required for this version.",
      missing_stage_locale: "A required stage translation is incomplete.",
      missing_task: "At least one task is required in every stage.",
      missing_task_locale: "A required task translation is incomplete.",
      invalid_position: "Positions must be continuous and zero-based.",
    },
    mutationUnavailableTitle: "Content editing remains read-only",
    mutationUnavailableDescription: "Course, stage, task, test-answer, and media creation, editing, deletion, and reordering are not available yet. Review, publication, and archival lifecycle commands are live on each version page.",
    lifecycle: {
      title: "Version lifecycle",
      description: "Move this version through audited, idempotent review, publication, and archival commands.",
      permissionTitle: "No lifecycle command is available",
      permissionDescription: "Your current server session can inspect this state but does not include the required lifecycle permission.",
      archivedTitle: "Archived version",
      archivedDescription: "This version and its publication snapshot are immutable. Create a new draft version for further changes.",
      submitTitle: "Submit for review",
      submitDescription: "The database validates the complete localized content graph before review starts.",
      submit: "Submit for review",
      submitting: "Submitting…",
      reviewTitle: "Record review decision",
      reviewDescription: "A publication reviewer must record an explicit decision and comment. Changes requested return the version to draft.",
      decisionLabel: "Decision",
      decisionPlaceholder: "Select a decision",
      decisions: { approved: "Approve current content", changes_requested: "Request changes" },
      commentLabel: "Review comment",
      commentPlaceholder: "Explain the decision and any required changes.",
      saveReview: "Record decision",
      savingReview: "Recording…",
      latestReviewTitle: "Latest review",
      currentApproval: "This approval matches the current immutable review graph.",
      previousReview: "This review does not authorize the current version.",
      publishTitle: "Publish approved version",
      publishDescription: "Publication creates the immutable learner-safe snapshot and activates its draft stages and tasks atomically.",
      publish: "Publish version",
      publishing: "Publishing…",
      awaitingApprovalTitle: "Current approval required",
      awaitingApprovalDescription: "Record an approval for the current review graph before publication becomes available.",
      archiveTitle: "Archive published version",
      archiveWarning: "Archival is permanent for this version. Review every affected record below before continuing.",
      impactTitle: "Current archive impact",
      impactTasks: "Tasks",
      impactSchedules: "Schedules",
      impactAttempts: "Attempts",
      impactOpenAttempts: "Open attempts",
      impactSubmissions: "Submissions",
      impactFingerprint: "Impact fingerprint",
      archiveReasonLabel: "Archive reason",
      archiveReasonPlaceholder: "Explain why this published version must be archived.",
      confirmImpact: "I reviewed these exact impact counts and fingerprint.",
      archive: "Archive version",
      archiving: "Archiving…",
      impactUnavailableTitle: "Archive impact unavailable",
      impactUnavailableDescription: "The authorized impact contract could not be read. Archival stays disabled until a fresh impact can be verified.",
      invalidInput: "The submitted lifecycle command is invalid.",
      requiredField: "This field is required and must use the expected format.",
      sessionExpired: "Your session expired. Sign in again before changing content.",
      forbidden: "Your current server session is not authorized for this content lifecycle command.",
      readinessFailed: "The content graph does not pass the database publication-readiness checks.",
      approvalRequired: "A current approved review is required before publication.",
      idempotencyConflict: "This request key was already used for different content. Reload the version and try again.",
      failed: "The lifecycle command could not be completed. Reload the version and try again.",
      notices: {
        stale: { title: "Version changed", description: "This page was based on an older revision. The current server state has been loaded; review it before trying again." },
        submitted: { title: "Review started", description: "The draft passed database validation and is now in review." },
        review_approved: { title: "Review approved", description: "The current content graph was approved. Publication is now available to authorized reviewers." },
        changes_requested: { title: "Changes requested", description: "The review was recorded and the version returned to draft." },
        published: { title: "Version published", description: "The immutable publication snapshot is now active." },
        archived: { title: "Version archived", description: "The published version and its verified archive impact were recorded as archived." },
      },
    },
    preview: "Preview",
    previewAs: "Preview role",
    previewRole: { learner: "Learner", trainer: "Trainer", admin: "Administrator" },
    previewNotice: "This preview deliberately excludes model answers and correctness flags.",
    previewProjectionTitle: "Read-only reconstructed preview",
    previewBack: "Back to version",
    previewTarget: "Open testing target",
    previewNoTarget: "No testing target configured.",
    previewHintAvailable: "An optional hint is configured.",
    previewHintUnavailable: "No optional hint is configured.",
    previewImmutableNotice: "This safe preview is reconstructed from normalized rows. Published versions also retain an immutable server-side snapshot.",
    localeNames: { en: "English", de: "German", ru: "Russian" },
    courseStates: { draft: "Draft", active: "Active", inactive: "Inactive", archived: "Archived" },
    versionStates: { draft: "Draft", in_review: "In review", published: "Published", archived: "Archived" },
    taskKinds: { practical: "Practical", knowledge: "Knowledge", placement: "Placement" },
  },
  de: {
    title: "Kurs-Content-Studio",
    description: "Lokalisierte Kurse, Versionslebenszyklen, Stufen und lernendensichere Aufgabenvorschauen prüfen.",
    courseCount: (count: number) => `${count} ${count === 1 ? "Kurs" : "Kurse"}`,
    page: (current: number, total: number) => `Seite ${current} von ${total}`,
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    emptyTitle: "Keine Kurse verfügbar",
    emptyDescription: "In deinem autorisierten Inhaltsbereich ist kein Kurs sichtbar.",
    forbiddenTitle: "Kein Inhaltszugriff",
    forbiddenDescription: "Diese Serversitzung enthält nicht die Berechtigung content.manage.",
    loading: "Kursinhalte werden geladen…",
    errorTitle: "Kursinhalte konnten nicht geladen werden",
    errorDescription: "Der autorisierte Datenbankzugriff ist fehlgeschlagen oder lieferte einen ungültigen Vertrag. Versuche es erneut.",
    retry: "Erneut versuchen",
    openCourse: "Kurs öffnen",
    backToCourses: "Alle Kurse",
    updated: "Aktualisiert",
    estimatedDuration: "Geschätzte Dauer",
    minutes: (count: number) => `${count} Min.`,
    versions: (count: number) => `${count} ${count === 1 ? "Version" : "Versionen"}`,
    stages: (count: number) => `${count} ${count === 1 ? "Stufe" : "Stufen"}`,
    tasks: (count: number) => `${count} ${count === 1 ? "Aufgabe" : "Aufgaben"}`,
    translations: "Übersetzungen",
    complete: "Vollständig",
    incomplete: "Unvollständig",
    noSummary: "Keine lokalisierte Zusammenfassung verfügbar.",
    courseDetails: "Kursdetails",
    contentVersions: "Inhaltsversionen",
    noVersionsTitle: "Keine Inhaltsversionen",
    noVersionsDescription: "Für diesen Kurs besteht noch kein Versionsdatensatz.",
    openVersion: "Version prüfen",
    versionTitle: (version: number) => `Version ${version}`,
    versionDetails: "Versionsdetails",
    changeSummary: "Änderungsübersicht",
    noChangeSummary: "Keine Änderungsübersicht erfasst.",
    publishedAt: "Veröffentlicht",
    notPublished: "Nicht veröffentlicht",
    rowVersion: "Revision",
    contentTree: "Stufen und Aufgaben",
    noStagesTitle: "Keine Stufen in dieser Version",
    noStagesDescription: "Die normalisierten Inhaltszeilen enthalten keine Stufen für diese Version.",
    noTasks: "Keine Aufgaben in dieser Stufe.",
    taskKind: "Typ",
    taskTarget: "Testziel",
    assessmentOptions: (count: number) => `${count} ${count === 1 ? "Testoption" : "Testoptionen"}`,
    assessmentQuestion: "Wissenscheck",
    media: "Medien",
    reviews: "Reviews",
    localeFallback: (locale: string) => `Fallback aus ${locale.toUpperCase()}`,
    validation: "Veröffentlichungsbereitschaft",
    validationPassed: "Die leseseitigen Vollständigkeitsprüfungen wurden bestanden.",
    validationFailed: (count: number) => `${count} ${count === 1 ? "Problem erfordert" : "Probleme erfordern"} Aufmerksamkeit.`,
    readinessIssues: {
      missing_course_locale: "Eine erforderliche Kursübersetzung ist unvollständig.",
      missing_stage: "Für diese Version ist mindestens eine Stufe erforderlich.",
      missing_stage_locale: "Eine erforderliche Stufenübersetzung ist unvollständig.",
      missing_task: "Jede Stufe benötigt mindestens eine Aufgabe.",
      missing_task_locale: "Eine erforderliche Aufgabenübersetzung ist unvollständig.",
      invalid_position: "Positionen müssen lückenlos und nullbasiert sein.",
    },
    mutationUnavailableTitle: "Inhaltsbearbeitung bleibt schreibgeschützt",
    mutationUnavailableDescription: "Kurse, Stufen, Aufgaben, Testantworten und Medien können noch nicht erstellt, bearbeitet, gelöscht oder neu sortiert werden. Review-, Veröffentlichungs- und Archivierungsbefehle sind auf jeder Versionsseite aktiv.",
    lifecycle: {
      title: "Versionslebenszyklus",
      description: "Diese Version mit auditierten, idempotenten Befehlen durch Review, Veröffentlichung und Archivierung führen.",
      permissionTitle: "Kein Lebenszyklusbefehl verfügbar",
      permissionDescription: "Deine aktuelle Serversitzung darf diesen Zustand ansehen, enthält aber nicht die erforderliche Lebenszyklusberechtigung.",
      archivedTitle: "Archivierte Version",
      archivedDescription: "Diese Version und ihr Veröffentlichungssnapshot sind unveränderlich. Für weitere Änderungen muss eine neue Entwurfsversion erstellt werden.",
      submitTitle: "Zum Review einreichen",
      submitDescription: "Die Datenbank validiert den vollständigen lokalisierten Inhaltsgraphen, bevor das Review beginnt.",
      submit: "Zum Review einreichen",
      submitting: "Wird eingereicht…",
      reviewTitle: "Review-Entscheidung erfassen",
      reviewDescription: "Eine veröffentlichungsberechtigte Person muss Entscheidung und Kommentar erfassen. Änderungsanforderungen setzen die Version auf Entwurf zurück.",
      decisionLabel: "Entscheidung",
      decisionPlaceholder: "Entscheidung auswählen",
      decisions: { approved: "Aktuellen Inhalt freigeben", changes_requested: "Änderungen anfordern" },
      commentLabel: "Review-Kommentar",
      commentPlaceholder: "Entscheidung und erforderliche Änderungen erläutern.",
      saveReview: "Entscheidung erfassen",
      savingReview: "Wird erfasst…",
      latestReviewTitle: "Letztes Review",
      currentApproval: "Diese Freigabe entspricht dem aktuellen unveränderlichen Review-Graphen.",
      previousReview: "Dieses Review autorisiert die aktuelle Version nicht.",
      publishTitle: "Freigegebene Version veröffentlichen",
      publishDescription: "Die Veröffentlichung erzeugt atomar den unveränderlichen lernendensicheren Snapshot und aktiviert Entwurfsstufen und -aufgaben.",
      publish: "Version veröffentlichen",
      publishing: "Wird veröffentlicht…",
      awaitingApprovalTitle: "Aktuelle Freigabe erforderlich",
      awaitingApprovalDescription: "Vor der Veröffentlichung muss eine Freigabe für den aktuellen Review-Graphen erfasst werden.",
      archiveTitle: "Veröffentlichte Version archivieren",
      archiveWarning: "Die Archivierung dieser Version ist dauerhaft. Prüfe vor dem Fortfahren jeden betroffenen Datensatz.",
      impactTitle: "Aktuelle Archivierungsauswirkung",
      impactTasks: "Aufgaben",
      impactSchedules: "Zeitpläne",
      impactAttempts: "Versuche",
      impactOpenAttempts: "Offene Versuche",
      impactSubmissions: "Einreichungen",
      impactFingerprint: "Auswirkungsfingerabdruck",
      archiveReasonLabel: "Archivierungsgrund",
      archiveReasonPlaceholder: "Begründe, warum diese veröffentlichte Version archiviert werden muss.",
      confirmImpact: "Ich habe genau diese Auswirkungszahlen und diesen Fingerabdruck geprüft.",
      archive: "Version archivieren",
      archiving: "Wird archiviert…",
      impactUnavailableTitle: "Archivierungsauswirkung nicht verfügbar",
      impactUnavailableDescription: "Der autorisierte Auswirkungsvertrag konnte nicht gelesen werden. Die Archivierung bleibt deaktiviert, bis eine aktuelle Auswirkung verifiziert ist.",
      invalidInput: "Der übermittelte Lebenszyklusbefehl ist ungültig.",
      requiredField: "Dieses Feld ist erforderlich und muss das erwartete Format haben.",
      sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich erneut an, bevor du Inhalte änderst.",
      forbidden: "Deine aktuelle Serversitzung ist für diesen Inhaltslebenszyklusbefehl nicht autorisiert.",
      readinessFailed: "Der Inhaltsgraph besteht die Veröffentlichungsbereitschaftsprüfungen der Datenbank nicht.",
      approvalRequired: "Vor der Veröffentlichung ist ein aktuelles freigegebenes Review erforderlich.",
      idempotencyConflict: "Dieser Anfrageschlüssel wurde bereits für andere Inhalte verwendet. Lade die Version neu und versuche es erneut.",
      failed: "Der Lebenszyklusbefehl konnte nicht abgeschlossen werden. Lade die Version neu und versuche es erneut.",
      notices: {
        stale: { title: "Version wurde geändert", description: "Diese Seite basierte auf einer älteren Revision. Der aktuelle Serverstand wurde geladen; prüfe ihn vor einem neuen Versuch." },
        submitted: { title: "Review gestartet", description: "Der Entwurf hat die Datenbankvalidierung bestanden und befindet sich jetzt im Review." },
        review_approved: { title: "Review freigegeben", description: "Der aktuelle Inhaltsgraph wurde freigegeben. Autorisierte Reviewer können ihn jetzt veröffentlichen." },
        changes_requested: { title: "Änderungen angefordert", description: "Das Review wurde erfasst und die Version auf Entwurf zurückgesetzt." },
        published: { title: "Version veröffentlicht", description: "Der unveränderliche Veröffentlichungssnapshot ist jetzt aktiv." },
        archived: { title: "Version archiviert", description: "Die veröffentlichte Version und ihre verifizierte Archivierungsauswirkung wurden als archiviert erfasst." },
      },
    },
    preview: "Vorschau",
    previewAs: "Vorschaurolle",
    previewRole: { learner: "Lernende", trainer: "Trainer", admin: "Administration" },
    previewNotice: "Diese Vorschau schließt Musterantworten und Korrektheitskennzeichen bewusst aus.",
    previewProjectionTitle: "Rekonstruierte schreibgeschützte Vorschau",
    previewBack: "Zurück zur Version",
    previewTarget: "Testziel öffnen",
    previewNoTarget: "Kein Testziel konfiguriert.",
    previewHintAvailable: "Ein optionaler Hinweis ist konfiguriert.",
    previewHintUnavailable: "Kein optionaler Hinweis konfiguriert.",
    previewImmutableNotice: "Diese sichere Vorschau wird aus normalisierten Zeilen rekonstruiert. Veröffentlichte Versionen behalten zusätzlich einen unveränderlichen serverseitigen Snapshot.",
    localeNames: { en: "Englisch", de: "Deutsch", ru: "Russisch" },
    courseStates: { draft: "Entwurf", active: "Aktiv", inactive: "Inaktiv", archived: "Archiviert" },
    versionStates: { draft: "Entwurf", in_review: "Im Review", published: "Veröffentlicht", archived: "Archiviert" },
    taskKinds: { practical: "Praxis", knowledge: "Wissen", placement: "Einstufung" },
  },
  ru: {
    title: "Студия курсов",
    description: "Проверка локализованных курсов, жизненного цикла версий, этапов и безопасного предпросмотра заданий.",
    courseCount: (count: number) => `${count} курс(ов)`,
    page: (current: number, total: number) => `Страница ${current} из ${total}`,
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
    emptyTitle: "Курсы недоступны",
    emptyDescription: "В разрешённой вам области содержимого нет курсов.",
    forbiddenTitle: "Нет доступа к содержимому",
    forbiddenDescription: "Эта серверная сессия не имеет разрешения content.manage.",
    loading: "Загрузка содержимого курса…",
    errorTitle: "Не удалось загрузить содержимое курсов",
    errorDescription: "Разрешённый запрос к базе данных завершился ошибкой или вернул неверный контракт. Повторите попытку.",
    retry: "Повторить",
    openCourse: "Открыть курс",
    backToCourses: "Все курсы",
    updated: "Обновлено",
    estimatedDuration: "Расчётная длительность",
    minutes: (count: number) => `${count} мин`,
    versions: (count: number) => `${count} верс.`,
    stages: (count: number) => `${count} этап(ов)`,
    tasks: (count: number) => `${count} заданий`,
    translations: "Переводы",
    complete: "Полный",
    incomplete: "Неполный",
    noSummary: "Локализованное описание отсутствует.",
    courseDetails: "Сведения о курсе",
    contentVersions: "Версии содержимого",
    noVersionsTitle: "Нет версий содержимого",
    noVersionsDescription: "Для этого курса ещё нет записи версии.",
    openVersion: "Проверить версию",
    versionTitle: (version: number) => `Версия ${version}`,
    versionDetails: "Сведения о версии",
    changeSummary: "Описание изменений",
    noChangeSummary: "Описание изменений не записано.",
    publishedAt: "Опубликовано",
    notPublished: "Не опубликовано",
    rowVersion: "Ревизия",
    contentTree: "Этапы и задания",
    noStagesTitle: "В этой версии нет этапов",
    noStagesDescription: "Нормализованные строки содержимого не содержат этапов этой версии.",
    noTasks: "На этом этапе нет заданий.",
    taskKind: "Тип",
    taskTarget: "Тестовая цель",
    assessmentOptions: (count: number) => `${count} вариант(ов) ответа`,
    assessmentQuestion: "Проверка знаний",
    media: "Медиа",
    reviews: "Проверки",
    localeFallback: (locale: string) => `Резервный перевод: ${locale.toUpperCase()}`,
    validation: "Готовность к публикации",
    validationPassed: "Проверки полноты представления пройдены.",
    validationFailed: (count: number) => `Требуют внимания: ${count}.`,
    readinessIssues: {
      missing_course_locale: "Обязательный перевод курса заполнен не полностью.",
      missing_stage: "Для этой версии требуется хотя бы один этап.",
      missing_stage_locale: "Обязательный перевод этапа заполнен не полностью.",
      missing_task: "На каждом этапе требуется хотя бы одно задание.",
      missing_task_locale: "Обязательный перевод задания заполнен не полностью.",
      invalid_position: "Позиции должны быть непрерывными и начинаться с нуля.",
    },
    mutationUnavailableTitle: "Редактирование содержимого пока доступно только для чтения",
    mutationUnavailableDescription: "Создание, изменение, удаление и перестановка курсов, этапов, заданий, тестовых ответов и медиа пока недоступны. Команды проверки, публикации и архивирования работают на странице каждой версии.",
    lifecycle: {
      title: "Жизненный цикл версии",
      description: "Проведите версию через проверку, публикацию и архивирование с помощью аудируемых идемпотентных команд.",
      permissionTitle: "Команда жизненного цикла недоступна",
      permissionDescription: "Текущая серверная сессия может просматривать это состояние, но не имеет необходимого разрешения на его изменение.",
      archivedTitle: "Архивная версия",
      archivedDescription: "Эта версия и снимок публикации неизменяемы. Для дальнейших изменений создайте новую черновую версию.",
      submitTitle: "Отправить на проверку",
      submitDescription: "Перед началом проверки база данных проверит весь локализованный граф содержимого.",
      submit: "Отправить на проверку",
      submitting: "Отправка…",
      reviewTitle: "Записать решение проверки",
      reviewDescription: "Проверяющий с правом публикации должен указать решение и комментарий. Запрос изменений возвращает версию в черновик.",
      decisionLabel: "Решение",
      decisionPlaceholder: "Выберите решение",
      decisions: { approved: "Одобрить текущее содержимое", changes_requested: "Запросить изменения" },
      commentLabel: "Комментарий проверки",
      commentPlaceholder: "Объясните решение и необходимые изменения.",
      saveReview: "Записать решение",
      savingReview: "Сохранение…",
      latestReviewTitle: "Последняя проверка",
      currentApproval: "Это одобрение соответствует текущему неизменяемому графу проверки.",
      previousReview: "Эта проверка не разрешает публикацию текущей версии.",
      publishTitle: "Опубликовать одобренную версию",
      publishDescription: "Публикация атомарно создаёт неизменяемый безопасный для учащихся снимок и активирует черновые этапы и задания.",
      publish: "Опубликовать версию",
      publishing: "Публикация…",
      awaitingApprovalTitle: "Требуется актуальное одобрение",
      awaitingApprovalDescription: "Перед публикацией запишите одобрение текущего графа проверки.",
      archiveTitle: "Архивировать опубликованную версию",
      archiveWarning: "Архивирование этой версии необратимо. Перед продолжением проверьте все затрагиваемые записи ниже.",
      impactTitle: "Текущее влияние архивирования",
      impactTasks: "Задания",
      impactSchedules: "Расписания",
      impactAttempts: "Попытки",
      impactOpenAttempts: "Открытые попытки",
      impactSubmissions: "Отправки",
      impactFingerprint: "Отпечаток влияния",
      archiveReasonLabel: "Причина архивирования",
      archiveReasonPlaceholder: "Объясните, почему опубликованную версию необходимо архивировать.",
      confirmImpact: "Я проверил(а) именно эти значения влияния и отпечаток.",
      archive: "Архивировать версию",
      archiving: "Архивирование…",
      impactUnavailableTitle: "Влияние архивирования недоступно",
      impactUnavailableDescription: "Не удалось прочитать авторизованный контракт влияния. Архивирование отключено до получения актуального проверенного влияния.",
      invalidInput: "Переданная команда жизненного цикла недействительна.",
      requiredField: "Поле обязательно и должно соответствовать ожидаемому формату.",
      sessionExpired: "Сеанс истёк. Войдите снова перед изменением содержимого.",
      forbidden: "Текущая серверная сессия не авторизована для этой команды жизненного цикла содержимого.",
      readinessFailed: "Граф содержимого не прошёл проверки готовности к публикации в базе данных.",
      approvalRequired: "Перед публикацией требуется актуальная одобренная проверка.",
      idempotencyConflict: "Этот ключ запроса уже использован для другого содержимого. Перезагрузите версию и повторите попытку.",
      failed: "Не удалось выполнить команду жизненного цикла. Перезагрузите версию и повторите попытку.",
      notices: {
        stale: { title: "Версия изменилась", description: "Страница основывалась на старой ревизии. Загружено текущее серверное состояние; проверьте его перед повтором." },
        submitted: { title: "Проверка начата", description: "Черновик прошёл проверку базы данных и теперь находится на проверке." },
        review_approved: { title: "Проверка одобрена", description: "Текущий граф содержимого одобрен. Авторизованные проверяющие могут его опубликовать." },
        changes_requested: { title: "Запрошены изменения", description: "Решение записано, а версия возвращена в черновик." },
        published: { title: "Версия опубликована", description: "Неизменяемый снимок публикации теперь активен." },
        archived: { title: "Версия архивирована", description: "Опубликованная версия и проверенное влияние архивирования записаны в архив." },
      },
    },
    preview: "Предпросмотр",
    previewAs: "Роль предпросмотра",
    previewRole: { learner: "Учащийся", trainer: "Тренер", admin: "Администратор" },
    previewNotice: "Эталонные ответы и признаки правильности намеренно исключены из предпросмотра.",
    previewProjectionTitle: "Восстановленный предпросмотр только для чтения",
    previewBack: "Назад к версии",
    previewTarget: "Открыть тестовую цель",
    previewNoTarget: "Тестовая цель не настроена.",
    previewHintAvailable: "Настроена необязательная подсказка.",
    previewHintUnavailable: "Необязательная подсказка не настроена.",
    previewImmutableNotice: "Этот безопасный предпросмотр восстанавливается из нормализованных строк. Для опубликованных версий также хранится неизменяемый серверный снимок.",
    localeNames: { en: "Английский", de: "Немецкий", ru: "Русский" },
    courseStates: { draft: "Черновик", active: "Активен", inactive: "Неактивен", archived: "В архиве" },
    versionStates: { draft: "Черновик", in_review: "На проверке", published: "Опубликована", archived: "В архиве" },
    taskKinds: { practical: "Практика", knowledge: "Знания", placement: "Входная оценка" },
  },
} satisfies Record<Locale, AdminContentCopy>;
