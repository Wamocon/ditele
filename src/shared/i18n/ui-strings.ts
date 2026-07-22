import de from "./messages/de.json";
import en from "./messages/en.json";
import ru from "./messages/ru.json";
import { overlayMessages } from "./overlay";

/**
 * The `common.*` and `errors.*` strings that shared UI primitives need.
 *
 * `get-messages.ts` is server-only, but `ErrorState` and friends render inside
 * client trees too — an `error.tsx` boundary is a Client Component by
 * definition. This is the isomorphic door to the same two namespaces.
 *
 * It exists because those primitives shipped with hardcoded German fallbacks
 * ("Etwas ist schiefgelaufen", "Erneut versuchen"), so every error path in the
 * app rendered German no matter the locale — the one screen where a learner is
 * already confused was the one screen that ignored their language.
 */
export type UiStrings = {
  common: (typeof de)["common"];
  errors: (typeof de)["errors"];
  /**
   * `learn.shared` — the load/save failure sentences. Here rather than only in
   * `features/learning/i18n.ts` so `shared/data` can reach them without
   * importing upwards into a feature.
   */
  learnShared: (typeof de)["learn"]["shared"];
};

const learnSharedOf = (bundle: Record<string, unknown>) =>
  ((bundle.learn as Record<string, unknown> | undefined)?.shared ?? undefined);

const BUNDLES: Record<string, UiStrings> = {
  de: { common: de.common, errors: de.errors, learnShared: de.learn.shared },
  // Laid over German per key, so an untranslated string falls back on its own
  // rather than dropping the whole namespace back to German.
  en: {
    common: overlayMessages(de.common, (en as Record<string, unknown>).common),
    errors: overlayMessages(de.errors, (en as Record<string, unknown>).errors),
    learnShared: overlayMessages(de.learn.shared, learnSharedOf(en as Record<string, unknown>)),
  },
  ru: {
    common: overlayMessages(de.common, (ru as Record<string, unknown>).common),
    errors: overlayMessages(de.errors, (ru as Record<string, unknown>).errors),
    learnShared: overlayMessages(de.learn.shared, learnSharedOf(ru as Record<string, unknown>)),
  },
};

export function uiStrings(locale: string | undefined): UiStrings {
  return (locale && BUNDLES[locale]) || BUNDLES.de!;
}

/**
 * A `DataError` code → the sentence to show the user, in their language.
 *
 * The data layer builds `DataError.message` at throw time, deep inside
 * `server-only` modules that have no locale, so every message it produced was
 * German and rendered verbatim — "Keine Berechtigung für diese Aktion." on an
 * otherwise English page. The code travels fine, so the translation happens
 * here, at render time, where the locale is known.
 *
 * Falls back to the message the data layer built, which is still better than a
 * blank box for a code nobody has mapped yet.
 */
export function dataErrorMessage(
  error: { code: string; message: string } | undefined | null,
  locale: string | undefined
): string {
  if (!error) return uiStrings(locale).errors.description;
  const map = uiStrings(locale).errors.data as Record<string, string | undefined>;
  return map[error.code] ?? error.message;
}
