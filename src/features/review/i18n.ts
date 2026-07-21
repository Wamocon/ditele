import "server-only";

import { getMessages } from "@/shared/i18n/get-messages";
import { defaultLocale, isLocale } from "@/shared/i18n/config";

/**
 * A dotted-key translator for the trainer screens.
 *
 * German is written into `messages/de.json` only (02_WORKSTREAMS §5.5 rule 1);
 * `en.json` and `ru.json` get one translation pass at the end. Until then a
 * missing key falls back to German rather than showing the raw key to a user.
 *
 * Server-only. Client components receive the strings they need as props — that
 * keeps every user-visible word in the i18n layer without shipping the whole
 * message catalogue to the browser.
 */

type Node = Record<string, unknown>;

function lookup(root: Node | null, key: string): string | undefined {
  let node: unknown = root;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Node)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export async function getTranslator(locale: string): Promise<Translate> {
  const target = isLocale(locale) ? locale : defaultLocale;
  const [messages, fallback] = await Promise.all([
    getMessages(target),
    target === defaultLocale ? Promise.resolve(null) : getMessages(defaultLocale),
  ]);

  return (key, vars) => {
    const template =
      lookup(messages as unknown as Node, key) ?? lookup(fallback as unknown as Node | null, key) ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match
    );
  };
}
