import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

import { defaultLocale, isLocale } from "@/shared/i18n/config";

export const metadata: Metadata = {
  title: {
    default: "DiTeLe — Practical software testing learning",
    template: "%s · DiTeLe"
  },
  description: "Learn software testing through guided theory, realistic practice, evidence, trainer review, and verified competency.",
  icons: { icon: "/assets/ditele-mark.svg" }
};

const themeScript = `
try {
  const stored = localStorage.getItem("ditele-theme");
  const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = stored === "dark" || stored === "light" ? stored : preferred;
} catch { document.documentElement.dataset.theme = "light"; }
`;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const requestedLocale = requestHeaders.get("x-ditele-locale") ?? defaultLocale;
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;

  return (
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
