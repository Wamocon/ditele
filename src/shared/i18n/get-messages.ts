import "server-only";

import deMessages from "./messages/de.json";
import { defaultLocale, type Locale } from "./config";

/**
 * German is the source of truth for the message catalogue.
 *
 * This used to be `typeof enMessages`, which had the relationship backwards.
 * The build rule is "write German into de.json only, leave en.json alone", so
 * every workstream wrote keys it could not then type-read (I-017), and the
 * moment de.json grew past en.json the shared `tsc` gate went red for everyone
 * (I-020/I-021). Comparing two 1000-key literal object types is also what
 * pushed `tsc --noEmit` into a heap overflow.
 *
 * Now: German defines the shape; other locales are a deep partial of it.
 */
export type Messages = typeof deMessages;

/** A locale may translate as much or as little of the catalogue as it likes. */
export type PartialMessages = DeepPartial<Messages>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const loaders: Record<Exclude<Locale, "de">, () => Promise<{ default: unknown }>> = {
  en: () => import("./messages/en.json"),
  ru: () => import("./messages/ru.json"),
};

/**
 * Overlay a translation on the German base, key by key.
 *
 * Per-key rather than per-file: an untranslated string falls back to German on
 * its own, instead of dragging its whole namespace down. That is what makes a
 * partial translation shippable — and without it, switching to English renders
 * `undefined` wherever a key is missing.
 *
 * An empty string counts as untranslated. Translators leave blanks, and a blank
 * label is worse than a German one.
 */
function overlay<T>(base: T, translation: unknown): T {
  if (translation === null || translation === undefined) return base;

  if (typeof base === "string") {
    return typeof translation === "string" && translation.trim() !== ""
      ? (translation as T)
      : base;
  }

  if (Array.isArray(base)) {
    // Only take a translated array if it is the same shape; a half-translated
    // list would silently drop entries.
    return Array.isArray(translation) && translation.length === base.length
      ? (translation as T)
      : base;
  }

  if (typeof base === "object" && typeof translation === "object") {
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base as Record<string, unknown>)) {
      merged[key] = overlay(value, (translation as Record<string, unknown>)[key]);
    }
    return merged as T;
  }

  return base;
}

export async function getMessages(locale: Locale): Promise<Messages> {
  if (locale === defaultLocale) return deMessages;

  const loader = loaders[locale as Exclude<Locale, "de">];
  if (!loader) return deMessages;

  try {
    const loaded = (await loader()) as { default: PartialMessages };
    return overlay(deMessages, loaded.default);
  } catch {
    // A malformed or missing translation file must never take the app down.
    return deMessages;
  }
}
