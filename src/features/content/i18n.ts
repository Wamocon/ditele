import de from "@/shared/i18n/messages/de.json";

/**
 * The `admin.*` message subtree, typed from `messages/de.json`.
 *
 * Same shape as `src/features/learning/i18n.ts` so the two workstreams read the
 * same way. Per MASTER_PLAN §11.0 every workstream writes **German only**;
 * `en.json` and `ru.json` get one dedicated translation pass at the end, so
 * until then every locale deliberately renders German — a real sentence beats a
 * raw key on screen. When that pass lands, `BUNDLES` is the only thing to change.
 *
 * Isomorphic on purpose: the content studio is a Client Component tree and needs
 * the same strings the server pages use.
 */
export type AdminStrings = (typeof de)["admin"];

/** Add `en` and `ru` here when the translation pass fills in their `admin` block. */
const BUNDLES: Partial<Record<string, AdminStrings>> = { de: de.admin };

export function adminStrings(locale: string): AdminStrings {
  return BUNDLES[locale] ?? de.admin;
}

/** One date format across every WS-5 screen. Timestamps are stored UTC. */
export function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** `format(s.courses.versionCount, { count: 3 })` → "3 Versionen" */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
