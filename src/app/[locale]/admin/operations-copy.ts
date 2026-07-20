import type { OperationsOverviewLabels } from "@/features/administration/components/operations-overview";
import type { Locale } from "@/shared/i18n/config";

export const operationsCopy: Record<Locale, OperationsOverviewLabels> = {
  en: {
    title: "Administration overview",
    applications: "Enrollment applications",
    issues: "Support issues",
    exports: "Exports",
    emptyTitle: "No operational work",
    emptyDescription: "Applications, issues, and export jobs will appear here.",
    applicationStates: { pending: "Pending", accepted: "Accepted", rejected: "Rejected" },
    issueStates: { open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed" },
    exportStates: { queued: "Queued", running: "Running", ready: "Ready", failed: "Failed", expired: "Expired" },
  },
  de: {
    title: "Administrationsübersicht",
    applications: "Kursanfragen",
    issues: "Supportfälle",
    exports: "Exporte",
    emptyTitle: "Keine operativen Aufgaben",
    emptyDescription: "Anfragen, Supportfälle und Exporte erscheinen hier.",
    applicationStates: { pending: "Offen", accepted: "Angenommen", rejected: "Abgelehnt" },
    issueStates: { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst", closed: "Geschlossen" },
    exportStates: { queued: "Eingereiht", running: "Läuft", ready: "Bereit", failed: "Fehlgeschlagen", expired: "Abgelaufen" },
  },
  ru: {
    title: "Обзор администрирования",
    applications: "Заявки на обучение",
    issues: "Обращения поддержки",
    exports: "Экспорты",
    emptyTitle: "Нет оперативных задач",
    emptyDescription: "Заявки, обращения и экспорты появятся здесь.",
    applicationStates: { pending: "Ожидает", accepted: "Принято", rejected: "Отклонено" },
    issueStates: { open: "Открыто", in_progress: "В работе", resolved: "Решено", closed: "Закрыто" },
    exportStates: { queued: "В очереди", running: "Выполняется", ready: "Готово", failed: "Ошибка", expired: "Истекло" },
  },
};
