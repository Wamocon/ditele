import type { ReactNode } from "react";
import { cn } from "@/shared/ui";
import type { UiRole } from "@/shared/auth/role";
import { AppHeader } from "./app-header";
import { AppFooter } from "./app-footer";
import { MobileTabBar } from "./mobile-tab-bar";
import { Container } from "./container";

export interface AppShellProps {
  locale: string;
  /** null = guest: no tab bar, footer visible on all sizes. */
  role: UiRole | null;
  displayName?: string | undefined;
  children: ReactNode;
  /** Set for full-bleed pages (the landing hero) that manage their own width. */
  bleed?: boolean;
}

export function AppShell({ locale, role, displayName, children, bleed = false }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader locale={locale} role={role} displayName={displayName} />

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
      {role && <MobileTabBar locale={locale} role={role} />}
    </div>
  );
}
