import { defaultLocale, isLocale, type Locale } from "@/shared/i18n/config";

/**
 * Date and name formatting shared by every WS-3 route.
 * Timestamps are stored UTC and rendered with Intl (MASTER_PLAN §13.4) — no
 * date library, per the frozen dependency list.
 */

const BCP47: Record<Locale, string> = {
  de: "de-DE",
  en: "en-GB",
  ru: "ru-RU",
};

export function intlLocale(locale: string): string {
  return BCP47[isLocale(locale) ? locale : defaultLocale];
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export type DayBucket = "today" | "yesterday" | "earlier";

/** Which day group a timestamp belongs to, in the viewer's own local time. */
export function dayBucket(iso: string, now: Date = new Date()): DayBucket {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return "today";
  if (time >= startOfToday - 86_400_000) return "yesterday";
  return "earlier";
}

/** "Lena Learner" → "LL". Used until avatar upload lands (P1). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
