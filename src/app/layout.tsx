import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { rosario, raleway } from "./fonts";
import "./globals.css";

import { defaultLocale, isLocale } from "@/shared/i18n/config";

export const metadata: Metadata = {
  title: { default: "DiTeLe — WAMOCON Academy", template: "%s · DiTeLe" },
  description:
    "Softwaretesten lernen — Theorie, realistische Praxis, Nachweise und Trainer-Review. WAMOCON Academy.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#151C21" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // so env(safe-area-inset-bottom) works under the tab bar
};

/**
 * Runs before first paint so a dark-mode user never sees a white flash.
 * Kept as a raw string on purpose — it must be synchronous and inline.
 */
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
    <html
      lang={locale}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${rosario.variable} ${raleway.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {/* Toaster mount point — the Toast component lands in Wave 0b. */}
        <div id="toast-root" aria-live="polite" aria-atomic="false" />
      </body>
    </html>
  );
}
