"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, BookOpen, CheckSquare, MessageCircle, MoreHorizontal, X } from "lucide-react";
import { cn } from "@/shared/ui";
import type { UiRole } from "@/shared/auth/role";
import { primaryNav, secondaryNav, type NavItem } from "./nav-config";
import { activeNavHref } from "./active-nav";

const ICONS = [Home, BookOpen, CheckSquare, MessageCircle];

export function MobileTabBar({
  locale,
  role,
  items,
  moreLabel = "Mehr",
}: {
  locale: string;
  role: UiRole;
  /** Locale-resolved nav from AppShell; falls back to the German config. */
  items?: NavItem[] | undefined;
  /** Translated sheet label; the German default matches the old hardcoding. */
  moreLabel?: string | undefined;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = items ? items.filter((i) => i.primary) : primaryNav(role);
  const rest = items ? items.filter((i) => !i.primary) : secondaryNav(role);

  // Resolved once against every entry, tabs and sheet alike, so the most
  // specific one wins instead of every ancestor lighting up at once.
  const currentHref = activeNavHref(
    pathname,
    [...tabs, ...rest].map((i) => `/${locale}${i.path}`)
  );

  // A route that lives in the "Mehr" sheet has no tab of its own, so the sheet
  // trigger carries the selected state. Without this the bar reads as though
  // nothing is open whenever the user is on a secondary page.
  const restIsActive = rest.some((i) => `/${locale}${i.path}` === currentHref);

  return (
    <>
      <nav
        aria-label="Hauptnavigation"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-(--color-border) bg-(--color-bg) lg:hidden",
          "pb-[env(safe-area-inset-bottom)]"
        )}
      >
        <ul className="flex h-(--tabbar-height) items-stretch">
          {tabs.map((item, i) => {
            const href = `/${locale}${item.path}`;
            const active = href === currentHref;
            const Icon = ICONS[i] ?? Home;
            return (
              <li key={item.path} className="flex-1">
                <Link
                  href={href as Route}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full min-h-11 flex-col items-center justify-center gap-1",
                    active ? "text-(--color-brand)" : "text-(--color-fg-muted)"
                  )}
                >
                  {active && (
                    <span className="absolute top-0 h-[3px] w-8 rounded-full bg-(--color-brand)" />
                  )}
                  <Icon className="size-5" aria-hidden />
                  <span className="text-[11px] font-semibold leading-none">{item.label}</span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cn(
                "relative flex h-full min-h-11 w-full flex-col items-center justify-center gap-1",
                restIsActive ? "text-(--color-brand)" : "text-(--color-fg-muted)"
              )}
            >
              {restIsActive && (
                <span className="absolute top-0 h-[3px] w-8 rounded-full bg-(--color-brand)" />
              )}
              <MoreHorizontal className="size-5" aria-hidden />
              <span className="text-[11px] font-semibold leading-none">{moreLabel}</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* "Mehr" bottom sheet — everything that does not fit in 4 tabs. */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Schließen"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 animate-fade-in bg-(--color-overlay)"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Weitere Navigation"
            className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-(--radius-xl) bg-(--color-bg) pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
              <span className="text-[15px] font-semibold">{moreLabel}</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Schließen"
                className="flex size-11 items-center justify-center rounded-(--radius-md) text-(--color-fg-muted)"
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-2">
              {rest.map((item) => (
                <li key={item.path}>
                  <Link
                    href={`/${locale}${item.path}` as Route}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-11 items-center rounded-(--radius-md) px-3 text-[15px] hover:bg-(--color-surface)"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
