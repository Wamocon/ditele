/**
 * ONE date and number voice for the whole application.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Six workstreams each wrote their own `format.ts`, and each made a defensible
 * local choice. Together they produced three different dates on screen for the
 * same instant:
 *
 *   WS-1 · WS-3 · WS-4        `21.07.2026`     day/month 2-digit, year numeric
 *   WS-2                       `21. Juli 2026`  dateStyle: "medium"
 *   WS-5 · WS-6                `21.07.2026` in German — but `07/21/2026` under
 *                              `/en`, because they passed the bare locale
 *                              (`"en"` → en-US, month first) to Intl instead of
 *                              a BCP-47 tag.
 *
 * A learner comparing their history page (WS-3) with a course page (WS-2) saw
 * two different formats; an admin switching to `/en` saw the day and month swap
 * places halfway through the admin section. That is exactly the "six chats"
 * seam WS-7 exists to remove.
 *
 * ── The decisions, and they are not re-litigated per screen ─────────────────
 *   Locale tags   de → de-DE · en → en-GB · ru → ru-RU
 *                 en-GB, not en-US: day-first matches the German and Russian
 *                 order, so switching language never reorders the numbers.
 *   Date          `21.07.2026`   — the format five of six workstreams chose.
 *   Date + time   `21.07.2026, 14:30`  — 24-hour everywhere, which en-GB gives.
 *   Time          `14:30`
 *   Missing value `—` (em dash) by default. Callers that render a date inline
 *                 inside a sentence or a chip pass `fallback: ""` instead, so
 *                 an absent value collapses rather than leaving a stray dash.
 *
 * Timestamps are stored UTC and rendered with `Intl` (MASTER_PLAN §13.4).
 * No date library — that is the frozen dependency list (§6.1), and none is
 * needed.
 *
 * ⚠️ Call the date helpers from a Server Component, or from a Client Component
 * after mount. Server and browser can sit in different time zones, and
 * formatting the same instant in both during hydration produces a mismatch.
 */

/** BCP-47 tags. A locale we do not know falls back to German. */
const TAGS: Record<string, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU" };

export function intlTag(locale: string): string {
  return TAGS[locale] ?? "de-DE";
}

const DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

export interface FormatOptions {
  /** Rendered when the value is null, undefined or unparseable. Default `"—"`. */
  fallback?: string;
  /**
   * IANA zone to render in, e.g. `"Europe/Berlin"`. Omitted, the runtime's own
   * zone is used — which in a Server Component is the *server's*, not the
   * reader's.
   *
   * `profiles.timezone` has been a stored, editable setting since the first
   * schema and nothing ever read it, so the profile screen offered a control
   * that changed no pixel anywhere. Passing it here is what makes the field
   * mean something. Threading it through the rest of the application's dates is
   * a separate job; this is the parameter that job will use.
   *
   * An unknown zone makes `Intl` throw, so it is validated before use and
   * ignored if it is not a zone this runtime knows.
   */
  timeZone?: string | undefined;
}

function render(
  iso: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
  timeZone?: string | undefined
): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(intlTag(locale), {
      ...options,
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    // A zone the runtime does not recognise must not blank out a date that is
    // otherwise perfectly renderable.
    return new Intl.DateTimeFormat(intlTag(locale), options).format(date);
  }
}

/** `21.07.2026` */
export function formatDate(
  iso: string | null | undefined,
  locale: string,
  { fallback = "—", timeZone }: FormatOptions = {}
): string {
  return render(iso, locale, DATE, fallback, timeZone);
}

/** `21.07.2026, 14:30` */
export function formatDateTime(
  iso: string | null | undefined,
  locale: string,
  { fallback = "—", timeZone }: FormatOptions = {}
): string {
  return render(iso, locale, { ...DATE, ...TIME }, fallback, timeZone);
}

/** `14:30` */
export function formatTime(
  iso: string | null | undefined,
  locale: string,
  { fallback = "—", timeZone }: FormatOptions = {}
): string {
  return render(iso, locale, TIME, fallback, timeZone);
}

/** Locale-aware number with a fixed number of decimals — rating averages, scores. */
export function formatNumber(value: number, locale: string, decimals = 1): string {
  return new Intl.NumberFormat(intlTag(locale), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Fills `{name}` placeholders in a translated string.
 *
 * Every workstream wrote this function; they were identical apart from the name
 * (`format`, `fill`, `interpolate`). Counts and page numbers belong inside the
 * i18n layer rather than being concatenated in JSX, because a fragment order
 * that works in German does not survive translation.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
