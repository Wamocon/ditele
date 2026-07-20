import type { ReviewWorkbenchLabels } from "@/features/review/components/review-workbench";
import type { Locale } from "@/shared/i18n/config";

type ReviewDetailCopy = {
  readonly workbench: ReviewWorkbenchLabels;
  readonly saving: string;
  readonly invalidInput: string;
  readonly sessionExpired: string;
  readonly forbidden: string;
  readonly stale: string;
  readonly staleTitle: string;
  readonly invalidRubric: string;
  readonly failed: string;
  readonly invalidTransferTarget: string;
  readonly transferFailed: string;
  readonly noTransferTargetsTitle: string;
  readonly noTransferTargetsDescription: string;
  readonly otherOwnerTitle: string;
  readonly otherOwnerDescription: string;
  readonly missingRubricTitle: string;
  readonly missingRubricDescription: string;
};

export const reviewDetailCopy: Record<Locale, ReviewDetailCopy> = {
  en: {
    workbench: {
      title: "Review submission",
      learner: "Learner",
      group: "Group",
      attempt: "Attempt",
      submittedAt: "Submitted",
      duration: "Solving time",
      hintUsage: "Hint usage",
      hintsUsed: (count) => `${count} hint${count === 1 ? "" : "s"} used`,
      noHintsUsed: "No hints used",
      answer: "Learner answer",
      evidence: "Submitted evidence",
      noEvidence: "No evidence was attached to this version.",
      selectedAnswers: "Selected answers",
      rubric: "Assessment rubric",
      score: "Points",
      reviewerComment: "Trainer feedback",
      reviewerCommentDescription:
        "Give specific, actionable feedback. It becomes part of the immutable review history.",
      accept: "Accept submission",
      requestRevision: "Request revision",
      transfer: "Transfer submission",
      transferTo: "Trainer",
      transferReason: "Transfer reason",
      transferReasonDescription:
        "Explain why ownership is changing. The reason is retained in the audited transfer history.",
      history: "Review history",
      noHistory: "This submission has not been reviewed before.",
      states: {
        submitted: "Submitted",
        revision_required: "Revision required",
        resubmitted: "Resubmitted",
        accepted: "Accepted",
        withdrawn: "Withdrawn",
      },
      evidenceKinds: {
        file: "File",
        link: "Link",
        text: "Text",
        lab_result: "Lab result",
      },
    },
    saving: "Saving the review decision…",
    invalidInput: "Check the rubric scores and feedback, then try again.",
    sessionExpired: "Your session expired. Sign in again before reviewing.",
    forbidden: "You are not authorized to review this submission.",
    stale: "This submission changed after you opened it. Reload before deciding.",
    staleTitle: "Your decision was not saved",
    invalidRubric: "The rubric scores do not match the assigned rubric.",
    failed: "The review could not be saved. No decision was recorded.",
    invalidTransferTarget: "Choose another active trainer assigned to this cohort.",
    transferFailed: "The submission could not be transferred. Ownership was not changed.",
    noTransferTargetsTitle: "No transfer destination available",
    noTransferTargetsDescription:
      "No other active trainer with review permission is assigned to this cohort.",
    otherOwnerTitle: "Assigned to another trainer",
    otherOwnerDescription:
      "The latest transfer assigns this submission to another trainer. Its review history remains visible, but only the current owner can decide or transfer it.",
    missingRubricTitle: "Review is not available",
    missingRubricDescription:
      "This task version has no active assessment rubric. Ask a content administrator to assign one before reviewing.",
  },
  de: {
    workbench: {
      title: "Einreichung prüfen",
      learner: "Lernende Person",
      group: "Gruppe",
      attempt: "Versuch",
      submittedAt: "Eingereicht",
      duration: "Bearbeitungszeit",
      hintUsage: "Hinweisnutzung",
      hintsUsed: (count) => `${count} Hinweis${count === 1 ? "" : "e"} verwendet`,
      noHintsUsed: "Keine Hinweise verwendet",
      answer: "Antwort der lernenden Person",
      evidence: "Eingereichte Nachweise",
      noEvidence: "Dieser Version wurden keine Nachweise beigefügt.",
      selectedAnswers: "Ausgewählte Antworten",
      rubric: "Bewertungsrubrik",
      score: "Punkte",
      reviewerComment: "Trainer-Feedback",
      reviewerCommentDescription:
        "Gib konkretes, umsetzbares Feedback. Es wird Teil des unveränderlichen Review-Verlaufs.",
      accept: "Einreichung annehmen",
      requestRevision: "Überarbeitung anfordern",
      transfer: "Einreichung übertragen",
      transferTo: "Trainer/in",
      transferReason: "Grund der Übertragung",
      transferReasonDescription:
        "Begründe den Wechsel der Zuständigkeit. Der Grund bleibt im auditierten Übertragungsverlauf erhalten.",
      history: "Review-Verlauf",
      noHistory: "Diese Einreichung wurde bisher nicht geprüft.",
      states: {
        submitted: "Eingereicht",
        revision_required: "Überarbeitung erforderlich",
        resubmitted: "Erneut eingereicht",
        accepted: "Angenommen",
        withdrawn: "Zurückgezogen",
      },
      evidenceKinds: {
        file: "Datei",
        link: "Link",
        text: "Text",
        lab_result: "Laborergebnis",
      },
    },
    saving: "Review-Entscheidung wird gespeichert…",
    invalidInput: "Prüfe Rubrikpunkte und Feedback und versuche es erneut.",
    sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich vor dem Review erneut an.",
    forbidden: "Du darfst diese Einreichung nicht prüfen.",
    stale: "Die Einreichung wurde inzwischen geändert. Lade sie vor der Entscheidung neu.",
    staleTitle: "Deine Entscheidung wurde nicht gespeichert",
    invalidRubric: "Die Punkte passen nicht zur zugewiesenen Rubrik.",
    failed: "Das Review konnte nicht gespeichert werden. Es wurde keine Entscheidung erfasst.",
    invalidTransferTarget: "Wähle eine andere aktive, dieser Gruppe zugewiesene Trainerperson.",
    transferFailed: "Die Einreichung konnte nicht übertragen werden. Die Zuständigkeit wurde nicht geändert.",
    noTransferTargetsTitle: "Kein Übertragungsziel verfügbar",
    noTransferTargetsDescription:
      "Dieser Gruppe ist keine weitere aktive Trainerperson mit Review-Berechtigung zugewiesen.",
    otherOwnerTitle: "Einer anderen Trainerperson zugewiesen",
    otherOwnerDescription:
      "Die letzte Übertragung weist diese Einreichung einer anderen Trainerperson zu. Der Review-Verlauf bleibt sichtbar; nur die aktuelle Zuständigkeit darf entscheiden oder erneut übertragen.",
    missingRubricTitle: "Review nicht verfügbar",
    missingRubricDescription:
      "Dieser Aufgabenversion ist keine aktive Rubrik zugewiesen. Bitte vor dem Review eine Rubrik durch die Inhaltsadministration zuweisen lassen.",
  },
  ru: {
    workbench: {
      title: "Проверка работы",
      learner: "Учащийся",
      group: "Группа",
      attempt: "Попытка",
      submittedAt: "Отправлено",
      duration: "Время выполнения",
      hintUsage: "Использование подсказок",
      hintsUsed: (count) => `Использовано подсказок: ${count}`,
      noHintsUsed: "Подсказки не использовались",
      answer: "Ответ учащегося",
      evidence: "Приложенные доказательства",
      noEvidence: "К этой версии доказательства не приложены.",
      selectedAnswers: "Выбранные ответы",
      rubric: "Критерии оценки",
      score: "Баллы",
      reviewerComment: "Отзыв тренера",
      reviewerCommentDescription:
        "Оставьте конкретный и полезный отзыв. Он войдёт в неизменяемую историю проверки.",
      accept: "Принять работу",
      requestRevision: "Запросить доработку",
      transfer: "Передать работу",
      transferTo: "Тренер",
      transferReason: "Причина передачи",
      transferReasonDescription:
        "Укажите причину смены ответственного. Она сохраняется в аудируемой истории передачи.",
      history: "История проверок",
      noHistory: "Эта работа ещё не проверялась.",
      states: {
        submitted: "Отправлено",
        revision_required: "Нужна доработка",
        resubmitted: "Отправлено повторно",
        accepted: "Принято",
        withdrawn: "Отозвано",
      },
      evidenceKinds: {
        file: "Файл",
        link: "Ссылка",
        text: "Текст",
        lab_result: "Результат лаборатории",
      },
    },
    saving: "Решение сохраняется…",
    invalidInput: "Проверьте баллы и отзыв, затем повторите попытку.",
    sessionExpired: "Сессия истекла. Войдите снова перед проверкой.",
    forbidden: "У вас нет права проверять эту работу.",
    stale: "Работа изменилась после открытия. Обновите страницу перед решением.",
    staleTitle: "Решение не сохранено",
    invalidRubric: "Баллы не соответствуют назначенным критериям.",
    failed: "Не удалось сохранить проверку. Решение не было записано.",
    invalidTransferTarget: "Выберите другого активного тренера, назначенного этой группе.",
    transferFailed: "Не удалось передать работу. Ответственный не изменён.",
    noTransferTargetsTitle: "Нет доступного получателя",
    noTransferTargetsDescription:
      "В этой группе нет другого активного тренера с правом проверки.",
    otherOwnerTitle: "Назначено другому тренеру",
    otherOwnerDescription:
      "Последняя передача назначила работу другому тренеру. История проверки доступна, но принять решение или передать работу может только текущий ответственный.",
    missingRubricTitle: "Проверка недоступна",
    missingRubricDescription:
      "Для этой версии задания не назначены активные критерии. Перед проверкой администратор контента должен назначить рубрику.",
  },
};
