import "server-only";

import de from "@/shared/i18n/messages/de.json";
import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale, type Locale } from "@/shared/i18n/config";

/**
 * WS-3's message accessor.
 *
 * It lives in `features/questions/` because that is the only `features/` folder
 * WS-3 owns, but every WS-3 route uses it — notifications, questions, profile,
 * enrol, history and certificates.
 *
 * Why it exists at all: `getMessages()` types its result from **en.json**, and
 * the build rule is that a workstream writes German into **de.json only**. So
 * the German keys WS-3 added are invisible to the shared type. This helper
 * types against de.json instead and layers the requested locale on top, which
 * means an untranslated key falls back to German rather than disappearing.
 * When the EN/RU translation pass fills the other two files, this keeps working
 * unchanged and each translated key starts winning automatically.
 */
export type Ws3Messages = typeof de;

type MessageNode = { [key: string]: string | MessageNode };

function mergeInto(base: MessageNode, over: MessageNode): MessageNode {
  const out: MessageNode = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    if (typeof value === "object" && typeof current === "object") {
      out[key] = mergeInto(current, value);
    } else if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

export function toLocale(value: string): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export async function getWs3Messages(locale: string): Promise<Ws3Messages> {
  const resolved = toLocale(locale);
  if (resolved === defaultLocale) return de;
  const translated = await getMessages(resolved);
  return mergeInto(
    de as unknown as MessageNode,
    translated as unknown as MessageNode
  ) as unknown as Ws3Messages;
}

/** `format("{count} ungelesen", { count: 3 })` → `"3 ungelesen"`. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
