import type { Locale } from "@/shared/i18n/config";

type OrganizationWorkspaceCopy = {
  breadcrumb: string;
  status: string;
  title: string;
  summary: string;
  blockedTitle: string;
  blockedDescription: string;
};

export const organizationWorkspaceCopy: Record<
  Locale,
  OrganizationWorkspaceCopy
> = {
  en: {
    breadcrumb: "Organization administration",
    status: "Unavailable",
    title: "Organization administration",
    summary: "This workspace is intentionally limited to a safe status page.",
    blockedTitle: "Tenant-scoped administration is blocked",
    blockedDescription:
      "Organization administration remains unavailable until the tenant-scope database migration is applied and automated isolation tests have verified it.",
  },
  de: {
    breadcrumb: "Organisationsverwaltung",
    status: "Nicht verfügbar",
    title: "Organisationsverwaltung",
    summary:
      "Dieser Arbeitsbereich ist bewusst auf eine sichere Statusseite beschränkt.",
    blockedTitle: "Mandantenbezogene Verwaltung ist gesperrt",
    blockedDescription:
      "Die Organisationsverwaltung bleibt nicht verfügbar, bis die Datenbankmigration für den Mandantenbereich angewendet und die Mandantenisolierung durch automatisierte Tests verifiziert wurde.",
  },
  ru: {
    breadcrumb: "Администрирование организации",
    status: "Недоступно",
    title: "Администрирование организации",
    summary:
      "Этот рабочий раздел намеренно ограничен безопасной страницей состояния.",
    blockedTitle: "Управление данными организации заблокировано",
    blockedDescription:
      "Администрирование организации останется недоступным, пока не будет применена миграция базы данных для области организации и автоматизированные тесты не подтвердят изоляцию данных.",
  },
};
