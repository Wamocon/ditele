import type { LearnerDashboardLabels } from "@/features/learning/components/learner-dashboard";
import type { Locale } from "@/shared/i18n/config";

export const learnerDashboardCopy: Record<Locale, LearnerDashboardLabels> = {
  en: {
    heading: "My learning",
    nextAction: "Next best action",
    continueLearning: "Continue learning",
    noAction: "No activity is currently available.",
    activeCourses: "Active courses",
    completedCourses: "Completed courses",
    requestedCourses: "Requested courses",
    awaitingAssignment: "Awaiting review and cohort or learning-path assignment.",
    emptySection: "Nothing to show here yet.",
    progression: {
      legacy_schedule: "Scheduled progression",
      manual_path: "Flexible progression",
      competency_path: "Competency-based path",
    },
    progress: (completed, total) => `${completed} of ${total} activities completed`,
  },
  de: {
    heading: "Mein Lernen",
    nextAction: "Nächste beste Aktion",
    continueLearning: "Weiterlernen",
    noAction: "Derzeit ist keine Aktivität verfügbar.",
    activeCourses: "Aktive Kurse",
    completedCourses: "Abgeschlossene Kurse",
    requestedCourses: "Angefragte Kurse",
    awaitingAssignment: "Prüfung und Zuweisung zu einer Gruppe oder einem Lernpfad stehen noch aus.",
    emptySection: "Hier gibt es noch nichts.",
    progression: {
      legacy_schedule: "Zeitgesteuerter Fortschritt",
      manual_path: "Flexibler Fortschritt",
      competency_path: "Kompetenzbasierter Lernpfad",
    },
    progress: (completed, total) => `${completed} von ${total} Aktivitäten abgeschlossen`,
  },
  ru: {
    heading: "Моё обучение",
    nextAction: "Следующее лучшее действие",
    continueLearning: "Продолжить обучение",
    noAction: "Сейчас нет доступных заданий.",
    activeCourses: "Активные курсы",
    completedCourses: "Завершённые курсы",
    requestedCourses: "Запрошенные курсы",
    awaitingAssignment: "Ожидается проверка и назначение в группу или учебный маршрут.",
    emptySection: "Здесь пока ничего нет.",
    progression: {
      legacy_schedule: "Обучение по расписанию",
      manual_path: "Гибкое обучение",
      competency_path: "Путь по компетенциям",
    },
    progress: (completed, total) => `Завершено ${completed} из ${total}`,
  },
};
