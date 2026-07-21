import de from "@/shared/i18n/messages/de.json";
import en from "@/shared/i18n/messages/en.json";
import ru from "@/shared/i18n/messages/ru.json";
import { overlayMessages } from "@/shared/i18n/overlay";

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

const BUNDLES: Record<string, AdminStrings> = {
  de: de.admin,
  // Laid over German per key, so an untranslated string falls back on its
  // own rather than dropping the whole namespace back to German.
  en: overlayMessages(de.admin, (en as Record<string, unknown>).admin),
  ru: overlayMessages(de.admin, (ru as Record<string, unknown>).admin),
};

export function adminStrings(locale: string): AdminStrings {
  return BUNDLES[locale] ?? de.admin;
}

/**
 * Re-exported from `src/shared/format.ts` (WS-7 consistency pass).
 *
 * The local version passed `locale === "de" ? "de-DE" : locale` to Intl, so
 * `/en` fell through to en-US and rendered `07/21/2026` — month first — while
 * WS-1, WS-3 and WS-4 rendered `21/07/2026` on the same screen flow. The shared
 * module pins en-GB so the day/month order never changes with the language.
 */
export { formatDate, interpolate as format } from "@/shared/format";
