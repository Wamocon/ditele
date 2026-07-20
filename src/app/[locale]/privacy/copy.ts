import type { Locale } from "@/shared/i18n/config";

type PrivacyCopy = {
  readonly title: string;
  readonly intro: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly body: string;
  }[];
};

export const privacyCopy: Readonly<Record<Locale, PrivacyCopy>> = {
  en: {
    title: "Privacy and learning data",
    intro:
      "DiTeLe processes only the information required to operate learning, review, evidence, security, and support workflows.",
    sections: [
      {
        heading: "What this development version stores",
        body: "Local development data includes account profiles, course activity, drafts, submissions, evidence metadata, trainer decisions, questions, notifications, consent records, and security audit events.",
      },
      {
        heading: "Your rights and current access",
        body: "Rights to access, correction, export, and deletion remain available through the data-protection owner, but this development build does not yet provide in-product self-service request or consent-history workflows. Automated requests and production retention rules remain disabled until identity checks, legal exceptions, and retention periods are approved.",
      },
      {
        heading: "AI and integrations",
        body: "Provider-backed AI and external LMS integrations are disabled until their contracts, safeguards, data ownership, and processing terms are approved. Privileged credentials are never sent to the browser.",
      },
    ],
  },
  de: {
    title: "Datenschutz und Lerndaten",
    intro:
      "DiTeLe verarbeitet nur Informationen, die für Lernen, Review, Evidenz, Sicherheit und Support erforderlich sind.",
    sections: [
      {
        heading: "Daten dieser Entwicklungsversion",
        body: "Lokale Entwicklungsdaten umfassen Kontoprofile, Kursaktivität, Entwürfe, Abgaben, Evidenzmetadaten, Trainerentscheidungen, Fragen, Benachrichtigungen, Einwilligungen und Sicherheits-Auditereignisse.",
      },
      {
        heading: "Deine Rechte und der aktuelle Zugang",
        body: "Rechte auf Auskunft, Korrektur, Export und Löschung können über den Datenschutzverantwortlichen wahrgenommen werden. Diese Entwicklungsversion bietet jedoch noch keine Self-Service-Anträge oder Einwilligungshistorie im Produkt. Automatisierte Anträge und produktive Aufbewahrungsregeln bleiben deaktiviert, bis Identitätsprüfung, rechtliche Ausnahmen und Fristen freigegeben sind.",
      },
      {
        heading: "KI und Integrationen",
        body: "Provider-gestützte KI und externe LMS-Integrationen bleiben deaktiviert, bis Verträge, Schutzmaßnahmen, Daten-Ownership und Verarbeitungsbedingungen freigegeben sind. Privilegierte Zugangsdaten gelangen nie in den Browser.",
      },
    ],
  },
  ru: {
    title: "Конфиденциальность и учебные данные",
    intro:
      "DiTeLe обрабатывает только данные, необходимые для обучения, проверки, доказательств, безопасности и поддержки.",
    sections: [
      {
        heading: "Данные этой версии разработки",
        body: "Локальные данные включают профили, активность курса, черновики, работы, метаданные доказательств, решения тренеров, вопросы, уведомления, согласия и события аудита безопасности.",
      },
      {
        heading: "Ваши права и текущий доступ",
        body: "Права на доступ, исправление, экспорт и удаление можно реализовать через ответственного за защиту данных, однако в этой версии разработки ещё нет встроенных самостоятельных запросов и истории согласий. Автоматизация и производственные сроки хранения отключены до утверждения проверки личности, юридических исключений и сроков.",
      },
      {
        heading: "ИИ и интеграции",
        body: "ИИ внешних поставщиков и интеграции LMS отключены до утверждения договоров, мер защиты, владельцев данных и условий обработки. Привилегированные ключи никогда не отправляются в браузер.",
      },
    ],
  },
};
