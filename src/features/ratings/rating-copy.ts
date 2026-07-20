import type { Locale } from "@/shared/i18n/config";

export type RatingCopy = {
  readonly courseTitle: string;
  readonly taskTitle: string;
  readonly courseDescription: string;
  readonly taskDescription: string;
  readonly scoreLabel: string;
  readonly starLabelTemplate: string;
  readonly comment: string;
  readonly commentPlaceholder: string;
  readonly submit: string;
  readonly update: string;
  readonly submitting: string;
  readonly saved: string;
  readonly yourRating: string;
  readonly chooseScore: string;
  readonly invalidInput: string;
  readonly forbidden: string;
  readonly conflict: string;
  readonly failed: string;
  readonly sessionExpired: string;
};

export const ratingCopy: Record<Locale, RatingCopy> = {
  en: {
    courseTitle: "Rate this course",
    taskTitle: "Rate this task",
    courseDescription:
      "Your feedback helps trainers improve this course. You can update your rating at any time.",
    taskDescription:
      "Tell us how clear and useful this task was. You can update your rating at any time.",
    scoreLabel: "Your score",
    starLabelTemplate: "Give {score} out of 5 stars",
    comment: "Comment (optional)",
    commentPlaceholder: "What worked well, and what could be clearer?",
    submit: "Submit rating",
    update: "Update rating",
    submitting: "Saving…",
    saved: "Thank you — your rating was saved.",
    yourRating: "Your current rating",
    chooseScore: "Select a score before submitting.",
    invalidInput: "Please choose a score from 1 to 5.",
    forbidden: "You can only rate content you are enrolled in.",
    conflict: "Your rating changed elsewhere. The latest version is shown — try again.",
    failed: "The rating could not be saved. Please retry.",
    sessionExpired: "Your session expired. Sign in again to rate.",
  },
  de: {
    courseTitle: "Diesen Kurs bewerten",
    taskTitle: "Diese Aufgabe bewerten",
    courseDescription:
      "Dein Feedback hilft Trainer:innen, diesen Kurs zu verbessern. Du kannst deine Bewertung jederzeit ändern.",
    taskDescription:
      "Sag uns, wie klar und nützlich diese Aufgabe war. Du kannst deine Bewertung jederzeit ändern.",
    scoreLabel: "Deine Bewertung",
    starLabelTemplate: "{score} von 5 Sternen geben",
    comment: "Kommentar (optional)",
    commentPlaceholder: "Was hat gut funktioniert und was könnte klarer sein?",
    submit: "Bewertung absenden",
    update: "Bewertung aktualisieren",
    submitting: "Wird gespeichert…",
    saved: "Danke — deine Bewertung wurde gespeichert.",
    yourRating: "Deine aktuelle Bewertung",
    chooseScore: "Wähle eine Bewertung, bevor du absendest.",
    invalidInput: "Bitte wähle eine Bewertung von 1 bis 5.",
    forbidden: "Du kannst nur Inhalte bewerten, für die du eingeschrieben bist.",
    conflict:
      "Deine Bewertung wurde an anderer Stelle geändert. Die aktuelle Version wird angezeigt — versuche es erneut.",
    failed: "Die Bewertung konnte nicht gespeichert werden. Bitte erneut versuchen.",
    sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich erneut an, um zu bewerten.",
  },
  ru: {
    courseTitle: "Оцените этот курс",
    taskTitle: "Оцените это задание",
    courseDescription:
      "Ваш отзыв помогает тренерам улучшать курс. Вы можете изменить оценку в любое время.",
    taskDescription:
      "Расскажите, насколько понятным и полезным было задание. Оценку можно изменить в любое время.",
    scoreLabel: "Ваша оценка",
    starLabelTemplate: "Поставить {score} из 5 звёзд",
    comment: "Комментарий (необязательно)",
    commentPlaceholder: "Что было хорошо, а что можно сделать понятнее?",
    submit: "Отправить оценку",
    update: "Обновить оценку",
    submitting: "Сохранение…",
    saved: "Спасибо — ваша оценка сохранена.",
    yourRating: "Ваша текущая оценка",
    chooseScore: "Выберите оценку перед отправкой.",
    invalidInput: "Пожалуйста, выберите оценку от 1 до 5.",
    forbidden: "Оценивать можно только материалы, на которые вы записаны.",
    conflict:
      "Ваша оценка изменилась в другом месте. Показана последняя версия — попробуйте снова.",
    failed: "Не удалось сохранить оценку. Повторите попытку.",
    sessionExpired: "Сессия истекла. Войдите снова, чтобы оценить.",
  },
};
