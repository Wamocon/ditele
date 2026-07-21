import de from "@/shared/i18n/messages/de.json";

/**
 * The `learn.*` message subtree, typed from `messages/de.json`.
 *
 * Per MASTER_PLAN §11.0 every workstream writes **German only**; `en.json` and
 * `ru.json` get one dedicated translation pass at the end. Until that pass runs
 * they have no `learn` section, so every locale deliberately renders the German
 * strings — a real sentence beats a raw key on screen. When the translation pass
 * lands, this is the single place that changes.
 *
 * Isomorphic on purpose: the task workspace is a Client Component and needs the
 * same strings the server pages use, without threading forty props through it.
 */
export type LearnStrings = (typeof de)["learn"];

/** Add `en` and `ru` here when the translation pass fills in their `learn` block. */
const BUNDLES: Partial<Record<string, LearnStrings>> = { de: de.learn };

export function learnStrings(locale: string): LearnStrings {
  return BUNDLES[locale] ?? de.learn;
}

/** `format(s.course.progressValue, { done: 2, total: 7 })` → "2 von 7 Aufgaben erledigt" */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
