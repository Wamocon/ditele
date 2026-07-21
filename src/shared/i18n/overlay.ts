/**
 * Per-key translation overlay — isomorphic, safe in Client Components.
 *
 * `get-messages.ts` is server-only, but the content studio and the task
 * workspace are client trees that need the same behaviour: take the German
 * bundle as the shape, lay the requested locale over it key by key, and fall
 * back to German wherever a translation is missing or blank.
 *
 * Per key, not per file. A namespace with one untranslated string must not
 * drop back to German wholesale, and a missing key must never reach the screen
 * as `undefined`.
 */
export function overlayMessages<T>(base: T, translation: unknown): T {
  if (translation === null || translation === undefined) return base;

  if (typeof base === "string") {
    // A blank translation counts as untranslated: translators leave gaps, and
    // an empty label is worse than a German one.
    return typeof translation === "string" && translation.trim() !== ""
      ? (translation as T)
      : base;
  }

  if (Array.isArray(base)) {
    // Only accept a same-length array; a half-translated list would silently
    // drop entries.
    return Array.isArray(translation) && translation.length === base.length
      ? (translation as T)
      : base;
  }

  if (typeof base === "object" && typeof translation === "object") {
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base as Record<string, unknown>)) {
      merged[key] = overlayMessages(value, (translation as Record<string, unknown>)[key]);
    }
    return merged as T;
  }

  return base;
}
