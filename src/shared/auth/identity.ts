import "server-only";

import { cache } from "react";

import { requirePrincipal } from "./principal";

export interface HeaderIdentity {
  displayName: string;
  email: string | undefined;
  /** Kept for the header bell's prop shape; the notifications inbox was removed. */
  unreadCount: number;
}

/** Name + email for the header account menu. One profile read per request. */
export const getHeaderIdentity = cache(async (): Promise<HeaderIdentity> => {
  try {
    const principal = await requirePrincipal();
    return {
      displayName: principal.displayName || principal.email?.split("@")[0] || "Konto",
      email: principal.email ?? undefined,
      unreadCount: 0,
    };
  } catch {
    return { displayName: "Konto", email: undefined, unreadCount: 0 };
  }
});
