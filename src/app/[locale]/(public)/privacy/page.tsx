import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { ProseSection, PendingDataNotice } from "../_components/static-page";

const TITLE = "Datenschutz";
const LEAD = "Wie DiTeLe personenbezogene Daten verarbeitet — im Überblick.";

export function generateMetadata(): Metadata {
  return { title: `${TITLE} · DiTeLe`, description: LEAD };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;

  const sections: { title: string; body: string }[] = [
    {
      title: "1. Verantwortlicher",
      body: "Verantwortlich für die Datenverarbeitung auf dieser Plattform ist der Betreiber von DiTeLe. Die vollständigen Kontaktangaben finden Sie im Impressum.",
    },
    {
      title: "2. Welche Daten wir verarbeiten",
      body: "Kontodaten (Name, E-Mail-Adresse, Sprache), Lerndaten (Kurszuweisungen durch die Administration, Bearbeitungen von Kurs- und Arena-Aufgaben, Abgaben einschließlich hochgeladener Screenshots, Bewertungen und Kommentare der Trainer, erworbene XP und Abzeichen sowie Ihr Aufgaben- und Kursfeedback) und technische Protokolle, die für Betrieb und Sicherheit erforderlich sind.",
    },
    {
      title: "3. Zwecke der Verarbeitung",
      body: "Wir verarbeiten diese Daten, um die Lernplattform bereitzustellen, Ihnen zugewiesene Kurse und die Arena zu ermöglichen, Ihren Fortschritt festzuhalten und die Betreuung und Bewertung durch Trainerinnen und Trainer zu ermöglichen.",
    },
    {
      title: "4. Wer welche Daten sieht",
      body: "Teilnehmende sehen ausschließlich ihre eigenen Daten. Trainerinnen und Trainer sehen die Abgaben der Teilnehmenden in den Kursen, die ihnen zugewiesen sind. Die Administration sieht Konten, Kurszuweisungen sowie Feedback und Fortschritt. Ein Zugriff darüber hinaus ist technisch durch Berechtigungsregeln (Row Level Security) in der Datenbank ausgeschlossen. Screenshots aus Bug-Hunts sind nur für die abgebende Person, die betreuenden Trainer und die Administration sichtbar.",
    },
    {
      title: "5. Speicherdauer",
      body: "Wir speichern personenbezogene Daten nur so lange, wie es für die genannten Zwecke oder aufgrund gesetzlicher Aufbewahrungspflichten erforderlich ist. Danach werden sie gelöscht oder anonymisiert.",
    },
    {
      title: "6. Ihre Rechte",
      body: "Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer Daten sowie auf Datenübertragbarkeit und Widerspruch. Zudem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren.",
    },
    {
      title: "7. Cookies",
      body: "DiTeLe verwendet ausschließlich technisch notwendige Cookies, insbesondere für die Anmeldung und die Sitzung. Es findet kein Tracking und keine Weitergabe zu Werbezwecken statt.",
    },
    {
      title: "8. Kontakt zum Datenschutz",
      body: "Bei Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte wenden Sie sich bitte an die im Impressum genannten Kontaktdaten.",
    },
  ];

  return (
    <>
      <PageHeader title={TITLE} description={LEAD} />

      <div className="flex flex-col gap-8">
        {/* Visible on purpose — a privacy page with invented details is worse. */}
        <PendingDataNotice>
          Vorläufiger Text. Verantwortlicher, Kontaktangaben und konkrete Speicherfristen werden vor
          dem Produktivbetrieb ergänzt.
        </PendingDataNotice>

        {sections.map((section) => (
          <ProseSection key={section.title} title={section.title}>
            <p>{section.body}</p>
          </ProseSection>
        ))}
      </div>
    </>
  );
}
