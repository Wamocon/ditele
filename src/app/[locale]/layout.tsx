import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isLocale, locales } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale);

  return (
    <div lang={locale}>
      <a className="skip-link" href="#main-content">{messages.common.skipToContent}</a>
      {children}
    </div>
  );
}
