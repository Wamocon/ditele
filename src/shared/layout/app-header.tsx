"use client";

import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/shared/ui";
import type { UiRole } from "@/shared/auth/role";
import { navForRole, type NavItem } from "./nav-config";
import { activeNavHref } from "./active-nav";
import { NavOverflow } from "./nav-overflow";
import { Container } from "./container";
import { ThemeToggle } from "./theme-toggle";
import { AccountMenu } from "./account-menu";
import { LocaleSwitcher } from "./locale-switcher";
import { NotificationBell } from "./notification-bell";

export interface AppHeaderProps {
  locale: string;
  /** null = guest */
  role: UiRole | null;
  displayName?: string | undefined;
  email?: string | undefined;
  unreadCount?: number | undefined;
  /** Locale-resolved nav, computed server-side in AppShell. */
  items?: NavItem[] | undefined;
  /** Translated "Mehr" label for the desktop overflow menu. */
  moreLabel?: string | undefined;
  /** Translated "Anmelden" label for the guest sign-in button. */
  signInLabel?: string | undefined;
  /** Accessible name for the wordmark's go-home link. */
  brandHomeLabel?: string | undefined;
  /** Accessible name for the desktop nav landmark. */
  mainNavLabel?: string | undefined;
  /** Accessible names for the header controls, resolved in AppShell. */
  accountMenuLabel?: string | undefined;
  languageLabel?: string | undefined;
  languageNounLabel?: string | undefined;
  notificationsLabel?: string | undefined;
  notificationsUnreadLabel?: string | undefined;
  toLightLabel?: string | undefined;
  toDarkLabel?: string | undefined;
}

export function AppHeader({
  locale,
  role,
  displayName,
  email,
  unreadCount,
  items: navItems,
  moreLabel,
  // German defaults keep every existing caller rendering exactly as before;
  // AppShell passes the locale-resolved strings.
  signInLabel = "Anmelden",
  brandHomeLabel = "DiTeLe — zur Startseite",
  mainNavLabel = "Hauptnavigation",
  accountMenuLabel,
  languageLabel,
  languageNounLabel,
  notificationsLabel,
  notificationsUnreadLabel,
  toLightLabel,
  toDarkLabel,
}: AppHeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  // Bottom border and the scroll-progress bar only appear once you scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Prefer the locale-resolved list from AppShell; navForRole is the German
  // fallback for any caller that has not been updated.
  const nav = navItems ?? (role ? navForRole(role) : []);
  const items = nav.filter((i) => i.primary);
  // Everything the primary row does not show. Without a desktop home these were
  // unreachable above lg — the tab bar that used to carry them is lg:hidden.
  const overflow = nav.filter((i) => !i.primary);
  // Resolved once against the full nav, not per item — see active-nav.ts for why
  // a per-item prefix test marked every ancestor tab as selected.
  const currentHref = activeNavHref(
    pathname,
    nav.map((i) => `/${locale}${i.path}`)
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-(--header-height) backdrop-blur-[12px]",
        "bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)]",
        "transition-[border-color,box-shadow] duration-(--duration-base)",
        scrolled ? "border-b border-(--color-border)" : "border-b border-transparent"
      )}
    >
      <Container className="flex h-full items-center justify-between gap-4">
        <Link
          href={`/${locale}` as Route}
          /* The wordmark is only 17–32px tall, but it is the "go home" control on
             every route, so the hit area is padded out to the mandatory 44px on
             mobile without changing how the logo looks. */
          className="flex min-h-11 shrink-0 items-center lg:min-h-0"
          aria-label={brandHomeLabel}
        >
          <Image
            src="/logo.svg"
            alt="DiTeLe"
            width={167}
            height={17}
            priority
            className="hidden h-[17px] w-auto sm:block"
          />
          {/* mobilelogo.svg is 47×12, not the square its old props claimed. With
              width/height declared as 32×32 and rendered at h-8, `w-auto` gave
              it the real 3.92:1 ratio and it came out 125px wide — most of a
              320px viewport, which pushed the right-hand controls 9px off
              screen. Declared at its true size and rendered near 1:1. */}
          <Image
            src="/mobilelogo.svg"
            alt="DiTeLe"
            width={47}
            height={12}
            priority
            className="h-4 w-auto sm:hidden"
          />
        </Link>

        {/* Desktop nav — hidden below lg, where the tab bar takes over. */}
        <nav className="hidden lg:block" aria-label={mainNavLabel}>
          <ul className="flex items-center gap-1">
            {items.map((item) => {
              const href = `/${locale}${item.path}`;
              const active = href === currentHref;
              return (
                <li key={item.path}>
                  <Link
                    href={href as Route}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-(--header-height) items-center px-3 text-[15px] font-semibold",
                      "transition-colors duration-(--duration-base)",
                      active ? "text-(--color-brand)" : "text-(--color-fg) hover:text-(--color-brand)"
                    )}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-(--color-brand)" />
                    )}
                  </Link>
                </li>
              );
            })}

            {role && (
              <li>
                <NavOverflow
                  locale={locale}
                  items={overflow}
                  currentHref={currentHref}
                  label={moreLabel ?? "Mehr"}
                />
              </li>
            )}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {role === "student" && (
            <NotificationBell
              locale={locale}
              unread={unreadCount ?? 0}
              notificationsLabel={notificationsLabel}
              notificationsUnreadLabel={notificationsUnreadLabel}
            />
          )}
          <LocaleSwitcher
            locale={locale}
            languageLabel={languageLabel}
            languageNounLabel={languageNounLabel}
          />
          <ThemeToggle toLightLabel={toLightLabel} toDarkLabel={toDarkLabel} />
          {role ? (
            <AccountMenu
              locale={locale}
              role={role}
              displayName={displayName ?? "Konto"}
              email={email}
              accountMenuLabel={accountMenuLabel}
            />
          ) : (
            /* h-11 = the mandatory 44px mobile touch target (MASTER_PLAN §6.5).
               It relaxes to the header's 36px rhythm from lg up, where the
               pointer is a mouse. */
            <Link
              href={`/${locale}/login`}
              className="flex h-11 items-center rounded-(--radius-md) bg-(--color-brand) px-3 text-[13px] font-semibold text-(--color-brand-fg) hover:bg-(--color-brand-hover) lg:h-9"
            >
              {signInLabel}
            </Link>
          )}
        </div>
      </Container>
    </header>
  );
}
