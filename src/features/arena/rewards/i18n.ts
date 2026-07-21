import "server-only";

import de from "@/shared/i18n/messages/de.json";
import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale, type Locale } from "@/shared/i18n/config";

/**
 * WS-11's message accessor — the sixth of these in the codebase, and it exists
 * for exactly the reason I-017 records: `getMessages()` types its result from
 * **en.json**, while the build rule is that new German goes into **de.json**.
 * So a key written today is invisible to the shared type until the EN/RU pass.
 *
 * This types against `de.json` and layers the requested locale on top per key,
 * so an untranslated string falls back to German rather than rendering
 * `undefined`. When EN/RU land, each translated key starts winning with no
 * change here.
 *
 * ⚠️ This is deliberate duplication, not an oversight. `RELEASE.md` §5.3 and
 * I-017 both say the six accessors should collapse into one shared helper
 * **during** the translation pass, not before it — consolidating now would be
 * churn across six trees with no user-visible effect, and it would put a shared
 * file in the path of five concurrent Arena chats.
 */
export type ArenaMessages = typeof de;

type MessageNode = { [key: string]: string | MessageNode };

function mergeInto(base: MessageNode, over: MessageNode): MessageNode {
  const out: MessageNode = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    if (typeof value === "object" && typeof current === "object") {
      out[key] = mergeInto(current, value);
    } else if (typeof value === "string" && value.length > 0) {
      // An empty translation is skipped, not written: a blank string renders as
      // nothing, which is strictly worse than the German it would replace.
      out[key] = value;
    }
  }
  return out;
}

export function toLocale(value: string): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export async function getArenaMessages(locale: string): Promise<ArenaMessages> {
  const resolved = toLocale(locale);
  if (resolved === defaultLocale) return de;
  const translated = await getMessages(resolved);
  return mergeInto(
    de as unknown as MessageNode,
    translated as unknown as MessageNode,
  ) as unknown as ArenaMessages;
}

/** `format("Noch {xp} XP", { xp: 253 })` → `"Noch 253 XP"`. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
