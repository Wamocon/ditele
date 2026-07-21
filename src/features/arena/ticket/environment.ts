/**
 * The Jira "Environment" field — browser and viewport, read from the real
 * browser so a trainer can reproduce what the student actually saw.
 *
 * Prefilled, never locked. A tester who is deliberately reproducing a bug on a
 * phone while filing from a laptop must be able to correct it, and the honest
 * value is whatever they type, not whatever `navigator` happens to say.
 *
 * No server imports, and every read is guarded: this module is imported by a
 * Client Component that Next.js also renders on the server, where `navigator`
 * and `window` do not exist.
 */

/**
 * The browser name and major version, derived from the UA string.
 *
 * Order matters. Every Chromium browser still claims "Chrome" in its UA, and
 * Edge additionally claims "Safari" — so the specific brands have to be tested
 * before the generic ones or Edge reports as Safari and Chrome reports as
 * itself only by luck. This is a display string for a human, not a feature
 * gate; nothing branches on it.
 */
function browserLabel(userAgent: string): string {
  const patterns: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Samsung Internet", /SamsungBrowser\/(\d+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ];
  for (const [name, pattern] of patterns) {
    const match = pattern.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return "";
}

/** The operating system, best effort, for the same human-reading purpose. */
function platformLabel(userAgent: string): string {
  if (/Windows NT 10/.test(userAgent)) return "Windows";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Android/.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Mac OS X/.test(userAgent)) return "macOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return "";
}

/**
 * `"Chrome 131 · Windows · 1440×900 · dark"` — one line, the four things that
 * change whether a defect reproduces.
 *
 * The theme token is the lowercase CSS keyword, not a translated word, and that
 * is deliberate rather than an i18n oversight. This string is a **prefilled
 * value inside a field the learner owns and edits**, not interface chrome; the
 * other three parts ("Chrome", "Windows", "1440×900") are untranslated
 * technical tokens too, and mixing one German word into them would read as a
 * bug. The field's label and hint, which *are* chrome, go through `de.json`.
 *
 * Returns `""` on the server or in any environment without a `navigator`, and
 * the caller treats that as "do not prefill" rather than writing an empty
 * string into the draft.
 */
export function describeEnvironment(): string {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "";

  const parts = [
    browserLabel(navigator.userAgent),
    platformLabel(navigator.userAgent),
    `${window.innerWidth}×${window.innerHeight}`,
  ].filter((part) => part.length > 0);

  // The theme changes what is on screen, so it changes what a screenshot shows
  // and occasionally whether a contrast defect reproduces at all. It lives on
  // <html data-theme>, stamped by the inline script in app/layout.tsx.
  parts.push(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

  return parts.join(" · ");
}
