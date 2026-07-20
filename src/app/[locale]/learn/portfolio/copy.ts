import type { LearnerPortfolioRecordLabels } from "@/features/portfolio/components/learner-portfolio-record";
import type { Locale } from "@/shared/i18n/config";

export type LearnerPortfolioPageCopy = LearnerPortfolioRecordLabels & {
  loadingTitle: string;
  loadingDescription: string;
  errorTitle: string;
  errorDescription: string;
  retry: string;
};

export const learnerPortfolioCopy: Record<Locale, LearnerPortfolioPageCopy> = {
  en: {
    title: "My evidence portfolio",
    description:
      "A learner-owned record of practical testing evidence and independent verification.",
    portfolioMissingTitle: "No portfolio record yet",
    portfolioMissingDescription:
      "A portfolio has not been created for this learner account.",
    evidenceHeading: "Portfolio evidence",
    evidenceCount: "Evidence items",
    verifiedCount: "Verified",
    emptyEvidenceTitle: "No evidence selected",
    emptyEvidenceDescription:
      "Your portfolio exists, but it does not contain evidence items yet.",
    visibility: {
      private: "Private",
      organization: "Organization",
      public: "Public",
    },
    verification: {
      verified: "Verified evidence",
      recorded: "Recorded evidence",
      unavailable: "Details unavailable",
    },
    evidenceKinds: {
      submission: "Submission",
      lab: "Lab evidence",
      upload: "Uploaded evidence",
      review: "Trainer review",
      placement: "Placement assessment",
      external: "External evidence",
    },
    evidenceDetailsUnavailable: "Evidence details are not available",
    reflection: "Reflection",
    captured: "Captured",
    updated: "Portfolio updated",
    loadingTitle: "Loading portfolio",
    loadingDescription: "Your evidence portfolio is being loaded.",
    errorTitle: "Portfolio could not be loaded",
    errorDescription:
      "The portfolio record is temporarily unavailable. Try the secure read again.",
    retry: "Try again",
  },
  de: {
    title: "Mein Nachweisportfolio",
    description:
      "Ein von Lernenden geführter Nachweis praktischer Testarbeit und unabhängiger Verifizierung.",
    portfolioMissingTitle: "Noch kein Portfolioeintrag",
    portfolioMissingDescription:
      "Für dieses Lernendenkonto wurde noch kein Portfolio erstellt.",
    evidenceHeading: "Portfolionachweise",
    evidenceCount: "Nachweise",
    verifiedCount: "Verifiziert",
    emptyEvidenceTitle: "Keine Nachweise ausgewählt",
    emptyEvidenceDescription:
      "Dein Portfolio existiert, enthält aber noch keine Nachweise.",
    visibility: {
      private: "Privat",
      organization: "Organisation",
      public: "Öffentlich",
    },
    verification: {
      verified: "Verifizierter Nachweis",
      recorded: "Erfasster Nachweis",
      unavailable: "Details nicht verfügbar",
    },
    evidenceKinds: {
      submission: "Einreichung",
      lab: "Labornachweis",
      upload: "Hochgeladener Nachweis",
      review: "Trainerbewertung",
      placement: "Einstufung",
      external: "Externer Nachweis",
    },
    evidenceDetailsUnavailable: "Nachweisdetails sind nicht verfügbar",
    reflection: "Reflexion",
    captured: "Erfasst",
    updated: "Portfolio aktualisiert",
    loadingTitle: "Portfolio wird geladen",
    loadingDescription: "Dein Nachweisportfolio wird geladen.",
    errorTitle: "Portfolio konnte nicht geladen werden",
    errorDescription:
      "Der Portfolioeintrag ist vorübergehend nicht verfügbar. Versuche den sicheren Abruf erneut.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "Моё портфолио доказательств",
    description:
      "Управляемая учащимся запись практических доказательств тестирования и независимой проверки.",
    portfolioMissingTitle: "Портфолио ещё не создано",
    portfolioMissingDescription:
      "Для этой учётной записи учащегося портфолио ещё не создано.",
    evidenceHeading: "Доказательства в портфолио",
    evidenceCount: "Доказательства",
    verifiedCount: "Проверено",
    emptyEvidenceTitle: "Доказательства не выбраны",
    emptyEvidenceDescription:
      "Портфолио существует, но в нём пока нет доказательств.",
    visibility: {
      private: "Личное",
      organization: "Для организации",
      public: "Публичное",
    },
    verification: {
      verified: "Проверенное доказательство",
      recorded: "Сохранённое доказательство",
      unavailable: "Сведения недоступны",
    },
    evidenceKinds: {
      submission: "Отправленная работа",
      lab: "Лабораторное доказательство",
      upload: "Загруженное доказательство",
      review: "Проверка тренера",
      placement: "Входная оценка",
      external: "Внешнее доказательство",
    },
    evidenceDetailsUnavailable: "Сведения о доказательстве недоступны",
    reflection: "Рефлексия",
    captured: "Зафиксировано",
    updated: "Портфолио обновлено",
    loadingTitle: "Загрузка портфолио",
    loadingDescription: "Загружается ваше портфолио доказательств.",
    errorTitle: "Не удалось загрузить портфолио",
    errorDescription:
      "Запись портфолио временно недоступна. Повторите защищённый запрос.",
    retry: "Повторить",
  },
};
