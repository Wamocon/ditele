import type { Locale } from "@/shared/i18n/config";

export const QUESTION_STATES = [
  "open",
  "assigned",
  "transferred",
  "answered",
  "archived",
] as const;

export type QuestionWorkflowCopy = {
  common: {
    states: Record<(typeof QUESTION_STATES)[number], string>;
    task: string;
    cohort: string;
    learner: string;
    assignedTrainer: string;
    created: string;
    updated: string;
    unassigned: string;
    conversation: string;
    learnerMessage: string;
    trainerMessage: string;
    transferHistory: string;
    transferredFromTo: (from: string, to: string, date: string) => string;
    noMessages: string;
    back: string;
    loadingTitle: string;
    loadingDescription: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
  };
  learner: {
    title: string;
    description: string;
    createTitle: string;
    contextLabel: string;
    contextDescription: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    bodyLabel: string;
    bodyPlaceholder: string;
    send: string;
    sending: string;
    createFailed: string;
    invalidInput: string;
    forbidden: string;
    sessionExpired: string;
    noContextTitle: string;
    noContextDescription: string;
    historyTitle: string;
    historyCount: (count: number) => string;
    emptyTitle: string;
    emptyDescription: string;
    openDetail: string;
    openExplanation: string;
    archive: string;
    archiving: string;
    archiveFailed: string;
    archiveConflict: string;
  };
  trainer: {
    title: string;
    description: string;
    queueCount: (count: number) => string;
    archiveLink: string;
    queueLink: string;
    archiveTitle: string;
    archiveDescription: string;
    emptyTitle: string;
    emptyDescription: string;
    archiveEmptyTitle: string;
    archiveEmptyDescription: string;
    openDetail: string;
    openTitle: string;
    openExplanation: string;
    claimTitle: string;
    claimDescription: string;
    claim: string;
    claiming: string;
    claimSuccessTitle: string;
    claimSuccess: string;
    otherOwnerTitle: string;
    otherOwnerDescription: string;
    closedTitle: string;
    closedDescription: string;
    answerTitle: string;
    answerLabel: string;
    answerPlaceholder: string;
    answer: string;
    answering: string;
    transferTitle: string;
    transferTarget: string;
    transferReason: string;
    transferPlaceholder: string;
    transfer: string;
    transferring: string;
    noTransferTarget: string;
    invalidInput: string;
    forbidden: string;
    sessionExpired: string;
    failed: string;
    conflictTitle: string;
    conflict: string;
    invalidTarget: string;
  };
};

export type LearnerQuestionActionCopy = Omit<
  QuestionWorkflowCopy["learner"],
  "historyCount"
>;

export type TrainerQuestionActionCopy = Omit<
  QuestionWorkflowCopy["trainer"],
  "claimSuccess" | "claimSuccessTitle" | "queueCount"
>;

export function toLearnerQuestionActionCopy(
  copy: QuestionWorkflowCopy["learner"],
): LearnerQuestionActionCopy {
  const { historyCount: _historyCount, ...clientCopy } = copy;
  void _historyCount;
  return clientCopy;
}

export function toTrainerQuestionActionCopy(
  copy: QuestionWorkflowCopy["trainer"],
): TrainerQuestionActionCopy {
  const {
    claimSuccess: _claimSuccess,
    claimSuccessTitle: _claimSuccessTitle,
    queueCount: _queueCount,
    ...clientCopy
  } = copy;
  void _claimSuccess;
  void _claimSuccessTitle;
  void _queueCount;
  return clientCopy;
}

