"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/shared/data/session";

/**
 * Sign out and land on the public start page.
 *
 * A Server Action rather than a client `supabase.auth.signOut()` so the session
 * cookie is cleared server-side. A client sign-out leaves the httpOnly cookie in
 * place, which means the next server render still believes you are logged in.
 *
 * ⚠️ Only functions may be exported from a "use server" module. React turns any
 * non-function export into a server reference, so a constant read as `undefined`
 * on the client — the bug WS-1, WS-3 and WS-6 each hit independently.
 */
export async function signOutAction(locale: string): Promise<void> {
  await signOut();
  redirect(`/${locale}`);
}
