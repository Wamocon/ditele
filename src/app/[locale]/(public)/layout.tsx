import type { ReactNode } from "react";
import { AppShell } from "@/shared/layout";
import { getOptionalPrincipal } from "@/shared/auth/guard";

/** WS-0 owns this file. Public shell — works signed in or out. */
export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const guard = await getOptionalPrincipal();
  return (
    <AppShell locale={locale} role={guard?.uiRole ?? null}>
      {children}
    </AppShell>
  );
}
