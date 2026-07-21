/**
 * WS-1 formatting helpers. Timestamps are stored UTC and rendered with
 * `Intl` (MASTER_PLAN §13.4) — never with a date library, and never with a
 * hand-rolled string. Unit labels are passed in so they stay in the i18n layer.
 */

import { formatDate as sharedDate, interpolate as sharedInterpolate } from "@/shared/format";

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

/**
 * "21.07.2026" in German, localised elsewhere. Empty string when unknown —
 * these dates sit inline in catalog card meta, where an em dash would read as
 * a bug rather than as "no date".
 *
 * Delegates to `src/shared/format.ts` (WS-7 consistency pass).
 */
export function formatDate(iso: string | null | undefined, locale: string): string {
  return sharedDate(iso, locale, { fallback: "" });
}

/** Re-exported so WS-1's call sites keep their existing import. */
export const interpolate = sharedInterpolate;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const decode = (text: string) =>
  text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);

/** Strips tags from the RPC's `description_html` for use in a meta description. */
export function plainText(html: string | null | undefined, max = 160): string {
  if (!html) return "";
  const text = decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Turns `description_html` into an array of plain-text paragraphs.
 *
 * ⚠️ Deliberately **not** `dangerouslySetInnerHTML`. That field is authored
 * copy stored in `content_versions`, and rendering it raw on a page every
 * anonymous visitor sees turns one compromised author account into stored XSS
 * for the whole internet. No sanitiser may be added (dependencies are frozen),
 * and hand-rolling one is how sanitisers get bypassed — so the text is
 * projected instead: block boundaries become paragraphs, every tag is dropped.
 *
 * The cost is that links and emphasis inside a course description do not
 * survive. Recorded in `plan/status/WS-1.md`; if rich formatting is genuinely
 * needed, it wants a vetted sanitiser and a dependency decision, not a regex.
 */
export function richTextParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((line) => decode(line).replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}
