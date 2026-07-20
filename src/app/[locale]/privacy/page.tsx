import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { PublicHeader } from "@/shared/ui/public-header";

import { privacyCopy } from "./copy";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [messages, copy] = await Promise.all([getMessages(locale), Promise.resolve(privacyCopy[locale])]);

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="container content-section" id="main-content">
        <div className="stack reading-column">
          <h1>{copy.title}</h1>
          <p className="muted">{copy.intro}</p>
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
