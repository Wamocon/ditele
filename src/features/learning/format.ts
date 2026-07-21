/**
 * Dates are stored UTC and rendered with `Intl` (MASTER_PLAN §13.4) — no date
 * library, none is needed.
 *
 * ⚠️ Only call the date helpers from a Server Component, or from a Client
 * Component after mount. Server and browser can sit in different time zones, and
 * formatting the same instant in both during hydration produces a mismatch.
 */

const TAGS: Record<string, string> = { de: "de-DE", en: "en-GB", ru: "ru-RU" };

const tag = (locale: string) => TAGS[locale] ?? "de-DE";

export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatTime(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(tag(locale), { timeStyle: "short" }).format(new Date(iso));
}

/** Percent complete, clamped, safe when the total is zero. */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
