import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import { Container } from "./container";
import type { NavItem } from "./nav-config";

export interface AppFooterProps {
  locale: string;
  /**
   * The public links, already resolved through the active locale by AppShell.
   *
   * This used to read `PUBLIC_NAV` directly, which meant the footer rendered
   * the hardcoded German `label` ("Kurse", "Über uns", "Datenschutz") on every
   * page in every locale — the header next to it was translated, the footer
   * under it was not.
   */
  items: NavItem[];
  /** Accessible name for the footer nav, from `common.footerNav`. */
  navLabel: string;
}

/**
 * Hidden below lg — a footer under a fixed tab bar is unreachable dead weight.
 * Its links move into the "Mehr" sheet on mobile.
 */
export function AppFooter({ locale, items, navLabel }: AppFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 hidden border-t border-(--color-border) bg-(--color-surface) py-10 lg:block">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          {/*
            Two files rather than one, because next/image renders an <img> and an
            <img> cannot inherit currentColor. The navy ink in the mark is
            invisible on the dark surface, so each theme gets its own artwork.
            `.theme-light-only` / `.theme-dark-only` are driven by
            :root[data-theme] in globals.css.
          */}
          <Image
            src="/footerlogo.svg"
            alt="WAMOCON Academy GmbH · DiTeLe"
            width={189}
            height={43}
            className="theme-light-only h-[43px] w-auto"
          />
          <Image
            src="/footerlogo-dark.svg"
            alt=""
            aria-hidden
            width={189}
            height={43}
            className="theme-dark-only h-[43px] w-auto"
          />
          <nav aria-label={navLabel}>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {items.filter((i) => i.path !== "").map((item) => (
                <li key={item.path}>
                  <Link
                    href={`/${locale}${item.path}` as Route}
                    className="text-[13px] text-(--color-fg-muted) hover:text-(--color-brand) hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {/*
          An explicit <br />, because JSX collapses the newline in the source
          into a single space — the two lines below read as one sentence in the
          editor and rendered as one line in the browser.
        */}
        <p className="text-[13px] text-(--color-fg-subtle)">
          © {year} WAMOCON Academy GmbH
          <br />
          Alle Rechte vorbehalten.
        </p>
      </Container>
    </footer>
  );
}
