import type { ReactNode } from "react";
import { cn } from "@/shared/ui";
import type { UiRole } from "@/shared/auth/role";
import { getMessages } from "@/shared/i18n/get-messages";
import { isLocale, defaultLocale } from "@/shared/i18n/config";
import { navForRole, PUBLIC_NAV, type NavItem } from "./nav-config";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { MobileTabBar } from "./mobile-tab-bar";
import { Container } from "./container";

export interface AppShellProps {
  locale: string;
  /** null = guest: no tab bar, footer visible on all sizes. */
  role: UiRole | null;
  displayName?: string | undefined;
  email?: string | undefined;
  unreadCount?: number | undefined;
  children: ReactNode;
  /** Set for full-bleed pages (the landing hero) that manage their own width. */
  bleed?: boolean;
}

/**
 * Resolve every nav label through the active locale.
 *
 * Done here, in a server component, because AppHeader and MobileTabBar are
 * client components with no access to the message catalogue. Without this the
 * nav renders its hardcoded German label in every locale.
 */
async function localiseNav(locale: string, items: NavItem[]): Promise<NavItem[]> {
  const active = isLocale(locale) ? locale : defaultLocale;
  if (active === defaultLocale) return items;

  const messages = await getMessages(active);
  const nav = messages.nav as Record<string, string | undefined>;

  return items.map((item) => {
    const translated = item.labelKey ? nav[item.labelKey] : undefined;
    return translated ? { ...item, label: translated } : item;
  });
}

export async function AppShell({ locale, role, displayName, email, unreadCount, children, bleed = false }: AppShellProps) {
  const items = await localiseNav(locale, role ? navForRole(role) : PUBLIC_NAV);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader locale={locale} role={role} items={items} displayName={displayName} email={email} unreadCount={unreadCount} />

      <main
        id="main"
        className={cn(
          "flex-1 animate-fade-in-up",
          // Clear the fixed mobile tab bar. Guests have no tab bar.
          role && "pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] lg:pb-0"
        )}
      >
        {bleed ? children : <Container className="py-6 lg:py-8">{children}</Container>}
      </main>

      <AppFooter locale={locale} />
      {role && <MobileTabBar locale={locale} role={role} items={items} />}
    </div>
  );
}
