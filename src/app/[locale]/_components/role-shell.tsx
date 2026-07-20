import type { Route } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/[locale]/auth/actions";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import type { AppRole, Principal } from "@/shared/auth/types";
import type { Locale } from "@/shared/i18n/config";
import { getMessages } from "@/shared/i18n/get-messages";
import { AppShell, type ShellRole } from "@/shared/ui/app-shell";
import { StatePanel } from "@/shared/ui/state-panel";
import { createServerClient } from "@/shared/database/server";

import { getPrincipal } from "../_data/principal";

async function readDisplayName(principal: Principal): Promise<string> {
  const client = await createServerClient();
  const { data } = await client
    .from("profiles")
    .select("display_name")
    .eq("user_id", principal.userId)
    .maybeSingle();
  return data?.display_name?.trim() || principal.primaryRole.replaceAll("_", " ");
}

export function resolveShellRole(
  requestedRole: ShellRole,
  principalRoles: readonly AppRole[],
): ShellRole {
  if (
    requestedRole === "admin" &&
    !principalRoles.includes("admin") &&
    principalRoles.includes("content_admin")
  ) {
    return "contentAdmin";
  }

  return requestedRole;
}

export async function RoleShell({
  activeHref,
  allowedRoles,
  breadcrumb,
  children,
  locale,
  shellRole,
}: {
  activeHref: string;
  allowedRoles: readonly AppRole[];
  breadcrumb: string;
  children: ReactNode;
  locale: Locale;
  shellRole: ShellRole;
}) {
  let principal: Principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(
        `/${locale}/auth/login?next=${encodeURIComponent(activeHref)}` as Route,
      );
    }
    throw error;
  }

  const [messages, userName] = await Promise.all([
    getMessages(locale),
    readDisplayName(principal),
  ]);
  const permitted = allowedRoles.some((role) => principal.roles.includes(role));

  return (
    <AppShell
      activeHref={activeHref}
      breadcrumbs={breadcrumb}
      locale={locale}
      messages={messages}
      role={resolveShellRole(shellRole, principal.roles)}
      signOutAction={signOutAction}
      userName={userName}
    >
      {permitted ? (
        children
      ) : (
        <StatePanel
          description={messages.errors.forbiddenDescription}
          title={messages.errors.forbiddenTitle}
          tone="danger"
        />
      )}
    </AppShell>
  );
}
