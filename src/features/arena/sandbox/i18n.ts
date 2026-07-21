import de from "@/shared/i18n/messages/de.json";
import en from "@/shared/i18n/messages/en.json";
import ru from "@/shared/i18n/messages/ru.json";
import { overlayMessages } from "@/shared/i18n/overlay";

/**
 * The `arena.sandbox.*` message subtree — the **interface chrome** around the
 * sandbox, and only that.
 *
 * ⚠️ The line this file draws is the one that matters most in this workstream:
 *
 *  - **Chrome is interface.** The "Testumgebung" banner, the capture button,
 *    the error and empty states — de + en + ru, from here.
 *  - **What the learner tests is course material.** Product names, prices,
 *    form labels inside the fake shop are GERMAN ONLY
 *    (`CONTENT_LOCALES === ["de"]`) and come from the scenario's
 *    `configuration`, never from here. A learner reading an English checkout
 *    and reporting German copy as a bug is a false report, and false reports
 *    cost a trainer a real review.
 *
 * Isomorphic on purpose, same as `features/learning/i18n.ts`: the runtime is a
 * Client Component and needs the same strings the route does.
 *
 * ⚠️ WS-11 owns the Arena hub and will want message keys too. Namespace them
 * `arena.hub.*`; `arena.sandbox.*` is this workstream's.
 */
export type ArenaSandboxStrings = (typeof de)["arena"]["sandbox"];

/** The `sandbox` sub-object of a translation, or nothing if it has none. */
function sandboxSection(messages: unknown): unknown {
  const arena = (messages as Record<string, unknown> | undefined)?.arena;
  return (arena as Record<string, unknown> | undefined)?.sandbox;
}

const BUNDLES: Record<string, ArenaSandboxStrings> = {
  de: de.arena.sandbox,
  en: overlayMessages(de.arena.sandbox, sandboxSection(en)),
  ru: overlayMessages(de.arena.sandbox, sandboxSection(ru)),
};

export function sandboxStrings(locale: string): ArenaSandboxStrings {
  return BUNDLES[locale] ?? de.arena.sandbox;
}

/** `formatString(s.scenarioMeta, { code: "checkout-v1", version: 1 })` */
export function formatString(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
