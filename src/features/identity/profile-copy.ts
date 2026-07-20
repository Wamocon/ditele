import type { Locale } from "@/shared/i18n/config";

export type LearnerProfileCopy = {
  readonly title: string;
  readonly description: string;
  readonly formTitle: string;
  readonly displayName: string;
  readonly displayNameDescription: string;
  readonly locale: string;
  readonly localeDescription: string;
  readonly localeOptions: Readonly<Record<Locale, string>>;
  readonly timezone: string;
  readonly timezoneDescription: string;
  readonly updated: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly savedDescription: string;
  readonly invalidInput: string;
  readonly invalidDisplayName: string;
  readonly invalidLocale: string;
  readonly invalidTimezone: string;
  readonly sessionExpired: string;
  readonly forbidden: string;
  readonly conflict: string;
  readonly failed: string;
  readonly loadingTitle: string;
  readonly loadingDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
};

export const learnerProfileCopy: Record<Locale, LearnerProfileCopy> = {
  en: {
    title: "Profile",
    description:
      "Keep the name, language, and time zone used throughout your learning workspace up to date.",
    formTitle: "Account preferences",
    displayName: "Display name",
    displayNameDescription: "Shown to your trainers and in your learning records.",
    locale: "Preferred language",
    localeDescription: "Used as your default content and interface language.",
    localeOptions: { en: "English", de: "German", ru: "Russian" },
    timezone: "Time zone",
    timezoneDescription:
      "Enter an IANA time zone such as Europe/Berlin. Dates remain stored in UTC.",
    updated: "Last updated",
    save: "Save profile",
    saving: "Saving…",
    saved: "Profile saved",
    savedDescription: "Your account preferences are now up to date.",
    invalidInput: "Check the highlighted profile values.",
    invalidDisplayName: "Enter a display name between 1 and 160 characters.",
    invalidLocale: "Choose English, German, or Russian.",
    invalidTimezone: "Enter a valid IANA time zone, for example Europe/Berlin.",
    sessionExpired: "Your session expired. Sign in again before saving.",
    forbidden: "This account is not allowed to update this profile.",
    conflict: "The profile changed in another session. Reload before saving again.",
    failed: "The profile could not be saved. Try again.",
    loadingTitle: "Loading profile",
    loadingDescription: "Your account preferences are being loaded.",
    errorTitle: "Profile could not be loaded",
    errorDescription: "The secure profile record is temporarily unavailable.",
    retry: "Try again",
  },
  de: {
    title: "Profil",
    description:
      "Halte Namen, Sprache und Zeitzone für deinen Lernbereich aktuell.",
    formTitle: "Kontoeinstellungen",
    displayName: "Anzeigename",
    displayNameDescription: "Wird Trainern und in deinen Lernnachweisen angezeigt.",
    locale: "Bevorzugte Sprache",
    localeDescription: "Wird als Standardsprache für Inhalte und Oberfläche genutzt.",
    localeOptions: { en: "Englisch", de: "Deutsch", ru: "Russisch" },
    timezone: "Zeitzone",
    timezoneDescription:
      "Gib eine IANA-Zeitzone wie Europe/Berlin ein. Zeiten bleiben in UTC gespeichert.",
    updated: "Zuletzt aktualisiert",
    save: "Profil speichern",
    saving: "Wird gespeichert…",
    saved: "Profil gespeichert",
    savedDescription: "Deine Kontoeinstellungen sind jetzt aktuell.",
    invalidInput: "Prüfe die markierten Profilwerte.",
    invalidDisplayName: "Gib einen Anzeigenamen mit 1 bis 160 Zeichen ein.",
    invalidLocale: "Wähle Englisch, Deutsch oder Russisch.",
    invalidTimezone: "Gib eine gültige IANA-Zeitzone ein, zum Beispiel Europe/Berlin.",
    sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich vor dem Speichern erneut an.",
    forbidden: "Dieses Konto darf das Profil nicht aktualisieren.",
    conflict: "Das Profil wurde in einer anderen Sitzung geändert. Lade es vor dem Speichern neu.",
    failed: "Das Profil konnte nicht gespeichert werden. Versuche es erneut.",
    loadingTitle: "Profil wird geladen",
    loadingDescription: "Deine Kontoeinstellungen werden geladen.",
    errorTitle: "Profil konnte nicht geladen werden",
    errorDescription: "Der geschützte Profildatensatz ist vorübergehend nicht verfügbar.",
    retry: "Erneut versuchen",
  },
  ru: {
    title: "Профиль",
    description:
      "Поддерживайте в актуальном состоянии имя, язык и часовой пояс учебного пространства.",
    formTitle: "Настройки учётной записи",
    displayName: "Отображаемое имя",
    displayNameDescription: "Его видят тренеры, оно используется в учебных записях.",
    locale: "Предпочитаемый язык",
    localeDescription: "Используется как язык интерфейса и содержимого по умолчанию.",
    localeOptions: { en: "Английский", de: "Немецкий", ru: "Русский" },
    timezone: "Часовой пояс",
    timezoneDescription:
      "Укажите часовой пояс IANA, например Europe/Berlin. Время хранится в UTC.",
    updated: "Последнее обновление",
    save: "Сохранить профиль",
    saving: "Сохранение…",
    saved: "Профиль сохранён",
    savedDescription: "Настройки учётной записи обновлены.",
    invalidInput: "Проверьте выделенные значения профиля.",
    invalidDisplayName: "Введите отображаемое имя длиной от 1 до 160 символов.",
    invalidLocale: "Выберите английский, немецкий или русский язык.",
    invalidTimezone: "Укажите действительный часовой пояс IANA, например Europe/Berlin.",
    sessionExpired: "Сеанс истёк. Войдите снова перед сохранением.",
    forbidden: "Этой учётной записи нельзя изменять профиль.",
    conflict: "Профиль изменён в другом сеансе. Перезагрузите страницу перед сохранением.",
    failed: "Не удалось сохранить профиль. Повторите попытку.",
    loadingTitle: "Загрузка профиля",
    loadingDescription: "Загружаются настройки вашей учётной записи.",
    errorTitle: "Не удалось загрузить профиль",
    errorDescription: "Защищённая запись профиля временно недоступна.",
    retry: "Повторить",
  },
};
