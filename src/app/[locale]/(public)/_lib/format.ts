/**
 * WS-1 formatting helpers. Timestamps are stored UTC and rendered with
 * `Intl` (MASTER_PLAN §13.4) — never with a date library, and never with a
 * hand-rolled string. Unit labels are passed in so they stay in the i18n layer.
 */

const INTL_LOCALE: Record<string, string> = {
  de: "de-DE",
  en: "en-GB",
  ru: "ru-RU",
};

const intlLocale = (locale: string) => INTL_LOCALE[locale] ?? INTL_LOCALE.de ?? "de-DE";

/** "8 Std." · "90 Min." · "2 Std. 30 Min." — empty string when unknown. */
export function formatDuration(
  minutes: number | null | undefined,
  units: { hours: string; minutes: string }
): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} ${units.minutes}`;
  if (m === 0) return `${h} ${units.hours}`;
  return `${h} ${units.hours} ${m} ${units.minutes}`;
}

/** "21.07.2026" in German, localised elsewhere. Empty string when unknown. */
export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Strips tags from the RPC's `description_html` for use in a meta description. */
export function plainText(html: string | null | undefined, max = 160): string {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
