import type { Route } from "next";
import Link from "next/link";

import { locales, type Locale } from "@/shared/i18n/config";

export function LocaleSwitcher({ locale, suffix = "" }: { locale: Locale; suffix?: string }) {
  return (
    <nav className="locale-switcher" aria-label="Language">
      {locales.map((item) => (
        <Link key={item} href={`/${item}${suffix}` as Route} aria-current={item === locale ? "true" : undefined}>
          {item}
        </Link>
      ))}
    </nav>
  );
}
