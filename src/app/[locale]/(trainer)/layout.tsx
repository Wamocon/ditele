import type { ReactNode } from "react";
import { AppShell } from "@/shared/layout";
import { requireRole } from "@/shared/auth/guard";

/**
 * WS-0 owns this file. Wave-1 chats never create or edit a route-group layout —
 * that is what lets two chats share a route group safely.
 *
 * Layer 2 of three (MASTER_PLAN §9.3). The database is the real boundary and
 * every Server Action must re-check: a layout guard does not protect a POST.
 */
export default async function TrainerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { uiRole, principal } = await requireRole(["trainer", "admin"], locale);
  return (
    <AppShell locale={locale} role={uiRole} displayName={principal.userId}>
      {children}
    </AppShell>
  );
}
