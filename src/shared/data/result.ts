import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Never throw into a page. Every data function returns this.
 * Pages render ErrorState on `ok: false`.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: DataError };

export interface DataError {
  code: string;
  message: string;
  retryable: boolean;
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: DataError): Result<never> => ({ ok: false, error });

/**
 * Postgres / PostgREST error codes → German user-facing messages.
 * Codes observed on this deployment are documented in plan/status/RPC_CONTRACTS.md.
 */
const MESSAGES: Record<string, { message: string; retryable: boolean }> = {
  // Permission and RLS
  "42501": { message: "Keine Berechtigung für diese Aktion.", retryable: false },
  // Uniqueness
  "23505": { message: "Dieser Eintrag existiert bereits.", retryable: false },
  // Foreign key
  "23503": { message: "Der Eintrag verweist auf einen Datensatz, den es nicht gibt.", retryable: false },
  // Not-null
  "23502": { message: "Ein Pflichtfeld fehlt.", retryable: false },
  // Raised by the domain RPCs for invalid input / invalid transition
  "22023": { message: "Die Eingabe ist für diesen Schritt nicht gültig.", retryable: false },
  // PostgREST
  PGRST116: { message: "Nicht gefunden.", retryable: false },
  PGRST202: {
    message: "Diese Funktion ist nicht verfügbar. Bitte melden Sie den Fehler.",
    retryable: false,
  },
  PGRST205: { message: "Nicht gefunden.", retryable: false },
  PGRST003: {
    message: "Der Server ist gerade ausgelastet. Bitte versuchen Sie es erneut.",
    retryable: true,
  },
};

export function mapPostgrestError(error: PostgrestError | null | undefined): DataError {
  if (!error) {
    return { code: "UNKNOWN", message: "Unbekannter Fehler.", retryable: true };
  }

  const known = MESSAGES[error.code];
  if (known) return { code: error.code, message: known.message, retryable: known.retryable };

  // Optimistic-concurrency conflicts surface as a raised exception with the
  // RPC's own text. Show it — the domain messages are already meaningful.
  if (/version|conflict|concurren/i.test(error.message)) {
    return {
      code: error.code || "CONFLICT",
      message: "Der Datensatz wurde zwischenzeitlich geändert. Bitte laden Sie neu.",
      retryable: true,
    };
  }

  return {
    code: error.code || "UNKNOWN",
    message: "Die Aktion konnte nicht ausgeführt werden.",
    retryable: true,
  };
}

/** Wrap a Supabase call so callers never see a thrown error. */
export async function fromSupabase<T>(
  run: () => Promise<{ data: T | null; error: PostgrestError | null }>
): Promise<Result<T>> {
  try {
    const { data, error } = await run();
    if (error) return err(mapPostgrestError(error));
    if (data === null) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
    return ok(data);
  } catch (cause) {
    return err({
      code: "NETWORK",
      message: "Verbindung zum Server fehlgeschlagen.",
      retryable: true,
    });
  }
}
