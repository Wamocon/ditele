import type { Locale } from "@/shared/i18n/config";

import type {
  AdminGroupListItem,
  AdminOrganizationSettings,
  AdminUserDirectoryItem,
} from "./management-read-model";

type AsyncStateCopy = {
  readonly forbiddenTitle: string;
  readonly forbiddenDescription: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
};

export type AdminGroupsCopy = AsyncStateCopy & {
  readonly title: string;
  readonly description: string;
  readonly count: (count: number) => string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly course: string;
  readonly schedule: string;
  readonly notScheduled: string;
  readonly starts: (value: string) => string;
  readonly ends: (value: string) => string;
  readonly scheduleRange: (start: string, end: string) => string;
  readonly capacity: string;
  readonly unlimitedCapacity: string;
  readonly capacityValue: (learners: number, capacity: number) => string;
  readonly learners: (count: number) => string;
  readonly trainers: (count: number) => string;
  readonly updated: string;
  readonly localeFallback: (locale: Locale) => string;
  readonly states: Readonly<Record<AdminGroupListItem["state"], string>>;
  readonly progressionModes: Readonly<Record<AdminGroupListItem["progressionMode"], string>>;
  readonly page: (current: number, total: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly openGroup: string;
  readonly readOnlyTitle: string;
  readonly readOnlyDescription: string;
};

export type AdminUsersCopy = AsyncStateCopy & {
  readonly title: string;
  readonly description: string;
  readonly count: (count: number) => string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly profileRestricted: string;
  readonly profileRestrictedDescription: string;
  readonly displayNameMissing: string;
  readonly membership: string;
  readonly joined: string;
  readonly invited: string;
  readonly validUntil: string;
  readonly noExpiry: string;
  readonly profileLocale: string;
  readonly roles: string;
  readonly noRoles: string;
  readonly cohortScoped: string;
  readonly organizationScoped: string;
  readonly openMemberDetails: string;
  readonly membershipStates: Readonly<Record<AdminUserDirectoryItem["membershipState"], string>>;
  readonly profileStates: Readonly<Record<NonNullable<AdminUserDirectoryItem["profileState"]>, string>>;
  readonly roleLabel: (code: string) => string;
  readonly page: (current: number, total: number) => string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly readOnlyTitle: string;
  readonly readOnlyDescription: string;
};

export type AdminSettingsCopy = AsyncStateCopy & {
  readonly title: string;
  readonly description: string;
  readonly organization: string;
  readonly slug: string;
  readonly status: string;
  readonly region: string;
  readonly regionNotSet: string;
  readonly updated: string;
  readonly entitlements: string;
  readonly entitlementsDescription: string;
  readonly noEntitlements: string;
  readonly package: string;
  readonly packageUnavailable: string;
  readonly capability: string;
  readonly scope: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly noExpiry: string;
  readonly source: string;
  readonly integrations: string;
  readonly integrationsDescription: string;
  readonly noIntegrations: string;
  readonly integrationPermissionTitle: string;
  readonly integrationPermissionDescription: string;
  readonly provider: string;
  readonly limitNotice: (visible: number, total: number) => string;
  readonly organizationStates: Readonly<Record<AdminOrganizationSettings["organization"]["state"], string>>;
  readonly packageStates: Readonly<Record<NonNullable<AdminOrganizationSettings["entitlements"][number]["packageState"]>, string>>;
  readonly integrationStates: Readonly<Record<AdminOrganizationSettings["integrations"][number]["state"], string>>;
  readonly scopes: Readonly<Record<AdminOrganizationSettings["entitlements"][number]["scope"], string>>;
  readonly sources: Readonly<Record<AdminOrganizationSettings["entitlements"][number]["source"], string>>;
  readonly providerLabel: (provider: AdminOrganizationSettings["integrations"][number]["provider"]) => string;
  readonly readOnlyTitle: string;
  readonly readOnlyDescription: string;
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

export const adminGroupsCopy: Record<Locale, AdminGroupsCopy> = {
  en: {
    title: "Groups and schedules",
    description: "Monitor organization cohorts, course assignments, lifecycle, scheduling, capacity, and active membership.",
    count: (count) => `${count} ${count === 1 ? "group" : "groups"}`,
    emptyTitle: "No groups available",
    emptyDescription: "No cohort is visible in this organization scope.",
    forbiddenTitle: "Group administration not granted",
    forbiddenDescription: "This server session has no organization-scoped cohort.manage permission.",
    loadingTitle: "Loading groups",
    loadingDescription: "Reading authorized cohort and membership data…",
    errorTitle: "Groups could not be loaded",
    errorDescription: "The authorized database read failed or returned an invalid group contract.",
    retry: "Try again",
    course: "Course",
    schedule: "Schedule",
    notScheduled: "No schedule configured",
    starts: (value) => `Starts ${value}`,
    ends: (value) => `Ends ${value}`,
    scheduleRange: (start, end) => `${start} – ${end}`,
    capacity: "Learner capacity",
    unlimitedCapacity: "No capacity limit",
    capacityValue: (learners, capacity) => `${learners} of ${capacity} active learners`,
    learners: (count) => `${count} active ${count === 1 ? "learner" : "learners"}`,
    trainers: (count) => `${count} active ${count === 1 ? "trainer" : "trainers"}`,
    updated: "Updated",
    localeFallback: (locale) => `Course title fallback from ${locale.toUpperCase()}`,
    states: { waiting: "Waiting", active: "Active", completed: "Completed", cancelled: "Cancelled" },
    progressionModes: { scheduled: "Scheduled progression", flexible: "Flexible progression" },
    page: (current, total) => `Page ${current} of ${total}`,
    previousPage: "Previous page",
    nextPage: "Next page",
    openGroup: "Open group workspace",
    readOnlyTitle: "Creation and membership commands remain read-only",
    readOnlyDescription: "Open a group to use its audited lifecycle and task-schedule commands. Creation, duplication, deletion, and membership changes remain unavailable until their dedicated commands are implemented.",
  },
  de: {
    title: "Gruppen und Zeitpläne",
    description: "Organisationsgruppen, Kurszuordnung, Lebenszyklus, Planung, Kapazität und aktive Mitgliedschaft überwachen.",
    count: (count) => `${count} ${count === 1 ? "Gruppe" : "Gruppen"}`,
    emptyTitle: "Keine Gruppen verfügbar",
    emptyDescription: "In diesem Organisationsbereich ist keine Kohorte sichtbar.",
    forbiddenTitle: "Keine Gruppenadministration",
    forbiddenDescription: "Diese Serversitzung hat keine organisationsbezogene Berechtigung cohort.manage.",
    loadingTitle: "Gruppen werden geladen",
    loadingDescription: "Autorisierte Kohorten- und Mitgliedsdaten werden gelesen…",
    errorTitle: "Gruppen konnten nicht geladen werden",
    errorDescription: "Der autorisierte Datenbankzugriff ist fehlgeschlagen oder lieferte einen ungültigen Gruppenvertrag.",
    retry: "Erneut versuchen",
    course: "Kurs",
    schedule: "Zeitplan",
    notScheduled: "Kein Zeitplan konfiguriert",
    starts: (value) => `Start ${value}`,
    ends: (value) => `Ende ${value}`,
    scheduleRange: (start, end) => `${start} – ${end}`,
    capacity: "Lernendenkapazität",
    unlimitedCapacity: "Keine Kapazitätsgrenze",
    capacityValue: (learners, capacity) => `${learners} von ${capacity} aktiven Lernenden`,
    learners: (count) => `${count} aktive ${count === 1 ? "lernende Person" : "Lernende"}`,
    trainers: (count) => `${count} aktive ${count === 1 ? "Trainer:in" : "Trainer:innen"}`,
    updated: "Aktualisiert",
    localeFallback: (locale) => `Kurstitel-Fallback aus ${locale.toUpperCase()}`,
    states: { waiting: "Wartend", active: "Aktiv", completed: "Abgeschlossen", cancelled: "Abgebrochen" },
    progressionModes: { scheduled: "Geplanter Fortschritt", flexible: "Flexibler Fortschritt" },
    page: (current, total) => `Seite ${current} von ${total}`,
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    openGroup: "Gruppenbereich öffnen",
    readOnlyTitle: "Erstellung und Mitgliedschaften bleiben schreibgeschützt",
    readOnlyDescription: "In der Gruppendetailansicht stehen auditierte Lebenszyklus- und Aufgabenzeitplanbefehle bereit. Erstellen, Duplizieren, Löschen und Mitgliedschaftsänderungen bleiben bis zu eigenen Befehlen deaktiviert.",
  },
  ru: {
    title: "Группы и расписания",
    description: "Контроль учебных групп организации, курсов, жизненного цикла, расписания, вместимости и активных участников.",
    count: (count) => `Групп: ${count}`,
    emptyTitle: "Группы недоступны",
    emptyDescription: "В разрешённой области организации нет учебных групп.",
    forbiddenTitle: "Нет доступа к управлению группами",
    forbiddenDescription: "У серверной сессии нет разрешения cohort.manage для этой организации.",
    loadingTitle: "Загрузка групп",
    loadingDescription: "Чтение разрешённых данных групп и участников…",
    errorTitle: "Не удалось загрузить группы",
    errorDescription: "Разрешённый запрос к базе завершился ошибкой или вернул неверный контракт группы.",
    retry: "Повторить",
    course: "Курс",
    schedule: "Расписание",
    notScheduled: "Расписание не задано",
    starts: (value) => `Начало: ${value}`,
    ends: (value) => `Окончание: ${value}`,
    scheduleRange: (start, end) => `${start} – ${end}`,
    capacity: "Вместимость",
    unlimitedCapacity: "Без ограничения вместимости",
    capacityValue: (learners, capacity) => `${learners} из ${capacity} активных учащихся`,
    learners: (count) => `Активных учащихся: ${count}`,
    trainers: (count) => `Активных тренеров: ${count}`,
    updated: "Обновлено",
    localeFallback: (locale) => `Резервный перевод курса: ${locale.toUpperCase()}`,
    states: { waiting: "Ожидает", active: "Активна", completed: "Завершена", cancelled: "Отменена" },
    progressionModes: { scheduled: "По расписанию", flexible: "Гибкое обучение" },
    page: (current, total) => `Страница ${current} из ${total}`,
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
    openGroup: "Открыть рабочую область",
    readOnlyTitle: "Создание и управление участниками доступны только для чтения",
    readOnlyDescription: "Откройте группу, чтобы использовать аудируемые команды жизненного цикла и расписания. Создание, дублирование, удаление и изменение участников пока недоступны.",
  },
};

export const adminUsersCopy: Record<Locale, AdminUsersCopy> = {
  en: {
    title: "People and role assignments",
    description: "Review organization memberships, actor-scoped profile projections, and current organization-scoped role assignments.",
    count: (count) => `${count} ${count === 1 ? "membership" : "memberships"}`,
    emptyTitle: "No organization memberships",
    emptyDescription: "No membership is visible in this organization scope.",
    forbiddenTitle: "People administration not granted",
    forbiddenDescription: "This server session has no organization.manage permission for an active organization.",
    loadingTitle: "Loading people",
    loadingDescription: "Reading authorized memberships, profiles, and role assignments…",
    errorTitle: "People could not be loaded",
    errorDescription: "The authorized database read failed or returned an invalid membership contract.",
    retry: "Try again",
    profileRestricted: "Display name unavailable",
    profileRestrictedDescription: "The membership is removed or no longer appears in the active member-profile projection.",
    displayNameMissing: "Display name not provided",
    membership: "Membership",
    joined: "Joined",
    invited: "Invited",
    validUntil: "Valid until",
    noExpiry: "No expiry",
    profileLocale: "Profile language",
    roles: "Current scoped roles",
    noRoles: "No current organization-scoped role assignment",
    cohortScoped: "Cohort scope",
    organizationScoped: "Organization scope",
    openMemberDetails: "Open member details",
    membershipStates: { invited: "Invited", active: "Active", suspended: "Suspended", removed: "Removed" },
    profileStates: { draft: "Draft profile", active: "Active profile", inactive: "Inactive profile", archived: "Archived profile" },
    roleLabel: (code) => roleLabels.en[code] ?? code.replaceAll("_", " "),
    page: (current, total) => `Page ${current} of ${total}`,
    previousPage: "Previous page",
    nextPage: "Next page",
    readOnlyTitle: "Membership commands are not available",
    readOnlyDescription: "This directory never reads authentication accounts or email addresses. Invitations, removals, status changes, role grants, and impersonation remain disabled until their audited server commands are available.",
  },
  de: {
    title: "Personen und Rollenzuweisungen",
    description: "Organisationsmitgliedschaften, akteursbezogene Profilprojektionen und aktuelle organisationsbezogene Rollenzuweisungen prüfen.",
    count: (count) => `${count} ${count === 1 ? "Mitgliedschaft" : "Mitgliedschaften"}`,
    emptyTitle: "Keine Organisationsmitgliedschaften",
    emptyDescription: "In diesem Organisationsbereich ist keine Mitgliedschaft sichtbar.",
    forbiddenTitle: "Keine Personenadministration",
    forbiddenDescription: "Diese Serversitzung hat für keine aktive Organisation die Berechtigung organization.manage.",
    loadingTitle: "Personen werden geladen",
    loadingDescription: "Autorisierte Mitgliedschaften, Profile und Rollenzuweisungen werden gelesen…",
    errorTitle: "Personen konnten nicht geladen werden",
    errorDescription: "Der autorisierte Datenbankzugriff ist fehlgeschlagen oder lieferte einen ungültigen Mitgliedschaftsvertrag.",
    retry: "Erneut versuchen",
    profileRestricted: "Anzeigename nicht verfügbar",
    profileRestrictedDescription: "Die Mitgliedschaft wurde entfernt oder erscheint nicht mehr in der aktiven Mitgliederprofil-Projektion.",
    displayNameMissing: "Kein Anzeigename angegeben",
    membership: "Mitgliedschaft",
    joined: "Beigetreten",
    invited: "Eingeladen",
    validUntil: "Gültig bis",
    noExpiry: "Unbefristet",
    profileLocale: "Profilsprache",
    roles: "Aktuelle bereichsbezogene Rollen",
    noRoles: "Keine aktuelle organisationsbezogene Rollenzuweisung",
    cohortScoped: "Kohortenbereich",
    organizationScoped: "Organisationsbereich",
    openMemberDetails: "Mitgliedsdetails öffnen",
    membershipStates: { invited: "Eingeladen", active: "Aktiv", suspended: "Gesperrt", removed: "Entfernt" },
    profileStates: { draft: "Profilentwurf", active: "Aktives Profil", inactive: "Inaktives Profil", archived: "Archiviertes Profil" },
    roleLabel: (code) => roleLabels.de[code] ?? code.replaceAll("_", " "),
    page: (current, total) => `Seite ${current} von ${total}`,
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    readOnlyTitle: "Mitgliedschaftsbefehle sind nicht verfügbar",
    readOnlyDescription: "Dieses Verzeichnis liest keine Authentifizierungskonten oder E-Mail-Adressen. Einladungen, Entfernen, Statusänderungen, Rollenvergabe und Rollenansicht bleiben deaktiviert, bis auditierte Serverbefehle verfügbar sind.",
  },
  ru: {
    title: "Участники и назначения ролей",
    description: "Просмотр членства, профильных проекций в области текущего пользователя и назначений ролей в организации.",
    count: (count) => `Членств: ${count}`,
    emptyTitle: "Нет участников организации",
    emptyDescription: "В разрешённой области организации нет доступных членств.",
    forbiddenTitle: "Нет доступа к участникам",
    forbiddenDescription: "У серверной сессии нет разрешения organization.manage для активной организации.",
    loadingTitle: "Загрузка участников",
    loadingDescription: "Чтение разрешённых членств, профилей и назначений ролей…",
    errorTitle: "Не удалось загрузить участников",
    errorDescription: "Разрешённый запрос к базе завершился ошибкой или вернул неверный контракт членства.",
    retry: "Повторить",
    profileRestricted: "Отображаемое имя недоступно",
    profileRestrictedDescription: "Членство удалено либо больше не входит в активную проекцию профилей участников.",
    displayNameMissing: "Отображаемое имя не указано",
    membership: "Членство",
    joined: "Присоединился",
    invited: "Приглашён",
    validUntil: "Действует до",
    noExpiry: "Без срока",
    profileLocale: "Язык профиля",
    roles: "Текущие роли в области",
    noRoles: "Нет текущего назначения роли в организации",
    cohortScoped: "Область учебной группы",
    organizationScoped: "Область организации",
    openMemberDetails: "Открыть данные участника",
    membershipStates: { invited: "Приглашён", active: "Активен", suspended: "Приостановлен", removed: "Удалён" },
    profileStates: { draft: "Черновик профиля", active: "Активный профиль", inactive: "Неактивный профиль", archived: "Архивный профиль" },
    roleLabel: (code) => roleLabels.ru[code] ?? code.replaceAll("_", " "),
    page: (current, total) => `Страница ${current} из ${total}`,
    previousPage: "Предыдущая страница",
    nextPage: "Следующая страница",
    readOnlyTitle: "Команды управления участниками недоступны",
    readOnlyDescription: "Этот каталог не читает учётные записи аутентификации или адреса электронной почты. Приглашения, удаление, изменение статуса, выдача ролей и просмотр от имени пользователя отключены до появления аудируемых серверных команд.",
  },
};

export const adminSettingsCopy: Record<Locale, AdminSettingsCopy> = {
  en: {
    title: "Organization settings",
    description: "Inspect the active organization, effective product entitlements, and only the integration metadata this session may read.",
    forbiddenTitle: "Organization settings not granted",
    forbiddenDescription: "This server session has no organization.manage permission for an active organization.",
    loadingTitle: "Loading organization settings",
    loadingDescription: "Reading authorized organization, entitlement, and integration metadata…",
    errorTitle: "Organization settings could not be loaded",
    errorDescription: "The authorized database read failed or returned an invalid settings contract.",
    retry: "Try again",
    organization: "Organization",
    slug: "Workspace slug",
    status: "Status",
    region: "Data residency region",
    regionNotSet: "Not configured",
    updated: "Updated",
    entitlements: "Product entitlements",
    entitlementsDescription: "Effective capability records; user-scoped records are identified without exposing account identifiers.",
    noEntitlements: "No entitlement is visible for this organization.",
    package: "Package",
    packageUnavailable: "Package details unavailable",
    capability: "Capability",
    scope: "Scope",
    validFrom: "Valid from",
    validUntil: "Valid until",
    noExpiry: "No expiry",
    source: "Source",
    integrations: "Integration connections",
    integrationsDescription: "Provider, display name, lifecycle state, and update time only. Secret references and configuration payloads are never selected.",
    noIntegrations: "No integration connection is visible for this organization.",
    integrationPermissionTitle: "Integration metadata not granted",
    integrationPermissionDescription: "The organization is visible, but this session lacks integration.replay. No integration table query was performed.",
    provider: "Provider",
    limitNotice: (visible, total) => `Showing ${visible} of ${total} records.`,
    organizationStates: { active: "Active", suspended: "Suspended", archived: "Archived" },
    packageStates: { draft: "Draft", active: "Active", inactive: "Inactive", archived: "Archived" },
    integrationStates: { draft: "Draft", active: "Active", inactive: "Inactive", archived: "Archived" },
    scopes: { organization: "Organization-wide", user: "Individual member" },
    sources: { manual: "Manual", contract: "Contract", promotion: "Promotion", migration: "Migration" },
    providerLabel: (provider) => provider === "xapi" ? "xAPI" : provider === "cmi5" ? "cmi5" : provider === "oidc" ? "OIDC" : provider === "lti" ? "LTI" : provider === "eloomi" ? "Eloomi" : "Webhook",
    readOnlyTitle: "Configuration changes are unavailable",
    readOnlyDescription: "Organization, entitlement, package, SSO, and integration mutations remain disabled until their tenant-scoped audited commands and provider contracts are implemented.",
  },
  de: {
    title: "Organisationseinstellungen",
    description: "Aktive Organisation, wirksame Produktberechtigungen und nur die Integrationsmetadaten prüfen, die diese Sitzung lesen darf.",
    forbiddenTitle: "Keine Organisationseinstellungen",
    forbiddenDescription: "Diese Serversitzung hat für keine aktive Organisation die Berechtigung organization.manage.",
    loadingTitle: "Organisationseinstellungen werden geladen",
    loadingDescription: "Autorisierte Organisations-, Berechtigungs- und Integrationsmetadaten werden gelesen…",
    errorTitle: "Organisationseinstellungen konnten nicht geladen werden",
    errorDescription: "Der autorisierte Datenbankzugriff ist fehlgeschlagen oder lieferte einen ungültigen Einstellungsvertrag.",
    retry: "Erneut versuchen",
    organization: "Organisation",
    slug: "Arbeitsbereich-Slug",
    status: "Status",
    region: "Datenresidenzregion",
    regionNotSet: "Nicht konfiguriert",
    updated: "Aktualisiert",
    entitlements: "Produktberechtigungen",
    entitlementsDescription: "Wirksame Funktionsberechtigungen; personenbezogene Einträge werden ohne Konto-IDs gekennzeichnet.",
    noEntitlements: "Für diese Organisation ist keine Berechtigung sichtbar.",
    package: "Paket",
    packageUnavailable: "Paketdetails nicht verfügbar",
    capability: "Funktion",
    scope: "Bereich",
    validFrom: "Gültig ab",
    validUntil: "Gültig bis",
    noExpiry: "Unbefristet",
    source: "Quelle",
    integrations: "Integrationsverbindungen",
    integrationsDescription: "Nur Anbieter, Anzeigename, Lebenszyklusstatus und Aktualisierungszeit. Secret-Referenzen und Konfigurationswerte werden nie ausgewählt.",
    noIntegrations: "Für diese Organisation ist keine Integrationsverbindung sichtbar.",
    integrationPermissionTitle: "Keine Integrationsmetadaten",
    integrationPermissionDescription: "Die Organisation ist sichtbar, aber dieser Sitzung fehlt integration.replay. Die Integrationstabelle wurde nicht abgefragt.",
    provider: "Anbieter",
    limitNotice: (visible, total) => `${visible} von ${total} Einträgen werden angezeigt.`,
    organizationStates: { active: "Aktiv", suspended: "Gesperrt", archived: "Archiviert" },
    packageStates: { draft: "Entwurf", active: "Aktiv", inactive: "Inaktiv", archived: "Archiviert" },
    integrationStates: { draft: "Entwurf", active: "Aktiv", inactive: "Inaktiv", archived: "Archiviert" },
    scopes: { organization: "Organisationsweit", user: "Einzelnes Mitglied" },
    sources: { manual: "Manuell", contract: "Vertrag", promotion: "Aktion", migration: "Migration" },
    providerLabel: (provider) => provider === "xapi" ? "xAPI" : provider === "cmi5" ? "cmi5" : provider === "oidc" ? "OIDC" : provider === "lti" ? "LTI" : provider === "eloomi" ? "Eloomi" : "Webhook",
    readOnlyTitle: "Konfigurationsänderungen sind nicht verfügbar",
    readOnlyDescription: "Änderungen an Organisation, Berechtigungen, Paketen, SSO und Integrationen bleiben deaktiviert, bis mandantenbezogene auditierte Befehle und Anbieter-Verträge implementiert sind.",
  },
  ru: {
    title: "Настройки организации",
    description: "Просмотр активной организации, действующих продуктовых прав и только доступных этой сессии метаданных интеграций.",
    forbiddenTitle: "Нет доступа к настройкам организации",
    forbiddenDescription: "У серверной сессии нет разрешения organization.manage для активной организации.",
    loadingTitle: "Загрузка настроек организации",
    loadingDescription: "Чтение разрешённых метаданных организации, прав и интеграций…",
    errorTitle: "Не удалось загрузить настройки организации",
    errorDescription: "Разрешённый запрос к базе завершился ошибкой или вернул неверный контракт настроек.",
    retry: "Повторить",
    organization: "Организация",
    slug: "Идентификатор пространства",
    status: "Статус",
    region: "Регион хранения данных",
    regionNotSet: "Не настроен",
    updated: "Обновлено",
    entitlements: "Права продукта",
    entitlementsDescription: "Действующие записи возможностей; индивидуальные записи отмечаются без раскрытия идентификаторов учётных записей.",
    noEntitlements: "Для этой организации не видно продуктовых прав.",
    package: "Пакет",
    packageUnavailable: "Данные пакета недоступны",
    capability: "Возможность",
    scope: "Область",
    validFrom: "Действует с",
    validUntil: "Действует до",
    noExpiry: "Без срока",
    source: "Источник",
    integrations: "Интеграционные подключения",
    integrationsDescription: "Только поставщик, название, состояние и время обновления. Ссылки на секреты и значения конфигурации никогда не запрашиваются.",
    noIntegrations: "Для этой организации не видно интеграционных подключений.",
    integrationPermissionTitle: "Нет доступа к метаданным интеграций",
    integrationPermissionDescription: "Организация доступна, но у сессии нет integration.replay. Таблица интеграций не запрашивалась.",
    provider: "Поставщик",
    limitNotice: (visible, total) => `Показано ${visible} из ${total} записей.`,
    organizationStates: { active: "Активна", suspended: "Приостановлена", archived: "В архиве" },
    packageStates: { draft: "Черновик", active: "Активен", inactive: "Неактивен", archived: "В архиве" },
    integrationStates: { draft: "Черновик", active: "Активно", inactive: "Неактивно", archived: "В архиве" },
    scopes: { organization: "Вся организация", user: "Отдельный участник" },
    sources: { manual: "Вручную", contract: "Контракт", promotion: "Акция", migration: "Миграция" },
    providerLabel: (provider) => provider === "xapi" ? "xAPI" : provider === "cmi5" ? "cmi5" : provider === "oidc" ? "OIDC" : provider === "lti" ? "LTI" : provider === "eloomi" ? "Eloomi" : "Webhook",
    readOnlyTitle: "Изменение конфигурации недоступно",
    readOnlyDescription: "Изменения организации, прав, пакетов, SSO и интеграций отключены до реализации аудируемых команд с изоляцией арендаторов и контрактов поставщиков.",
  },
};
