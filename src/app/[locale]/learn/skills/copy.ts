import type { LearnerSkillsOverviewLabels } from "@/features/skills/components/learner-skills-overview";
import type { Locale } from "@/shared/i18n/config";

export type LearnerSkillsPageCopy = LearnerSkillsOverviewLabels & {
  loadingTitle: string;
  loadingDescription: string;
  errorTitle: string;
  errorDescription: string;
  retry: string;
};

export const learnerSkillsCopy: Record<Locale, LearnerSkillsPageCopy> = {
  en: {
    title: "Skills and mastery",
    description:
      "See the active testing skills in your organization and mastery recorded from reviewed work.",
    activeSkills: "Active skills",
    masteryRecords: "Mastery records",
    emptyTitle: "No active skills",
    emptyDescription:
      "No active skill definitions are currently available for your organization.",
    descriptionUnavailable: "No localized description is available.",
    masteryRecorded: "Mastery recorded",
    masteryNotRecorded: "No mastery recorded",
    masteryScore: "Recorded mastery",
    updated: "Updated",
    taxonomyVersion: "Taxonomy version",
    prerequisites: "Prerequisites",
    prerequisitesUnavailable:
      "Prerequisite relationships are not available in this learner view.",
    noVisiblePrerequisites: "No visible prerequisites are recorded.",
    loadingTitle: "Loading skills",
    loadingDescription: "Your skill and mastery records are being loaded.",
    errorTitle: "Skills could not be loaded",
    errorDescription:
      "The skill records are temporarily unavailable. Try the secure read again.",
    retry: "Try again",
  },
  de: {
    title: "Kompetenzen und Beherrschung",
    description:
      "Sieh die aktiven Testkompetenzen deiner Organisation und die aus geprüften Arbeiten erfasste Beherrschung.",
    activeSkills: "Aktive Kompetenzen",
    masteryRecords: "Beherrschungsnachweise",
    emptyTitle: "Keine aktiven Kompetenzen",
    emptyDescription:
      "Für deine Organisation sind derzeit keine aktiven Kompetenzdefinitionen verfügbar.",
    descriptionUnavailable: "Keine lokalisierte Beschreibung verfügbar.",
    masteryRecorded: "Beherrschung erfasst",
    masteryNotRecorded: "Keine Beherrschung erfasst",
    masteryScore: "Erfasste Beherrschung",
    updated: "Aktualisiert",
    taxonomyVersion: "Taxonomieversion",
    prerequisites: "Voraussetzungen",
    prerequisitesUnavailable:
      "Voraussetzungsbeziehungen sind in dieser Lernendenansicht nicht verfügbar.",
    noVisiblePrerequisites: "Keine sichtbaren Voraussetzungen erfasst.",
    loadingTitle: "Kompetenzen werden geladen",
    loadingDescription:
      "Deine Kompetenz- und Beherrschungsnachweise werden geladen.",
    errorTitle: "Kompetenzen konnten nicht geladen werden",
    errorDescription:
      "Die Kompetenznachweise sind vorübergehend nicht verfügbar. Versuche den sicheren Abruf erneut.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "Навыки и освоение",
    description:
      "Просматривайте активные навыки тестирования вашей организации и уровень освоения, подтверждённый проверенными работами.",
    activeSkills: "Активные навыки",
    masteryRecords: "Записи об освоении",
    emptyTitle: "Нет активных навыков",
    emptyDescription:
      "Для вашей организации сейчас нет доступных активных определений навыков.",
    descriptionUnavailable: "Локализованное описание недоступно.",
    masteryRecorded: "Освоение зафиксировано",
    masteryNotRecorded: "Освоение не зафиксировано",
    masteryScore: "Зафиксированное освоение",
    updated: "Обновлено",
    taxonomyVersion: "Версия таксономии",
    prerequisites: "Предварительные навыки",
    prerequisitesUnavailable:
      "Связи предварительных навыков недоступны в представлении учащегося.",
    noVisiblePrerequisites: "Видимые предварительные навыки не зафиксированы.",
    loadingTitle: "Загрузка навыков",
    loadingDescription: "Загружаются ваши навыки и записи об освоении.",
    errorTitle: "Не удалось загрузить навыки",
    errorDescription:
      "Записи о навыках временно недоступны. Повторите защищённый запрос.",
    retry: "Повторить",
  },
};
