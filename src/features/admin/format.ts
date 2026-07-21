import {
  formatDate as sharedDate,
  formatDateTime as sharedDateTime,
  formatNumber,
} from "@/shared/format";

/**
 * WS-6's date helpers now delegate to `src/shared/format.ts` (WS-7 consistency
 * pass). The local version passed the bare locale (`"en"`) to Intl, which
 * resolves to en-US and renders `07/21/2026` — month first — while the student
 * and trainer sections rendered `21/07/2026` for the same instant. The shared
 * module pins en-GB so the day/month order never changes with the language.
 *
 * These keep returning `string | null` rather than an em dash, because every
 * WS-6 call site already branches on null to render its own copy
 * ("nie angemeldet", "kein Zeitplan").
 */

const usable = (value: string | null | undefined): value is string =>
  Boolean(value) && !Number.isNaN(new Date(value as string).getTime());

export function formatDate(value: string | null | undefined, locale: string): string | null {
  return usable(value) ? sharedDate(value, locale) : null;
}

export function formatDateTime(value: string | null | undefined, locale: string): string | null {
  return usable(value) ? sharedDateTime(value, locale) : null;
}

/** One decimal, locale-aware — used for the rating averages. */
export function formatAverage(value: number, locale: string): string {
  return formatNumber(value, locale, 1);
}

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm`, never an ISO Z string. */
export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** The inverse: a local datetime-local value back to a UTC ISO string. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
