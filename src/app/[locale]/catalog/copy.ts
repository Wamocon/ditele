import type { CatalogLocale } from "@/features/catalog/model/catalog";
import type { CourseCatalogLabels } from "@/features/catalog/components/course-catalog";
import type { CourseDetailLabels } from "@/features/catalog/components/course-detail";

type CatalogCopy = {
  catalog: CourseCatalogLabels;
  detail: CourseDetailLabels;
};

export const catalogCopy: Record<CatalogLocale, CatalogCopy> = {
  en: {
    catalog: {
      heading: "Course catalog",
      introduction: "Build testing skill through guided practice, evidence, and trainer review.",
      searchLabel: "Search courses",
      searchButton: "Search",
      emptyTitle: "No matching courses",
      emptyDescription: "Try another search term.",
      duration: "Estimated duration",
      practicalTasks: "Published practical tasks",
      durationValue: (minutes) => `${minutes} minutes`,
      taskCountValue: (count) => String(count),
      availability: {
        open: "Open enrollment",
        request_required: "Enrollment request required",
        waitlist: "Waitlist",
        closed: "Closed",
      },
    },
    detail: {
      backToCatalog: "Back to catalog",
      requestEnrollment: "Request enrollment",
      about: "About this course",
      outcomes: "Learning outcomes",
      availability: {
        open: "Open enrollment",
        request_required: "Enrollment request required",
        waitlist: "Waitlist",
        closed: "Closed",
      },
    },
  },
  de: {
    catalog: {
      heading: "Kurskatalog",
      introduction: "Entwickle Testkompetenz durch Praxis, Evidenz und Trainer-Review.",
      searchLabel: "Kurse suchen",
      searchButton: "Suchen",
      emptyTitle: "Keine passenden Kurse",
      emptyDescription: "Versuche einen anderen Suchbegriff.",
      duration: "Geschätzte Dauer",
      practicalTasks: "Veröffentlichte Praxisaufgaben",
      durationValue: (minutes) => `${minutes} Minuten`,
      taskCountValue: (count) => String(count),
      availability: {
        open: "Offene Anmeldung",
        request_required: "Kursanfrage erforderlich",
        waitlist: "Warteliste",
        closed: "Geschlossen",
      },
    },
    detail: {
      backToCatalog: "Zurück zum Katalog",
      requestEnrollment: "Kurs anfragen",
      about: "Über diesen Kurs",
      outcomes: "Lernziele",
      availability: {
        open: "Offene Anmeldung",
        request_required: "Kursanfrage erforderlich",
        waitlist: "Warteliste",
        closed: "Geschlossen",
      },
    },
  },
  ru: {
    catalog: {
      heading: "Каталог курсов",
      introduction: "Развивайте навыки тестирования через практику, доказательства и ревью тренера.",
      searchLabel: "Поиск курсов",
      searchButton: "Найти",
      emptyTitle: "Курсы не найдены",
      emptyDescription: "Попробуйте другой поисковый запрос.",
      duration: "Ориентировочная длительность",
      practicalTasks: "Опубликованные практические задания",
      durationValue: (minutes) => `${minutes} минут`,
      taskCountValue: (count) => String(count),
      availability: {
        open: "Открытая регистрация",
        request_required: "Требуется заявка",
        waitlist: "Лист ожидания",
        closed: "Закрыто",
      },
    },
    detail: {
      backToCatalog: "Назад в каталог",
      requestEnrollment: "Подать заявку",
      about: "О курсе",
      outcomes: "Результаты обучения",
      availability: {
        open: "Открытая регистрация",
        request_required: "Требуется заявка",
        waitlist: "Лист ожидания",
        closed: "Закрыто",
      },
    },
  },
};
