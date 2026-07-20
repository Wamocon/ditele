import type { Locale } from "@/shared/i18n/config";

import type { AdminMemberDetail } from "./admin-member-detail-model";

type MembershipState = AdminMemberDetail["membership"]["state"];
type ProfileState = NonNullable<AdminMemberDetail["profile"]["state"]>;
type CohortState = AdminMemberDetail["assignments"][number]["cohortState"];
type AssignmentRole = AdminMemberDetail["assignments"][number]["role"];
type EnrollmentState = AdminMemberDetail["enrollments"][number]["state"];
type CertificateState = AdminMemberDetail["certificates"][number]["state"];
type CertificateType = AdminMemberDetail["certificates"][number]["type"];

export type AdminMemberDetailCopy = {
  readonly back: string;
  readonly title: string;
  readonly description: string;
  readonly displayNameUnavailable: string;
  readonly minimizedTitle: string;
  readonly minimizedDescription: string;
  readonly profile: string;
  readonly profileUnavailable: string;
  readonly profileUnavailableDescription: string;
  readonly displayName: string;
  readonly preferredLocale: string;
  readonly timezone: string;
  readonly joined: string;
  readonly invited: string;
  readonly validUntil: string;
  readonly noExpiry: string;
  readonly roles: string;
  readonly noRoles: string;
  readonly organizationScope: string;
  readonly cohortScope: string;
  readonly assignments: string;
  readonly assignmentsDescription: string;
  readonly noAssignments: string;
  readonly course: string;
  readonly assigned: string;
  readonly openGroup: string;
  readonly courseLocaleFallback: (locale: Locale) => string;
  readonly progress: string;
  readonly attempts: string;
  readonly activeAttempts: string;
  readonly acceptedAttempts: string;
  readonly lastActivity: string;
  readonly noActivity: string;
  readonly learnerContext: string;
  readonly learnerContextDescription: string;
  readonly enrollments: string;
  readonly noEnrollments: string;
  readonly enrollmentUpdated: string;
  readonly enrollmentCompleted: string;
  readonly certificates: string;
  readonly noCertificates: string;
  readonly certificateCourseUnavailable: string;
  readonly recorded: string;
  readonly issued: string;
  readonly available: string;
  readonly expires: string;
  readonly revoked: string;
  readonly readOnlyTitle: string;
  readonly readOnlyDescription: string;
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
  readonly membershipStates: Readonly<Record<MembershipState, string>>;
  readonly profileStates: Readonly<Record<ProfileState, string>>;
  readonly cohortStates: Readonly<Record<CohortState, string>>;
  readonly assignmentRoles: Readonly<Record<AssignmentRole, string>>;
  readonly enrollmentStates: Readonly<Record<EnrollmentState, string>>;
  readonly certificateStates: Readonly<Record<CertificateState, string>>;
  readonly certificateTypes: Readonly<Record<CertificateType, string>>;
  readonly roleLabel: (code: string) => string;
};

const roleLabels: Record<Locale, Readonly<Record<string, string>>> = {
  en: {
    learner: "Learner",
    trainer: "Trainer",
    admin: "Platform administrator",
    organization_admin: "Organization administrator",
    content_admin: "Content administrator",
    support: "Support",
    integration_admin: "Integration administrator",
    dpo: "Data protection officer",
  },
  de: {
    learner: "Lernende Person",
    trainer: "Trainer:in",
    admin: "Plattformadministration",
    organization_admin: "Organisationsadministration",
    content_admin: "Inhaltsadministration",
    support: "Support",
    integration_admin: "Integrationsadministration",
    dpo: "Datenschutzbeauftragte:r",
  },
  ru: {
    learner: "Учащийся",
    trainer: "Тренер",
    admin: "Администратор платформы",
    organization_admin: "Администратор организации",
    content_admin: "Администратор контента",
    support: "Поддержка",
    integration_admin: "Администратор интеграций",
    dpo: "Ответственный за защиту данных",
  },
};

function fallbackRole(code: string): string {
  return code.replaceAll("_", " ");
}

