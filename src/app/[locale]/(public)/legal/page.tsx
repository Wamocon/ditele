import type { Metadata } from "next";

import { PageHeader } from "@/shared/layout";
import { ProseSection, PendingDataNotice } from "../_components/static-page";

const TITLE = "Impressum";
const LEAD = "Angaben gemäß den gesetzlichen Anbieterkennzeichnungspflichten.";

export function generateMetadata(): Metadata {
  return { title: `${TITLE} · DiTeLe`, description: LEAD };
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;

  const sections: { title: string; body: string }[] = [
    {
      title: "Diensteanbieter",
      body: "DiTeLe wird vom Plattformbetreiber bereitgestellt. Name und Anschrift des Anbieters werden hier vor dem Produktivbetrieb ergänzt.",
    },
    {
      title: "Vertretungsberechtigte",
      body: "Die vertretungsberechtigten Personen des Anbieters werden hier ergänzt.",
    },
    {
      title: "Kontakt",
      body: "Eine E-Mail-Adresse und weitere Kontaktmöglichkeiten für Anfragen werden hier ergänzt.",
    },
    {
      title: "Verantwortlich für den Inhalt",
      body: "Die für den Inhalt verantwortliche Person wird hier ergänzt.",
    },
    {
      title: "Haftung für Inhalte und Links",
      body: "Die Inhalte dieser Plattform werden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität wird keine Gewähr übernommen. Für Inhalte externer Links sind ausschließlich deren Betreiber verantwortlich.",
    },
    {
      title: "Streitbeilegung",
      body: "Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",
    },
  ];

  return (
    <>
      <PageHeader title={TITLE} description={LEAD} />

      <div className="flex flex-col gap-8">
        {/* Visible on purpose — inventing Pflichtangaben would be worse. */}
        <PendingDataNotice>
          Vorläufiges Impressum. Die gesetzlichen Pflichtangaben (Anbieter, Anschrift, Kontakt,
          ggf. Register- und Umsatzsteuerangaben) werden vor dem Produktivbetrieb ergänzt.
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
