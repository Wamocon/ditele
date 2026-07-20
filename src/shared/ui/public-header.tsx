import Link from "next/link";

import type { Locale } from "@/shared/i18n/config";
import type { Messages } from "@/shared/i18n/get-messages";
import { localizedRoute } from "@/shared/i18n/routes";
import { BrandLink } from "@/shared/ui/brand-link";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export function PublicHeader({ locale, messages }: { locale: Locale; messages: Messages }) {
  const publicLinks = [
    { href: "/catalog", label: messages.nav.catalog },
    { href: "/faq", label: messages.nav.faq },
    { href: "/about", label: messages.nav.about },
    { href: "/privacy", label: messages.nav.privacy },
    { href: "/legal", label: messages.nav.legal },
  ] as const;

  return (
    <header className="public-header">
      <div className="container public-header__inner">
        <BrandLink locale={locale} />
        <nav className="public-nav" aria-label="Primary navigation">
          {publicLinks.map(({ href, label }) => (
            <Link href={localizedRoute(locale, href)} key={href}>{label}</Link>
          ))}
          <LocaleSwitcher locale={locale} />
          <ThemeToggle label={messages.common.theme} />
          <Link className="button button--secondary" href={localizedRoute(locale, "/auth/login")}>{messages.common.signIn}</Link>
        </nav>
        <details className="public-mobile-nav">
          <summary aria-label={messages.common.openMenu}>
            <span aria-hidden="true">☰</span>
            <span>{messages.common.openMenu}</span>
          </summary>
          <nav className="public-mobile-nav__panel" aria-label="Mobile navigation">
            {publicLinks.map(({ href, label }) => (
              <Link href={localizedRoute(locale, href)} key={href}>{label}</Link>
            ))}
            <div className="public-mobile-nav__controls">
              <LocaleSwitcher locale={locale} />
              <ThemeToggle label={messages.common.theme} />
              <Link className="button button--secondary" href={localizedRoute(locale, "/auth/login")}>{messages.common.signIn}</Link>
            </div>
          </nav>
        </details>
      </div>
    </header>
  );
}
