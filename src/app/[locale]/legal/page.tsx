import { notFound } from "next/navigation";

import { isLocale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { PublicHeader } from "@/shared/ui/public-header";

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale);

  return (
    <>
      <PublicHeader locale={locale} messages={messages} />
      <main className="container content-section" id="main-content">
        <div className="state-panel">
          <h1>{locale === "de" ? "Rechtliche Hinweise" : locale === "ru" ? "Правовая информация" : "Legal information"}</h1>
          <p className="muted">
            {locale === "de"
              ? "Anbieter-, Vertrags- und produktive Datenschutzangaben werden vor dem öffentlichen Start durch den verantwortlichen Rechtsträger freigegeben."
              : locale === "ru"
                ? "Сведения о поставщике, договоре и защите данных будут утверждены ответственным юридическим лицом до публичного запуска."
                : "Provider, contract, and production privacy details will be approved by the responsible legal entity before public launch."}
          </p>
        </div>
      </main>
    </>
  );
}
