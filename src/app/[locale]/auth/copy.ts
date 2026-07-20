import type { Locale } from "@/shared/i18n/config";

type AuthCopy = {
  loginLead: string;
  registerLead: string;
  resetLead: string;
  updateTitle: string;
  updateLead: string;
  newPassword: string;
  updateAction: string;
  noAccount: string;
  hasAccount: string;
  createAccount: string;
  backToLogin: string;
  invalid: string;
  throttled: string;
  unavailable: string;
  checkEmail: string;
  resetSent: string;
  passwordUpdated: string;
  passwordHelp: string;
};

export const authCopy: Record<Locale, AuthCopy> = {
  en: {
    loginLead: "Continue your learning, reviews, or administration work.",
    registerLead: "Create a secure account to request a course and join a learning path.",
    resetLead: "We will send a recovery link if an account exists for this address.",
    updateTitle: "Choose a new password",
    updateLead: "Use a unique password that you do not use on another service.",
    newPassword: "New password",
    updateAction: "Update password",
    noAccount: "New to DiTeLe?",
    hasAccount: "Already have an account?",
    createAccount: "Create account",
    backToLogin: "Back to sign in",
    invalid: "Check the entered information and try again.",
    throttled: "We cannot process another request right now. Wait and try again.",
    unavailable: "Sign-in is temporarily unavailable. Wait a moment and try again.",
    checkEmail: "Check your email to confirm your account.",
    resetSent: "If the account exists, a reset link has been sent.",
    passwordUpdated: "Your password was updated. Sign in to continue.",
    passwordHelp:
      "At least 12 characters with uppercase, lowercase, a number, and a symbol.",
  },
  de: {
    loginLead: "Setze dein Lernen, deine Reviews oder deine Administration fort.",
    registerLead: "Erstelle ein sicheres Konto, um einen Kurs anzufragen.",
    resetLead: "Falls ein Konto existiert, senden wir einen Wiederherstellungslink.",
    updateTitle: "Neues Passwort wählen",
    updateLead: "Verwende ein einzigartiges Passwort, das du nirgendwo sonst nutzt.",
    newPassword: "Neues Passwort",
    updateAction: "Passwort aktualisieren",
    noAccount: "Neu bei DiTeLe?",
    hasAccount: "Bereits registriert?",
    createAccount: "Konto erstellen",
    backToLogin: "Zur Anmeldung",
    invalid: "Prüfe deine Angaben und versuche es erneut.",
    throttled: "Wir können gerade keine weitere Anfrage bearbeiten. Warte kurz und versuche es erneut.",
    unavailable: "Die Anmeldung ist vorübergehend nicht verfügbar. Warte kurz und versuche es erneut.",
    checkEmail: "Prüfe deine E-Mail, um das Konto zu bestätigen.",
    resetSent: "Falls das Konto existiert, wurde ein Link versendet.",
    passwordUpdated: "Dein Passwort wurde aktualisiert. Melde dich an.",
    passwordHelp:
      "Mindestens 12 Zeichen mit Groß- und Kleinbuchstaben, Zahl und Sonderzeichen.",
  },
  ru: {
    loginLead: "Продолжите обучение, проверку работ или администрирование.",
    registerLead: "Создайте защищённую учётную запись для заявки на курс.",
    resetLead: "Если учётная запись существует, мы отправим ссылку восстановления.",
    updateTitle: "Выберите новый пароль",
    updateLead: "Используйте уникальный пароль, которого нет в других сервисах.",
    newPassword: "Новый пароль",
    updateAction: "Обновить пароль",
    noAccount: "Впервые в DiTeLe?",
    hasAccount: "Уже есть учётная запись?",
    createAccount: "Создать аккаунт",
    backToLogin: "Вернуться ко входу",
    invalid: "Проверьте введённые данные и попробуйте ещё раз.",
    throttled: "Сейчас мы не можем обработать ещё один запрос. Подождите и повторите попытку.",
    unavailable: "Вход временно недоступен. Подождите немного и повторите попытку.",
    checkEmail: "Проверьте почту, чтобы подтвердить учётную запись.",
    resetSent: "Если аккаунт существует, ссылка восстановления отправлена.",
    passwordUpdated: "Пароль обновлён. Войдите, чтобы продолжить.",
    passwordHelp:
      "Не менее 12 символов: прописная и строчная буквы, цифра и специальный символ.",
  },
};
