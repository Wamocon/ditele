import type { Metadata } from "next";
import { GraduationCap, Bug, MessagesSquare } from "lucide-react";

import { PageHeader } from "@/shared/layout";
import { Card, CardTitle, CardDescription } from "@/shared/ui";
import { ProseSection } from "../_components/static-page";

const TITLE = "Über uns";
const LEAD = "DiTeLe ist eine Lernplattform für Softwaretesten — praxisnah, auf Deutsch und mit Feedback von echten Trainerinnen und Trainern.";

export function generateMetadata(): Metadata {
  return { title: `${TITLE} · DiTeLe`, description: LEAD };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;

  const approach = [
    {
      icon: GraduationCap,
      title: "Kursaufgaben",
      body: "Jeder Kurs führt der Reihe nach durch Aufgaben mit Videos, Hinweisen und einer Pflichtfrage. So baust du Wissen Schritt für Schritt auf.",
    },
    {
      icon: Bug,
      title: "Arena: Bug-Hunts",
      body: "In der Arena suchst du echte Fehler in HTML-Oberflächen. Jeder angenommene Bug-Hunt bringt XP und Abzeichen und schaltet den nächsten frei.",
    },
    {
      icon: MessagesSquare,
      title: "Betreuung durch Trainer",
      body: "Trainerinnen und Trainer prüfen deine Abgaben, geben konkretes Feedback und entscheiden, ob eine Aufgabe angenommen ist oder überarbeitet werden muss.",
    },
  ];

  return (
    <>
      <PageHeader title={TITLE} description={LEAD} />

      <div className="flex flex-col gap-8">
        <ProseSection title="Unsere Idee">
          <p>
            Softwaretesten lernt man durch Testen. Deshalb steht bei DiTeLe nicht der Vortrag im
            Mittelpunkt, sondern die eigene Arbeit an konkreten Aufgaben. Du lernst, übst, reichst
            deine Lösung ein und bekommst Feedback — und wiederholst diese Schleife, bis der Stoff
            sitzt.
          </p>
        </ProseSection>

        <section className="flex flex-col gap-3">
          <h2 className="text-[22px] font-semibold leading-7">So arbeitest du bei DiTeLe</h2>
          <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
            {approach.map((item) => (
              <Card key={item.title} className="flex flex-col gap-2">
                <span className="flex size-10 items-center justify-center rounded-(--radius-md) bg-(--color-brand-soft) text-(--color-brand)">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription className="text-[15px] leading-6">{item.body}</CardDescription>
              </Card>
            ))}
          </div>
        </section>

        <ProseSection title="Für wen ist DiTeLe">
          <p>
            DiTeLe richtet sich an alle, die den Einstieg ins Softwaretesten suchen oder ihre
            Kenntnisse vertiefen möchten — vom Neueinstieg bis zur Umschulung. Es sind keine
            Vorkenntnisse nötig; du arbeitest in deinem eigenen Tempo.
          </p>
        </ProseSection>

        <ProseSection title="Rollen und Zugang">
          <p>
            Die Administration legt Kurse an und weist Teilnehmende sowie Trainerinnen und Trainer
            zu. Eine Selbst-Einschreibung gibt es nicht: Du erhältst deine Zugangsdaten und deine
            Kurse von der Administration. Trainerinnen und Trainer betreuen die Kurse, die ihnen
            zugewiesen sind, und bewerten die Abgaben ihrer Teilnehmenden.
          </p>
        </ProseSection>

        <ProseSection title="Kontakt">
          <p>
            Fragen zu einem Kurs oder zu deinem Zugang? Wende dich an deine Trainerin, deinen Trainer
            oder die Administration.
          </p>
        </ProseSection>
      </div>
    </>
  );
}
