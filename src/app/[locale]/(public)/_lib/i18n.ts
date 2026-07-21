import deMessages from "@/shared/i18n/messages/de.json";
import enMessages from "@/shared/i18n/messages/en.json";
import ruMessages from "@/shared/i18n/messages/ru.json";
import { defaultLocale, isLocale, type Locale } from "@/shared/i18n/config";

/**
 * WS-1's typed message accessor. Used by every `(public)` and `(auth)` page.
 *
 * Why this exists rather than `@/shared/i18n/get-messages`:
 * that helper types its return as `typeof en.json`, and the build rule is
 * **German only — never touch `en.json` or `ru.json`** (02_WORKSTREAMS §5.5).
 * So every key WS-1 writes exists in `de.json` and in no other file, and a
 * typed read through the shared helper would not compile.
 *
 * Here German is the *base* — it is the complete file — and the requested
 * locale is layered over it. A locale that has not been translated yet falls
 * back key by key to German instead of rendering `undefined`. When the EN/RU
 * translation pass lands, those strings light up with no page change.
 *
 * Filed for WS-7 as I-009: promote this into `src/shared/i18n/` once the
 * translation pass makes German and English the same shape again.
 */
export type Dict = typeof deMessages;

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Overlay wins only where it actually has the key AND the two agree on shape.
 * A stale translation file that still holds a string where German now holds an
 * object cannot break a page — the German subtree survives.
 */
function overlay(base: Plain, patch: unknown): Plain {
  if (!isPlainObject(patch)) return base;

  const merged: Plain = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = base[key];
    if (baseValue === undefined) continue;
    if (isPlainObject(baseValue)) {
      merged[key] = overlay(baseValue, patchValue);
    } else if (typeof baseValue === typeof patchValue && !isPlainObject(patchValue)) {
      merged[key] = patchValue;
    }
  }
  return merged;
}

const SOURCES: Record<Locale, unknown> = {
  de: deMessages,
  en: enMessages,
  ru: ruMessages,
};

const CACHE = new Map<Locale, Dict>();

/** Never throws. An unknown locale string falls back to German. */
export function getDict(locale: string): Dict {
  const key: Locale = isLocale(locale) ? locale : defaultLocale;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const dict =
    key === "de" ? deMessages : (overlay(deMessages as Plain, SOURCES[key]) as unknown as Dict);
  CACHE.set(key, dict);
  return dict;
}
