import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";

import { PageHeader } from "@/shared/layout";

const TITLE = "Häufige Fragen";
const DESCRIPTION = "Antworten auf die wichtigsten Fragen zu Kursen, Aufgaben, der Arena und dem Feedback.";

export function generateMetadata(): Metadata {
  return { title: `${TITLE} · DiTeLe`, description: DESCRIPTION };
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;

  const entries: { q: string; a: string }[] = [
    {
      q: "Was ist DiTeLe?",
      a: "DiTeLe ist eine Lernplattform für Softwaretesten. Statt reiner Theorie lernst du durch echte Aufgaben und Bug-Hunts und bekommst Feedback von Trainerinnen und Trainern.",
    },
    {
      q: "Wie bekomme ich Zugang zu einem Kurs?",
      a: "Die Administration legt Kurse an und weist sie dir zu. Eine Selbst-Einschreibung gibt es nicht. Wenn du einen Kurs belegen möchtest, wende dich an deine Trainerin, deinen Trainer oder die Administration.",
    },
    {
      q: "Wie ist ein Kurs aufgebaut?",
      a: "Ein Kurs besteht aus einer Reihe von Kursaufgaben, die du der Reihe nach bearbeitest. Zu jeder Aufgabe gehören Videos, Hinweise und eine Pflichtfrage. Manche Aufgaben sind mit einem Bug-Hunt in der Arena verknüpft, der zuerst angenommen sein muss.",
    },
    {
      q: "Was ist die Arena?",
      a: "In der Arena findest du Bug-Hunts: Du bekommst eine HTML-Oberfläche und suchst darin Fehler. Die Arena ist eine eigene Kette — jeder angenommene Bug-Hunt schaltet den nächsten frei, unabhängig von den Kursaufgaben.",
    },
    {
      q: "Wie reiche ich eine Aufgabe ein?",
      a: "Du bearbeitest die Aufgabe (Freitext und Auswahlfrage, bei Bug-Hunts zusätzlich Screenshots mit Beschreibungen). Dein Entwurf wird laufend automatisch gespeichert. Mit dem Absenden geht deine Abgabe an die Trainer.",
    },
    {
      q: "Wer bewertet meine Abgaben?",
      a: "Die Trainerinnen und Trainer, die dem Kurs zugewiesen sind. Sie sehen deine Antwort und bei Bug-Hunts deine Screenshots, geben einen Kommentar und entscheiden „angenommen“ oder „Überarbeitung nötig“.",
    },
    {
      q: "Was passiert nach dem Absenden?",
      a: "Eine abgesendete Aufgabe ist schreibgeschützt. Bei „Überarbeitung nötig“ wird sie wieder zum Bearbeiten geöffnet. Direkt nach dem Absenden kannst du einmalig ein Emoji als kurzes Feedback geben — es bleibt für dich sichtbar und lässt sich nicht mehr ändern.",
    },
    {
      q: "Was sind XP und Abzeichen?",
      a: "Für angenommene Bug-Hunts in der Arena erhältst du Erfahrungspunkte (XP) und gegebenenfalls ein Abzeichen. Deine gesamten XP und deine Abzeichen siehst du in deinem Profil.",
    },
    {
      q: "Wann ist ein Kurs abgeschlossen?",
      a: "Sobald alle erforderlichen Aufgaben angenommen sind, gilt der Kurs als abgeschlossen. Danach spielt das Abschlussvideo, und du gibst eine Kursbewertung mit fünf Sternen und einem kurzen Text ab.",
    },
    {
      q: "In welcher Sprache läuft DiTeLe?",
      a: "Die Inhalte und die Oberfläche sind auf Deutsch.",
    },
  ];

  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />

      {/*
        Native <details>: keyboard-operable, screen-reader-announced and
        searchable by the browser's own find-in-page, with no JavaScript and no
        dependency. A hand-built accordion would be worse on all four counts.
      */}
      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <details
            key={entry.q}
            className="group rounded-(--radius-lg) border border-(--color-border) bg-(--color-bg) open:shadow-(--shadow-sm)"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-[15px] font-semibold leading-6 marker:content-none lg:px-5">
              {entry.q}
              <ChevronDown
                className="size-4 shrink-0 text-(--color-fg-muted) transition-transform duration-(--duration-base) group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="prose-measure px-4 pb-4 text-[15px] leading-6 text-(--color-fg-muted) lg:px-5">
              {entry.a}
            </p>
          </details>
        ))}
      </div>
    </>
  );
}