export const adminMemberDetailCopy = {
  en: {
    back: "Back to users",
    title: "Member details",
    description:
      "Review the minimum organization-scoped identity, assignment, learning progress, and certificate context needed for administration.",
    displayNameUnavailable: "Display name unavailable",
    minimizedTitle: "Privacy-minimized administration view",
    minimizedDescription:
      "Authentication contacts, credentials, private answers, and certificate files are not exposed on this page.",
    profile: "Profile and membership",
    profileUnavailable: "Active profile projection unavailable",
    profileUnavailableDescription:
      "The organization membership exists, but no permitted active member-profile projection is available.",
    displayName: "Display name",
    preferredLocale: "Preferred language",
    timezone: "Time zone",
    joined: "Joined",
    invited: "Invited",
    validUntil: "Membership valid until",
    noExpiry: "No recorded expiry",
    roles: "Current roles",
    noRoles: "No current organization-scoped role assignment is visible.",
    organizationScope: "Organization scope",
    cohortScope: "Group scope",
    assignments: "Group assignments",
    assignmentsDescription:
      "Current and historical learner or trainer assignments in this organization.",
    noAssignments: "No group assignment is recorded for this member.",
    course: "Course",
    assigned: "Assigned",
    openGroup: "Open group workspace",
    courseLocaleFallback: (locale) => `Course title fallback from ${locale.toUpperCase()}`,
    progress: "Recorded learning progress",
    attempts: "Attempts",
    activeAttempts: "Active",
    acceptedAttempts: "Accepted",
    lastActivity: "Last activity",
    noActivity: "No task activity recorded",
    learnerContext: "Learner context",
    learnerContextDescription:
      "Read-only enrollment, attempt, and certificate lifecycle records for this organization.",
    enrollments: "Enrollments",
    noEnrollments: "No enrollment record is visible for this member.",
    enrollmentUpdated: "Updated",
    enrollmentCompleted: "Completed",
    certificates: "Certificates",
    noCertificates: "No certificate lifecycle record is visible for this member.",
    certificateCourseUnavailable: "Course not recorded",
    recorded: "Recorded",
    issued: "Issued",
    available: "Available",
    expires: "Expires",
    revoked: "Revoked",
    readOnlyTitle: "Administration commands are not available here",
    readOnlyDescription:
      "Profile edits, role changes, group membership changes, deletion, certificate issuance, and downloads require separate audited command workflows.",
    forbiddenTitle: "Member administration not granted",
    forbiddenDescription:
      "This server session has no active organization scope with organization.manage permission.",
    loadingTitle: "Loading member details",
    loadingDescription: "Resolving the authorized organization-member projection…",
    errorTitle: "Member details could not be loaded",
    errorDescription:
      "The authorized read failed or returned an invalid scoped data contract. No partial member context is shown.",
    retry: "Try again",
    membershipStates: { invited: "Invited", active: "Active member", suspended: "Suspended", removed: "Removed" },
    profileStates: { draft: "Draft profile", active: "Active profile", inactive: "Inactive profile", archived: "Archived profile" },
    cohortStates: { waiting: "Waiting", active: "Active", completed: "Completed", cancelled: "Cancelled" },
    assignmentRoles: { learner: "Learner assignment", trainer: "Trainer assignment" },
    enrollmentStates: { requested: "Requested", approved: "Approved", rejected: "Rejected", assigned: "Assigned", cancelled: "Cancelled", completed: "Completed" },
    certificateStates: { eligible: "Eligible", issued: "Issued", available: "Available", revoked: "Revoked", expired: "Expired" },
    certificateTypes: { course_completion: "Course completion", exam: "Assessment", competency: "Competency" },
    roleLabel: (code) => roleLabels.en[code] ?? fallbackRole(code),
  },
  de: {
    back: "Zurück zu Benutzer:innen",
    title: "Mitgliedsdetails",
    description:
      "Die für die Administration notwendigen organisationsbezogenen Identitäts-, Zuweisungs-, Lernfortschritts- und Zertifikatsdaten prüfen.",
    displayNameUnavailable: "Anzeigename nicht verfügbar",
    minimizedTitle: "Datensparsame Administrationsansicht",
    minimizedDescription:
      "Authentifizierungskontakte, Zugangsdaten, private Antworten und Zertifikatsdateien werden auf dieser Seite nicht offengelegt.",
    profile: "Profil und Mitgliedschaft",
    profileUnavailable: "Aktive Profilprojektion nicht verfügbar",
    profileUnavailableDescription:
      "Die Organisationsmitgliedschaft besteht, aber es ist keine zulässige aktive Mitgliedsprofilprojektion verfügbar.",
    displayName: "Anzeigename",
    preferredLocale: "Bevorzugte Sprache",
    timezone: "Zeitzone",
    joined: "Beigetreten",
    invited: "Eingeladen",
    validUntil: "Mitgliedschaft gültig bis",
    noExpiry: "Kein Ablauf erfasst",
    roles: "Aktuelle Rollen",
    noRoles: "Keine aktuelle organisationsbezogene Rollenzuweisung ist sichtbar.",
    organizationScope: "Organisationsbereich",
    cohortScope: "Gruppenbereich",
    assignments: "Gruppenzuweisungen",
    assignmentsDescription:
      "Aktuelle und historische Lernenden- oder Trainerzuweisungen in dieser Organisation.",
    noAssignments: "Für dieses Mitglied ist keine Gruppenzuweisung erfasst.",
    course: "Kurs",
    assigned: "Zugewiesen",
    openGroup: "Gruppenbereich öffnen",
    courseLocaleFallback: (locale) => `Kurstitel-Fallback aus ${locale.toUpperCase()}`,
    progress: "Erfasster Lernfortschritt",
    attempts: "Versuche",
    activeAttempts: "Aktiv",
    acceptedAttempts: "Akzeptiert",
    lastActivity: "Letzte Aktivität",
    noActivity: "Keine Aufgabenaktivität erfasst",
    learnerContext: "Lernendenkontext",
    learnerContextDescription:
      "Schreibgeschützte Einschreibungs-, Versuchs- und Zertifikatsstatus dieser Organisation.",
    enrollments: "Einschreibungen",
    noEnrollments: "Für dieses Mitglied ist keine Einschreibung sichtbar.",
    enrollmentUpdated: "Aktualisiert",
    enrollmentCompleted: "Abgeschlossen",
    certificates: "Zertifikate",
    noCertificates: "Für dieses Mitglied ist kein Zertifikatsstatus sichtbar.",
    certificateCourseUnavailable: "Kurs nicht erfasst",
    recorded: "Erfasst",
    issued: "Ausgestellt",
    available: "Verfügbar",
    expires: "Läuft ab",
    revoked: "Widerrufen",
    readOnlyTitle: "Administrationsbefehle sind hier nicht verfügbar",
    readOnlyDescription:
      "Profiländerungen, Rollen- oder Gruppenzuweisungen, Löschung, Zertifikatsausstellung und Downloads benötigen getrennte auditierte Befehlsabläufe.",
    forbiddenTitle: "Keine Mitgliedsadministration",
    forbiddenDescription:
      "Diese Serversitzung hat keinen aktiven Organisationsbereich mit der Berechtigung organization.manage.",
    loadingTitle: "Mitgliedsdetails werden geladen",
    loadingDescription: "Die autorisierte Organisationsmitgliedsprojektion wird ermittelt…",
    errorTitle: "Mitgliedsdetails konnten nicht geladen werden",
    errorDescription:
      "Der autorisierte Zugriff ist fehlgeschlagen oder lieferte einen ungültigen Bereichsvertrag. Es werden keine Teildaten angezeigt.",
    retry: "Erneut versuchen",
    membershipStates: { invited: "Eingeladen", active: "Aktives Mitglied", suspended: "Gesperrt", removed: "Entfernt" },
    profileStates: { draft: "Profilentwurf", active: "Aktives Profil", inactive: "Inaktives Profil", archived: "Archiviertes Profil" },
    cohortStates: { waiting: "Wartend", active: "Aktiv", completed: "Abgeschlossen", cancelled: "Abgebrochen" },
    assignmentRoles: { learner: "Lernendenzuweisung", trainer: "Trainerzuweisung" },
    enrollmentStates: { requested: "Angefragt", approved: "Genehmigt", rejected: "Abgelehnt", assigned: "Zugewiesen", cancelled: "Abgebrochen", completed: "Abgeschlossen" },
    certificateStates: { eligible: "Berechtigt", issued: "Ausgestellt", available: "Verfügbar", revoked: "Widerrufen", expired: "Abgelaufen" },
    certificateTypes: { course_completion: "Kursabschluss", exam: "Prüfung", competency: "Kompetenz" },
    roleLabel: (code) => roleLabels.de[code] ?? fallbackRole(code),
  },
  ru: {
    back: "Назад к пользователям",
    title: "Данные участника",
    description:
      "Минимальные данные об участнике, назначениях, учебном прогрессе и сертификатах в пределах организации.",
    displayNameUnavailable: "Отображаемое имя недоступно",
    minimizedTitle: "Административный просмотр с минимизацией данных",
    minimizedDescription:
      "Контактные данные аутентификации, учётные данные, личные ответы и файлы сертификатов на этой странице не раскрываются.",
    profile: "Профиль и участие",
    profileUnavailable: "Активная проекция профиля недоступна",
    profileUnavailableDescription:
      "Участие в организации существует, но разрешённая активная проекция профиля отсутствует.",
    displayName: "Отображаемое имя",
    preferredLocale: "Предпочитаемый язык",
    timezone: "Часовой пояс",
    joined: "Дата присоединения",
    invited: "Дата приглашения",
    validUntil: "Участие действительно до",
    noExpiry: "Срок не указан",
    roles: "Текущие роли",
    noRoles: "Текущие роли в пределах организации не видны.",
    organizationScope: "Область организации",
    cohortScope: "Область группы",
    assignments: "Назначения в группы",
    assignmentsDescription:
      "Текущие и исторические назначения учащегося или тренера в этой организации.",
    noAssignments: "Для участника не зарегистрировано назначений в группы.",
    course: "Курс",
    assigned: "Назначен",
    openGroup: "Открыть рабочую область группы",
    courseLocaleFallback: (locale) => `Резервное название курса: ${locale.toUpperCase()}`,
    progress: "Зарегистрированный учебный прогресс",
    attempts: "Попытки",
    activeAttempts: "Активные",
    acceptedAttempts: "Принятые",
    lastActivity: "Последняя активность",
    noActivity: "Активность по заданиям не зарегистрирована",
    learnerContext: "Контекст учащегося",
    learnerContextDescription:
      "Доступные только для чтения статусы зачисления, попыток и сертификатов этой организации.",
    enrollments: "Зачисления",
    noEnrollments: "Для участника не видно записей о зачислении.",
    enrollmentUpdated: "Обновлено",
    enrollmentCompleted: "Завершено",
    certificates: "Сертификаты",
    noCertificates: "Для участника не видно записей о статусе сертификатов.",
    certificateCourseUnavailable: "Курс не указан",
    recorded: "Зарегистрировано",
    issued: "Выдано",
    available: "Доступно",
    expires: "Истекает",
    revoked: "Отозвано",
    readOnlyTitle: "Административные команды здесь недоступны",
    readOnlyDescription:
      "Изменение профиля, ролей и групп, удаление, выдача и скачивание сертификатов требуют отдельных аудируемых процессов.",
    forbiddenTitle: "Управление участником не разрешено",
    forbiddenDescription:
      "У серверной сессии нет активной области организации с разрешением organization.manage.",
    loadingTitle: "Загрузка данных участника",
    loadingDescription: "Определение разрешённой проекции участника организации…",
    errorTitle: "Не удалось загрузить данные участника",
    errorDescription:
      "Разрешённое чтение завершилось ошибкой или вернуло неверный контракт области. Частичные данные не показаны.",
    retry: "Повторить",
    membershipStates: { invited: "Приглашён", active: "Активный участник", suspended: "Приостановлен", removed: "Удалён" },
    profileStates: { draft: "Черновик профиля", active: "Активный профиль", inactive: "Неактивный профиль", archived: "Архивный профиль" },
    cohortStates: { waiting: "Ожидает", active: "Активна", completed: "Завершена", cancelled: "Отменена" },
    assignmentRoles: { learner: "Назначение учащегося", trainer: "Назначение тренера" },
    enrollmentStates: { requested: "Запрошено", approved: "Одобрено", rejected: "Отклонено", assigned: "Назначено", cancelled: "Отменено", completed: "Завершено" },
    certificateStates: { eligible: "Есть право", issued: "Выдан", available: "Доступен", revoked: "Отозван", expired: "Истёк" },
    certificateTypes: { course_completion: "Завершение курса", exam: "Оценивание", competency: "Компетенция" },
    roleLabel: (code) => roleLabels.ru[code] ?? fallbackRole(code),
  },
} satisfies Record<Locale, AdminMemberDetailCopy>;
