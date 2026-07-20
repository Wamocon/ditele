import type { LearnerCertificateListLabels } from "@/features/certification/components/learner-certificate-list";
import type { Locale } from "@/shared/i18n/config";

export type LearnerCertificatesPageCopy = LearnerCertificateListLabels & {
  loadingTitle: string;
  loadingDescription: string;
  errorTitle: string;
  errorDescription: string;
  retry: string;
};

export const learnerCertificatesCopy: Record<Locale, LearnerCertificatesPageCopy> = {
  en: {
    title: "Certificates",
    description:
      "Review certificate eligibility, issuance, availability, and revocation states recorded for your account.",
    emptyTitle: "No certificate records",
    emptyDescription:
      "No certificate eligibility or issued certificate is recorded for your account yet.",
    states: {
      eligible: "Eligible",
      issued: "Issued",
      available: "Available",
      revoked: "Revoked",
      expired: "Expired",
    },
    stateDescriptions: {
      eligible: "Eligibility is recorded; this certificate has not been issued.",
      issued: "The certificate is issued and is awaiting controlled availability.",
      available: "The certificate is issued and marked as available.",
      revoked: "This certificate is no longer valid.",
      expired: "This certificate has reached its recorded expiry date.",
    },
    types: {
      course_completion: "Course completion certificate",
      exam: "Assessment certificate",
      competency: "Competency certificate",
    },
    issued: "Issued",
    recorded: "Recorded",
    available: "Available since",
    expires: "Expires",
    revoked: "Revoked",
    downloadUnavailable:
      "A controlled certificate download endpoint is not available in this release.",
    loadingTitle: "Loading certificates",
    loadingDescription: "Your certificate records are being loaded.",
    errorTitle: "Certificates could not be loaded",
    errorDescription:
      "Certificate records are temporarily unavailable. Try the secure read again.",
    retry: "Try again",
  },
  de: {
    title: "Zertifikate",
    description:
      "Prüfe die für dein Konto erfassten Status zu Berechtigung, Ausstellung, Verfügbarkeit und Widerruf.",
    emptyTitle: "Keine Zertifikatseinträge",
    emptyDescription:
      "Für dein Konto ist noch keine Zertifikatsberechtigung oder Ausstellung erfasst.",
    states: {
      eligible: "Berechtigt",
      issued: "Ausgestellt",
      available: "Verfügbar",
      revoked: "Widerrufen",
      expired: "Abgelaufen",
    },
    stateDescriptions: {
      eligible: "Die Berechtigung ist erfasst; das Zertifikat wurde noch nicht ausgestellt.",
      issued: "Das Zertifikat ist ausgestellt und wartet auf kontrollierte Bereitstellung.",
      available: "Das Zertifikat ist ausgestellt und als verfügbar markiert.",
      revoked: "Dieses Zertifikat ist nicht mehr gültig.",
      expired: "Dieses Zertifikat hat sein erfasstes Ablaufdatum erreicht.",
    },
    types: {
      course_completion: "Kursabschlusszertifikat",
      exam: "Prüfungszertifikat",
      competency: "Kompetenzzertifikat",
    },
    issued: "Ausgestellt",
    recorded: "Erfasst",
    available: "Verfügbar seit",
    expires: "Läuft ab",
    revoked: "Widerrufen",
    downloadUnavailable:
      "Ein kontrollierter Zertifikatsdownload ist in dieser Version nicht verfügbar.",
    loadingTitle: "Zertifikate werden geladen",
    loadingDescription: "Deine Zertifikatseinträge werden geladen.",
    errorTitle: "Zertifikate konnten nicht geladen werden",
    errorDescription:
      "Zertifikatseinträge sind vorübergehend nicht verfügbar. Versuche den sicheren Abruf erneut.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "Сертификаты",
    description:
      "Просматривайте записанные для вашей учётной записи статусы допуска, выпуска, доступности и отзыва сертификатов.",
    emptyTitle: "Нет записей о сертификатах",
    emptyDescription:
      "Для вашей учётной записи ещё не зафиксирован допуск или выпущенный сертификат.",
    states: {
      eligible: "Допущен",
      issued: "Выпущен",
      available: "Доступен",
      revoked: "Отозван",
      expired: "Истёк",
    },
    stateDescriptions: {
      eligible: "Допуск зафиксирован; сертификат ещё не выпущен.",
      issued: "Сертификат выпущен и ожидает контролируемой публикации.",
      available: "Сертификат выпущен и отмечен как доступный.",
      revoked: "Этот сертификат больше недействителен.",
      expired: "Наступила зафиксированная дата окончания действия сертификата.",
    },
    types: {
      course_completion: "Сертификат о завершении курса",
      exam: "Экзаменационный сертификат",
      competency: "Сертификат компетенции",
    },
    issued: "Выпущен",
    recorded: "Зафиксирован",
    available: "Доступен с",
    expires: "Действует до",
    revoked: "Отозван",
    downloadUnavailable:
      "Контролируемая загрузка сертификата в этой версии недоступна.",
    loadingTitle: "Загрузка сертификатов",
    loadingDescription: "Загружаются ваши записи о сертификатах.",
    errorTitle: "Не удалось загрузить сертификаты",
    errorDescription:
      "Записи о сертификатах временно недоступны. Повторите защищённый запрос.",
    retry: "Повторить",
  },
};
