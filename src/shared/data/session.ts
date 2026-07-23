import "server-only";

import { createServerClient } from "@/shared/database/server";
import { postAuthDestination, type UiRole } from "@/shared/auth/role";
import { requirePrincipal } from "@/shared/auth/principal";
import type { Principal } from "@/shared/auth/types";
import { ok, err, type Result } from "./result";

export { postAuthDestination };

export interface SessionPrincipal {
  principal: Principal;
  uiRole: UiRole;
  email: string | null;
  displayName: string | null;
}

/** null for a guest. Never throws. */
export async function getPrincipal(): Promise<SessionPrincipal | null> {
  try {
    const principal = await requirePrincipal();
    return {
      principal,
      uiRole: principal.role,
      email: principal.email,
      displayName: principal.displayName,
    };
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<Result<{ redirectTo: string }>> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Never disclose whether the address exists — same message either way.
    return err({
      code: error.status === 400 ? "INVALID_CREDENTIALS" : "AUTH",
      message: "E-Mail-Adresse oder Passwort ist nicht korrekt.",
      retryable: true,
    });
  }

  const session = await getPrincipal();
  if (!session) {
    return err({ code: "AUTH", message: "Anmeldung fehlgeschlagen.", retryable: true });
  }
  return ok({ redirectTo: postAuthDestination(session.uiRole) });
}

export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
}

export async function register(args: {
  email: string;
  password: string;
  displayName: string;
}): Promise<Result<{ needsConfirmation: boolean }>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: args.email,
    password: args.password,
    options: { data: { display_name: args.displayName } },
  });

  if (error) {
    return err({
      code: error.code ?? "AUTH",
      message: error.message.includes("already")
        ? "Für diese E-Mail-Adresse existiert bereits ein Konto."
        : "Registrierung fehlgeschlagen. Bitte prüfen Sie Ihre Eingaben.",
      retryable: true,
    });
  }
  return ok({ needsConfirmation: !data.session });
}