export const questionWorkflowCopy: Record<Locale, QuestionWorkflowCopy> = {
  en: {
    common: {
      states: { open: "Open", assigned: "Assigned", transferred: "Transferred", answered: "Answered", archived: "Archived" },
      task: "Task",
      cohort: "Group",
      learner: "Learner",
      assignedTrainer: "Assigned trainer",
      created: "Created",
      updated: "Updated",
      unassigned: "Not assigned",
      conversation: "Conversation",
      learnerMessage: "Learner",
      trainerMessage: "Trainer",
      transferHistory: "Assignment history",
      transferredFromTo: (from, to, date) => `${from} transferred the question to ${to} on ${date}.`,
      noMessages: "No conversation messages are available.",
      back: "Back to questions",
      loadingTitle: "Loading questions",
      loadingDescription: "The latest question state and ownership are being checked.",
      errorTitle: "Questions could not be loaded",
      errorDescription: "The request failed. Retry to load the current server state.",
      retry: "Retry",
    },
    learner: {
      title: "Questions",
      description: "Ask for help in the context of a specific practical task and follow the complete answer history.",
      createTitle: "Ask a task question",
      contextLabel: "Task and group",
      contextDescription: "The question remains linked to this task and learning group.",
      subjectLabel: "Subject",
      subjectPlaceholder: "Summarize what is blocking you",
      bodyLabel: "Question",
      bodyPlaceholder: "Describe what you tried and where you need guidance",
      send: "Send question",
      sending: "Sending…",
      createFailed: "The question could not be created. Retry with the same details.",
      invalidInput: "Select a valid task and enter both a subject and a question.",
      forbidden: "This task is not available in one of your active learning groups.",
      sessionExpired: "Your session expired. Sign in again before sending the question.",
      noContextTitle: "No task is available for questions",
      noContextDescription: "Questions can be created after a task has been assigned to one of your active groups.",
      historyTitle: "Question history",
      historyCount: (count) => `${count} question${count === 1 ? "" : "s"}`,
      emptyTitle: "No questions yet",
      emptyDescription: "Questions you create for practical tasks will appear here with their current ownership and answer state.",
      openDetail: "Open question",
      openExplanation: "This question is open and waiting for an active trainer in your group to claim it. You will be notified when ownership or the answer state changes.",
      archive: "Archive question",
      archiving: "Archiving…",
      archiveFailed: "The question could not be archived.",
      archiveConflict: "The question changed since it was loaded. Refresh before archiving.",
    },
    trainer: {
      title: "Learner questions",
      description: "Review questions in your assigned groups without losing task context or trainer ownership.",
      queueCount: (count) => `${count} active question${count === 1 ? "" : "s"}`,
      archiveLink: "View answer history",
      queueLink: "Back to active questions",
      archiveTitle: "Question history",
      archiveDescription: "Answered and archived questions remain available as an immutable mentoring record.",
      emptyTitle: "No active questions",
      emptyDescription: "Open questions in your groups and questions assigned to you will appear here.",
      archiveEmptyTitle: "No answered questions",
      archiveEmptyDescription: "Answered and archived mentoring threads will appear here.",
      openDetail: "Open question",
      openTitle: "Open question",
      openExplanation: "This question is open and unassigned. A trainer in this group must claim it before answering or transferring ownership.",
      claimTitle: "Claim this question",
      claimDescription: "Claiming records you as the current trainer and creates an audited ownership event. Only one trainer can claim the current version.",
      claim: "Claim question",
      claiming: "Claiming…",
      claimSuccessTitle: "Question claimed",
      claimSuccess: "You are now the assigned trainer. The current server state is shown below.",
      otherOwnerTitle: "Owned by another trainer",
      otherOwnerDescription: "Only the currently assigned trainer can answer or transfer this question.",
      closedTitle: "No action required",
      closedDescription: "This thread is part of the answer history and cannot be answered or transferred again.",
      answerTitle: "Answer learner",
      answerLabel: "Answer",
      answerPlaceholder: "Give guidance that helps the learner continue",
      answer: "Send answer",
      answering: "Sending…",
      transferTitle: "Transfer ownership",
      transferTarget: "New trainer",
      transferReason: "Transfer reason",
      transferPlaceholder: "Explain why ownership is changing",
      transfer: "Transfer question",
      transferring: "Transferring…",
      noTransferTarget: "No other active trainer is available in this group. You can still answer the question.",
      invalidInput: "Complete all required fields with valid values.",
      forbidden: "You do not own this question or no longer have access to its group.",
      sessionExpired: "Your session expired. Sign in again before continuing.",
      failed: "The action failed. Retry after checking the current question state.",
      conflictTitle: "Question changed",
      conflict: "The question changed since it was loaded. Refresh before deciding.",
      invalidTarget: "The selected trainer is not active in this question's group and organization.",
    },
  },
  de: {
    common: {
      states: { open: "Offen", assigned: "Zugewiesen", transferred: "Weitergegeben", answered: "Beantwortet", archived: "Archiviert" },
      task: "Aufgabe",
      cohort: "Gruppe",
      learner: "Lernende Person",
      assignedTrainer: "Zugewiesene Trainerperson",
      created: "Erstellt",
      updated: "Aktualisiert",
      unassigned: "Nicht zugewiesen",
      conversation: "Verlauf",
      learnerMessage: "Lernende Person",
      trainerMessage: "Trainerperson",
      transferHistory: "Zuweisungsverlauf",
      transferredFromTo: (from, to, date) => `${from} hat die Frage am ${date} an ${to} weitergegeben.`,
      noMessages: "Es sind keine Nachrichten verfügbar.",
      back: "Zurück zu den Fragen",
      loadingTitle: "Fragen werden geladen",
      loadingDescription: "Der aktuelle Status und die Zuständigkeit werden geprüft.",
      errorTitle: "Fragen konnten nicht geladen werden",
      errorDescription: "Die Anfrage ist fehlgeschlagen. Lade den aktuellen Serverstatus erneut.",
      retry: "Erneut versuchen",
    },
    learner: {
      title: "Fragen",
      description: "Stelle eine Frage im Kontext einer praktischen Aufgabe und verfolge den vollständigen Antwortverlauf.",
      createTitle: "Frage zu einer Aufgabe stellen",
      contextLabel: "Aufgabe und Gruppe",
      contextDescription: "Die Frage bleibt mit dieser Aufgabe und Lerngruppe verknüpft.",
      subjectLabel: "Betreff",
      subjectPlaceholder: "Fasse kurz zusammen, was dich blockiert",
      bodyLabel: "Frage",
      bodyPlaceholder: "Beschreibe deinen bisherigen Versuch und wobei du Hilfe brauchst",
      send: "Frage senden",
      sending: "Wird gesendet…",
      createFailed: "Die Frage konnte nicht erstellt werden. Versuche es mit denselben Angaben erneut.",
      invalidInput: "Wähle eine gültige Aufgabe und gib Betreff sowie Frage ein.",
      forbidden: "Diese Aufgabe ist in keiner deiner aktiven Lerngruppen verfügbar.",
      sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich vor dem Senden erneut an.",
      noContextTitle: "Keine Aufgabe für Fragen verfügbar",
      noContextDescription: "Fragen können erstellt werden, sobald deiner aktiven Gruppe eine Aufgabe zugewiesen ist.",
      historyTitle: "Fragenverlauf",
      historyCount: (count) => `${count} ${count === 1 ? "Frage" : "Fragen"}`,
      emptyTitle: "Noch keine Fragen",
      emptyDescription: "Fragen zu praktischen Aufgaben erscheinen hier mit Zuständigkeit und Antwortstatus.",
      openDetail: "Frage öffnen",
      openExplanation: "Diese Frage ist offen und wartet darauf, von einer aktiven Trainerperson deiner Gruppe übernommen zu werden. Bei Zuständigkeits- oder Antwortänderungen wirst du benachrichtigt.",
      archive: "Frage archivieren",
      archiving: "Wird archiviert…",
      archiveFailed: "Die Frage konnte nicht archiviert werden.",
      archiveConflict: "Die Frage wurde zwischenzeitlich geändert. Aktualisiere die Seite vor dem Archivieren.",
    },
    trainer: {
      title: "Fragen der Lernenden",
      description: "Bearbeite Fragen deiner Gruppen mit vollständigem Aufgaben- und Zuständigkeitskontext.",
      queueCount: (count) => `${count} aktive ${count === 1 ? "Frage" : "Fragen"}`,
      archiveLink: "Antwortverlauf ansehen",
      queueLink: "Zurück zu aktiven Fragen",
      archiveTitle: "Fragenverlauf",
      archiveDescription: "Beantwortete und archivierte Fragen bleiben als unveränderlicher Mentoring-Nachweis verfügbar.",
      emptyTitle: "Keine aktiven Fragen",
      emptyDescription: "Offene Fragen deiner Gruppen und dir zugewiesene Fragen erscheinen hier.",
      archiveEmptyTitle: "Keine beantworteten Fragen",
      archiveEmptyDescription: "Beantwortete und archivierte Mentoring-Verläufe erscheinen hier.",
      openDetail: "Frage öffnen",
      openTitle: "Offene Frage",
      openExplanation: "Diese Frage ist offen und nicht zugewiesen. Eine Trainerperson dieser Gruppe muss sie übernehmen, bevor sie antworten oder die Zuständigkeit weitergeben kann.",
      claimTitle: "Frage übernehmen",
      claimDescription: "Die Übernahme trägt dich als zuständige Trainerperson ein und erzeugt ein auditiertes Zuständigkeitsereignis. Nur eine Person kann die aktuelle Version übernehmen.",
      claim: "Frage übernehmen",
      claiming: "Wird übernommen…",
      claimSuccessTitle: "Frage übernommen",
      claimSuccess: "Du bist jetzt als zuständige Trainerperson eingetragen. Unten wird der aktuelle Serverstatus angezeigt.",
      otherOwnerTitle: "Andere Trainerperson zuständig",
      otherOwnerDescription: "Nur die aktuell zugewiesene Trainerperson kann diese Frage beantworten oder weitergeben.",
      closedTitle: "Keine Aktion erforderlich",
      closedDescription: "Dieser Verlauf gehört zur Antworthistorie und kann nicht erneut beantwortet oder weitergegeben werden.",
      answerTitle: "Lernender Person antworten",
      answerLabel: "Antwort",
      answerPlaceholder: "Gib eine Hilfestellung, mit der die lernende Person weiterarbeiten kann",
      answer: "Antwort senden",
      answering: "Wird gesendet…",
      transferTitle: "Zuständigkeit weitergeben",
      transferTarget: "Neue Trainerperson",
      transferReason: "Grund der Weitergabe",
      transferPlaceholder: "Begründe den Wechsel der Zuständigkeit",
      transfer: "Frage weitergeben",
      transferring: "Wird weitergegeben…",
      noTransferTarget: "In dieser Gruppe ist keine andere aktive Trainerperson verfügbar. Du kannst die Frage weiterhin beantworten.",
      invalidInput: "Fülle alle Pflichtfelder mit gültigen Angaben aus.",
      forbidden: "Du bist für diese Frage nicht zuständig oder hast keinen Zugriff mehr auf die Gruppe.",
      sessionExpired: "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
      failed: "Die Aktion ist fehlgeschlagen. Prüfe den aktuellen Status und versuche es erneut.",
      conflictTitle: "Frage geändert",
      conflict: "Die Frage wurde zwischenzeitlich geändert. Aktualisiere die Seite vor der Entscheidung.",
      invalidTarget: "Die ausgewählte Trainerperson ist in Gruppe und Organisation dieser Frage nicht aktiv.",
    },
  },
  ru: {
    common: {
      states: { open: "Открыт", assigned: "Назначен", transferred: "Передан", answered: "Отвечен", archived: "В архиве" },
      task: "Задание",
      cohort: "Группа",
      learner: "Учащийся",
      assignedTrainer: "Назначенный тренер",
      created: "Создан",
      updated: "Обновлён",
      unassigned: "Не назначен",
      conversation: "Переписка",
      learnerMessage: "Учащийся",
      trainerMessage: "Тренер",
      transferHistory: "История назначений",
      transferredFromTo: (from, to, date) => `${from} передал вопрос тренеру ${to} — ${date}.`,
      noMessages: "Сообщений в переписке пока нет.",
      back: "Назад к вопросам",
      loadingTitle: "Загрузка вопросов",
      loadingDescription: "Проверяем актуальный статус вопроса и его владельца.",
      errorTitle: "Не удалось загрузить вопросы",
      errorDescription: "Запрос завершился ошибкой. Повторите попытку, чтобы получить актуальное состояние.",
      retry: "Повторить",
    },
    learner: {
      title: "Вопросы",
      description: "Задавайте вопросы по конкретным практическим заданиям и просматривайте полную историю ответов.",
      createTitle: "Задать вопрос по заданию",
      contextLabel: "Задание и группа",
      contextDescription: "Вопрос останется связан с этим заданием и учебной группой.",
      subjectLabel: "Тема",
      subjectPlaceholder: "Кратко опишите, что мешает продолжить",
      bodyLabel: "Вопрос",
      bodyPlaceholder: "Опишите, что вы уже попробовали и какая помощь нужна",
      send: "Отправить вопрос",
      sending: "Отправка…",
      createFailed: "Не удалось создать вопрос. Повторите попытку с теми же данными.",
      invalidInput: "Выберите допустимое задание и заполните тему и текст вопроса.",
      forbidden: "Это задание недоступно ни в одной из ваших активных групп.",
      sessionExpired: "Сеанс истёк. Войдите снова перед отправкой вопроса.",
      noContextTitle: "Нет задания для вопроса",
      noContextDescription: "Вопрос можно создать после назначения задания вашей активной группе.",
      historyTitle: "История вопросов",
      historyCount: (count) => `Вопросов: ${count}`,
      emptyTitle: "Вопросов пока нет",
      emptyDescription: "Здесь появятся ваши вопросы по практическим заданиям, их владелец и статус ответа.",
      openDetail: "Открыть вопрос",
      openExplanation: "Вопрос открыт и ожидает, пока активный тренер вашей группы возьмёт его в работу. При смене владельца или статуса ответа вы получите уведомление.",
      archive: "Архивировать вопрос",
      archiving: "Архивация…",
      archiveFailed: "Не удалось архивировать вопрос.",
      archiveConflict: "После загрузки вопрос изменился. Обновите страницу перед архивацией.",
    },
    trainer: {
      title: "Вопросы учащихся",
      description: "Работайте с вопросами своих групп, сохраняя контекст задания и подтверждённое владение.",
      queueCount: (count) => `Активных вопросов: ${count}`,
      archiveLink: "Открыть историю ответов",
      queueLink: "Назад к активным вопросам",
      archiveTitle: "История вопросов",
      archiveDescription: "Отвеченные и архивные вопросы остаются неизменяемой историей наставничества.",
      emptyTitle: "Активных вопросов нет",
      emptyDescription: "Здесь появятся открытые вопросы ваших групп и назначенные вам вопросы.",
      archiveEmptyTitle: "Отвеченных вопросов нет",
      archiveEmptyDescription: "Здесь появятся отвеченные и архивные переписки.",
      openDetail: "Открыть вопрос",
      openTitle: "Открытый вопрос",
      openExplanation: "Вопрос открыт и пока не назначен. Тренер этой группы должен взять его в работу, прежде чем отвечать или передавать другому тренеру.",
      claimTitle: "Взять вопрос в работу",
      claimDescription: "После подтверждения вы станете ответственным тренером, а смена владельца будет записана в аудит. Текущую версию может взять только один тренер.",
      claim: "Взять вопрос",
      claiming: "Назначение…",
      claimSuccessTitle: "Вопрос взят в работу",
      claimSuccess: "Теперь вы назначены ответственным тренером. Ниже показано актуальное состояние сервера.",
      otherOwnerTitle: "Вопрос принадлежит другому тренеру",
      otherOwnerDescription: "Ответить или передать вопрос может только назначенный сейчас тренер.",
      closedTitle: "Действие не требуется",
      closedDescription: "Эта переписка находится в истории ответов, повторный ответ или передача недоступны.",
      answerTitle: "Ответить учащемуся",
      answerLabel: "Ответ",
      answerPlaceholder: "Дайте подсказку, которая поможет продолжить работу",
      answer: "Отправить ответ",
      answering: "Отправка…",
      transferTitle: "Передать владение",
      transferTarget: "Новый тренер",
      transferReason: "Причина передачи",
      transferPlaceholder: "Объясните причину смены владельца",
      transfer: "Передать вопрос",
      transferring: "Передача…",
      noTransferTarget: "В группе нет другого активного тренера. Вы всё ещё можете ответить на вопрос.",
      invalidInput: "Заполните все обязательные поля допустимыми значениями.",
      forbidden: "Вы не владеете этим вопросом или больше не имеете доступа к его группе.",
      sessionExpired: "Сеанс истёк. Войдите снова, чтобы продолжить.",
      failed: "Действие не выполнено. Проверьте актуальный статус вопроса и повторите попытку.",
      conflictTitle: "Вопрос изменён",
      conflict: "После загрузки вопрос изменился. Обновите страницу перед решением.",
      invalidTarget: "Выбранный тренер не активен в группе и организации этого вопроса.",
    },
  },
};
