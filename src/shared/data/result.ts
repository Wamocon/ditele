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

/**
 * The content-readiness assertions, by the sentence each one raises.
 *
 * `assert_content_version_render_ready` raises `23514` with a message written
 * to name exactly what is incomplete — "every stage requires complete
 * localizations and contiguous tasks", and seven others. `setCourseStateAction`
 * says in its own comment that it returns that message as-is "because it names
 * the actual problem"; it never got the chance, because `23514` is not in
 * MESSAGES and fell through to "Die Aktion konnte nicht ausgeführt werden."
 *
 * So an admin pressing "Activate course" on a course whose only stage has no
 * description was told nothing at all. Matched on a distinctive fragment rather
 * than the whole string, so a reworded assertion degrades to the generic
 * message instead of silently matching the wrong one.
 */
const READINESS: { fragment: string; code: string; message: string }[] = [
  {
    fragment: "course localization",
    code: "READY_COURSE_TEXTS",
    message: "Für die Freigabe müssen Titel, Kurzbeschreibung und Beschreibung des Kurses ausgefüllt sein.",
  },
  {
    fragment: "version-owned stage is required",
    code: "READY_NO_STAGE",
    message: "Der Kurs braucht mindestens einen Abschnitt.",
  },
  {
    fragment: "stage positions must be contiguous",
    code: "READY_STAGE_ORDER",
    message: "Die Reihenfolge der Abschnitte hat eine Lücke. Bitte sortieren Sie sie neu.",
  },
  {
    fragment: "every stage requires complete localizations",
    code: "READY_STAGE_TEXTS",
    message:
      "Jeder Abschnitt braucht einen Titel und eine Beschreibung und mindestens eine Aufgabe.",
  },
  {
    fragment: "tasks require complete localizations",
    code: "READY_TASK_TEXTS",
    message: "Jede Aufgabe braucht einen Titel, eine Anleitung und vollständige Hinweise.",
  },
  {
    fragment: "assessment options, selections and translations",
    code: "READY_ASSESSMENT",
    message: "Eine Wissensfrage ist unvollständig: Frage, Antwortoptionen oder die richtige Antwort fehlen.",
  },
  {
    fragment: "version-owned media must be active",
    code: "READY_MEDIA",
    message: "Ein hinterlegtes Medium ist nicht verfügbar.",
  },
  {
    fragment: "review rubric",
    code: "READY_RUBRIC",
    message: "Jede Praxisaufgabe braucht eine aktive Bewertungsvorlage.",
  },
];

export function mapPostgrestError(error: PostgrestError | null | undefined): DataError {
  if (!error) {
    return { code: "UNKNOWN", message: "Unbekannter Fehler.", retryable: true };
  }

  // Before MESSAGES: 23514 is `check_violation`, which the readiness assertions
  // use for eight quite different problems. The generic "a check failed" would
  // be true and useless.
  const readiness = READINESS.find((entry) => error.message?.includes(entry.fragment));
  if (readiness) {
    return { code: readiness.code, message: readiness.message, retryable: false };
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
  } catch {
    return err({
      code: "NETWORK",
      message: "Verbindung zum Server fehlgeschlagen.",
      retryable: true,
    });
  }
}
