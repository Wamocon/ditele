import type { Locale } from "@/shared/i18n/config";

export const faqTopics = [
  "age",
  "certificates",
  "prerequisites",
  "outcomes",
  "continuing-education",
  "delivery-formats",
  "training-voucher",
] as const;

export type FaqTopic = (typeof faqTopics)[number];

type FaqAction =
  | {
      readonly kind: "internal";
      readonly path: "/about" | "/catalog";
      readonly label: string;
    }
  | {
      readonly kind: "external";
      readonly href: "https://test-it-academy.com/";
      readonly label: string;
    };

export type FaqItem = {
  readonly topic: FaqTopic;
  readonly question: string;
  readonly answer: string;
  readonly action?: FaqAction;
};

type FaqCopy = {
  readonly metadataTitle: string;
  readonly title: string;
  readonly introduction: string;
  readonly sectionTitle: string;
  readonly items: readonly FaqItem[];
  readonly furtherHelpTitle: string;
  readonly furtherHelpBody: string;
  readonly furtherHelpAction: string;
};

export const faqCopy = {
  en: {
    metadataTitle: "Frequently asked questions | DiTeLe",
    title: "Frequently asked questions",
    introduction:
      "Clear answers about learning software testing with DiTeLe, course requirements, certificates, delivery, and funding.",
    sectionTitle: "Learning with DiTeLe",
    items: [
      {
        topic: "age",
        question: "Are there age restrictions for using DiTeLe?",
        answer:
          "DiTeLe does not set one platform-wide age limit. A course or training provider may still apply eligibility, consent, or contractual requirements. Learners need enough digital confidence to use a browser and complete practical exercises.",
      },
      {
        topic: "certificates",
        question: "Can I receive a certificate after completing a course?",
        answer:
          "A DiTeLe course can issue a completion certificate only when that course has certificate rules configured and you meet its learning and review criteria. An external ISTQB credential is separate, follows the relevant examination provider's current rules, and is not awarded automatically by DiTeLe.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Check the published course details",
        },
      },
      {
        topic: "prerequisites",
        question: "What knowledge do I need before I start?",
        answer:
          "Requirements depend on the course. Foundation material is designed to introduce core testing concepts, while basic knowledge of software development and everyday browser use can help. Check the published course page for its specific level and prerequisites.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Explore the course catalog",
        },
      },
      {
        topic: "outcomes",
        question: "What will I gain from completing a course?",
        answer:
          "DiTeLe connects testing theory with practical tasks, evidence, revision, and trainer feedback. Your demonstrated work can contribute to a traceable learning history and, where enabled, competency and portfolio records. Course completion does not guarantee an exam result or employment outcome.",
      },
      {
        topic: "continuing-education",
        question: "Can I continue with further training afterwards?",
        answer:
          "You can continue with any suitable courses that are currently published and available to you. The exact next course, prerequisite, enrollment route, and schedule depend on the active offer rather than a fixed platform promise.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "See currently published courses",
        },
      },
      {
        topic: "delivery-formats",
        question: "Are courses available online, in a classroom, or in both formats?",
        answer:
          "DiTeLe is a browser-based learning workspace. Any live-online, classroom, or hybrid training around it is arranged by the training provider and can vary by course and cohort. Confirm the current format before enrolling.",
        action: {
          kind: "internal",
          path: "/about",
          label: "Learn about the training provider",
        },
      },
      {
        topic: "training-voucher",
        question: "Can a training voucher be used for a course?",
        answer:
          "Voucher eligibility and approval are decisions of the responsible funding body and training provider; DiTeLe cannot approve or guarantee funding. Ask both organizations to confirm the specific course and conditions before you enroll.",
        action: {
          kind: "external",
          href: "https://test-it-academy.com/",
          label: "Check the provider's current offer",
        },
      },
    ],
    furtherHelpTitle: "Check the current course information",
    furtherHelpBody:
      "Published course pages contain the current level, duration, availability, and enrollment route. Those details take precedence over general answers on this page.",
    furtherHelpAction: "Open the course catalog",
  },
  de: {
    metadataTitle: "Häufig gestellte Fragen | DiTeLe",
    title: "Häufig gestellte Fragen",
    introduction:
      "Klare Antworten zum Lernen von Softwaretesten mit DiTeLe, zu Kursanforderungen, Zertifikaten, Durchführungsformen und Förderung.",
    sectionTitle: "Lernen mit DiTeLe",
    items: [
      {
        topic: "age",
        question: "Gibt es Altersbeschränkungen für die Nutzung von DiTeLe?",
        answer:
          "DiTeLe legt keine plattformweit einheitliche Altersgrenze fest. Für einen Kurs oder Bildungsanbieter können dennoch Teilnahme-, Einwilligungs- oder Vertragsbedingungen gelten. Lernende benötigen ausreichende digitale Grundkenntnisse, um einen Browser zu nutzen und praktische Übungen zu bearbeiten.",
      },
      {
        topic: "certificates",
        question: "Kann ich nach einem Kurs ein Zertifikat erhalten?",
        answer:
          "Ein DiTeLe-Kurs kann nur dann ein Abschlusszertifikat ausstellen, wenn dafür Zertifikatsregeln konfiguriert sind und die Lern- und Review-Kriterien erfüllt wurden. Ein externes ISTQB-Zertifikat ist davon getrennt, richtet sich nach den aktuellen Regeln des jeweiligen Prüfungsanbieters und wird nicht automatisch durch DiTeLe vergeben.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Veröffentlichte Kursdetails prüfen",
        },
      },
      {
        topic: "prerequisites",
        question: "Welches Wissen brauche ich vor dem Start?",
        answer:
          "Die Anforderungen hängen vom jeweiligen Kurs ab. Grundlageninhalte führen in zentrale Testkonzepte ein; Grundkenntnisse in der Softwareentwicklung und im Umgang mit dem Browser können hilfreich sein. Die Kursseite nennt das konkrete Niveau und die Voraussetzungen.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Kurskatalog entdecken",
        },
      },
      {
        topic: "outcomes",
        question: "Was nehme ich aus einem abgeschlossenen Kurs mit?",
        answer:
          "DiTeLe verbindet Testtheorie mit praktischen Aufgaben, Evidenz, Überarbeitung und Trainerfeedback. Nachgewiesene Arbeit kann in einen nachvollziehbaren Lernverlauf und, sofern aktiviert, in Kompetenz- und Portfolioeinträge einfließen. Ein Kursabschluss garantiert weder ein Prüfungsergebnis noch einen beruflichen Erfolg.",
      },
      {
        topic: "continuing-education",
        question: "Kann ich mich danach weiterbilden?",
        answer:
          "Du kannst mit passenden Kursen fortfahren, die aktuell veröffentlicht und für dich verfügbar sind. Welcher Kurs als Nächstes passt und welche Voraussetzungen, Anmeldung oder Termine gelten, hängt vom aktiven Angebot ab und ist kein festes Plattformversprechen.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Aktuell veröffentlichte Kurse ansehen",
        },
      },
      {
        topic: "delivery-formats",
        question: "Gibt es Online-, Präsenz- oder Hybridunterricht?",
        answer:
          "DiTeLe ist ein browserbasierter Lernarbeitsplatz. Live-Online-, Präsenz- oder Hybridunterricht wird vom Bildungsanbieter organisiert und kann sich je nach Kurs und Gruppe unterscheiden. Prüfe die aktuelle Durchführungsform vor der Anmeldung.",
        action: {
          kind: "internal",
          path: "/about",
          label: "Mehr über den Bildungsanbieter erfahren",
        },
      },
      {
        topic: "training-voucher",
        question: "Kann ich für einen Kurs einen Bildungsgutschein einsetzen?",
        answer:
          "Über Förderfähigkeit und Bewilligung entscheiden die zuständige Förderstelle und der Bildungsanbieter; DiTeLe kann eine Förderung weder genehmigen noch garantieren. Lass den konkreten Kurs und die Bedingungen vor der Anmeldung von beiden Stellen bestätigen.",
        action: {
          kind: "external",
          href: "https://test-it-academy.com/",
          label: "Aktuelles Angebot des Anbieters prüfen",
        },
      },
    ],
    furtherHelpTitle: "Aktuelle Kursinformationen prüfen",
    furtherHelpBody:
      "Veröffentlichte Kursseiten enthalten das aktuelle Niveau, die Dauer, Verfügbarkeit und den Anmeldeweg. Diese Angaben haben Vorrang vor den allgemeinen Antworten auf dieser Seite.",
    furtherHelpAction: "Kurskatalog öffnen",
  },
  ru: {
    metadataTitle: "Часто задаваемые вопросы | DiTeLe",
    title: "Часто задаваемые вопросы",
    introduction:
      "Понятные ответы об обучении тестированию ПО в DiTeLe, требованиях к курсам, сертификатах, форматах и финансировании.",
    sectionTitle: "Обучение с DiTeLe",
    items: [
      {
        topic: "age",
        question: "Есть ли возрастные ограничения для использования DiTeLe?",
        answer:
          "DiTeLe не устанавливает единое возрастное ограничение для всей платформы. У курса или образовательного провайдера могут быть собственные условия участия, согласия или договора. Учащемуся нужны базовые цифровые навыки для работы в браузере и выполнения практических упражнений.",
      },
      {
        topic: "certificates",
        question: "Можно ли получить сертификат после завершения курса?",
        answer:
          "Курс DiTeLe может выдать сертификат о завершении только тогда, когда для него настроены правила сертификации и выполнены критерии обучения и проверки. Внешний сертификат ISTQB оформляется отдельно по актуальным правилам соответствующего экзаменационного провайдера и не выдаётся DiTeLe автоматически.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Проверить опубликованные сведения о курсе",
        },
      },
      {
        topic: "prerequisites",
        question: "Какие знания нужны перед началом обучения?",
        answer:
          "Требования зависят от конкретного курса. Базовые материалы знакомят с основными понятиями тестирования, а начальные знания о разработке ПО и уверенная работа в браузере будут полезны. На странице курса указаны его уровень и предварительные требования.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Открыть каталог курсов",
        },
      },
      {
        topic: "outcomes",
        question: "Что даст мне завершение курса?",
        answer:
          "DiTeLe связывает теорию тестирования с практическими заданиями, доказательствами, доработкой и обратной связью тренера. Подтверждённая работа может войти в прозрачную историю обучения и, если функция включена, в записи о компетенциях и портфолио. Завершение курса не гарантирует результат экзамена или трудоустройство.",
      },
      {
        topic: "continuing-education",
        question: "Можно ли продолжить обучение после этого курса?",
        answer:
          "Можно перейти к подходящим курсам, которые опубликованы и доступны сейчас. Следующий курс, его предварительные требования, способ зачисления и расписание зависят от действующего предложения, а не от постоянного обещания платформы.",
        action: {
          kind: "internal",
          path: "/catalog",
          label: "Посмотреть опубликованные курсы",
        },
      },
      {
        topic: "delivery-formats",
        question: "Доступны ли онлайн-, очный или гибридный форматы?",
        answer:
          "DiTeLe — учебная среда, работающая в браузере. Онлайн-занятия с преподавателем, очный или гибридный формат организует образовательный провайдер; условия могут отличаться для разных курсов и групп. Уточните актуальный формат до зачисления.",
        action: {
          kind: "internal",
          path: "/about",
          label: "Узнать об образовательном провайдере",
        },
      },
      {
        topic: "training-voucher",
        question: "Можно ли оплатить курс ваучером на обучение?",
        answer:
          "Право на финансирование и его одобрение определяют ответственная финансирующая организация и образовательный провайдер; DiTeLe не может одобрить или гарантировать оплату. До зачисления попросите обе стороны подтвердить конкретный курс и условия.",
        action: {
          kind: "external",
          href: "https://test-it-academy.com/",
          label: "Проверить актуальное предложение провайдера",
        },
      },
    ],
    furtherHelpTitle: "Проверьте актуальную информацию о курсе",
    furtherHelpBody:
      "На опубликованных страницах курсов указаны актуальные уровень, продолжительность, доступность и способ зачисления. Эти сведения имеют приоритет перед общими ответами на этой странице.",
    furtherHelpAction: "Открыть каталог курсов",
  },
} satisfies Readonly<Record<Locale, FaqCopy>>;
