/**
 * Which navigation entry owns the current URL.
 *
 * The header and the mobile tab bar both used to decide this per item:
 *
 *     const active = pathname === href || pathname.startsWith(`${href}/`);
 *
 * That is true for *every* ancestor, not just the closest one. On
 * `/de/trainer/submissions` it lit up both "Reviews" (exact) and "Übersicht"
 * (because `/de/trainer` is a prefix), so two tabs looked selected at once and
 * two elements carried `aria-current="page"` — which is invalid, and leaves a
 * screen-reader user with no idea where they actually are.
 *
 * Longest match wins instead. `/de/trainer/submissions` beats `/de/trainer`,
 * and `/de/trainer/questions/archive` beats `/de/trainer/questions`, so the
 * most specific entry is the one that highlights. Deeper URLs that are not
 * themselves nav entries still resolve to their closest ancestor, so a task
 * detail page keeps its section tab lit.
 *
 * Matching runs over the *whole* role nav, not just the visible tabs. That way
 * a page reachable only from the "Mehr" sheet resolves to its own entry rather
 * than falling back onto the section root — "Übersicht" should not look
 * selected while you are reading "Verlauf".
 */

/** Trailing slashes are not meaningful here; `/de/learn/` and `/de/learn` are one page. */
function normalize(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * @param pathname  the current `usePathname()` value
 * @param hrefs     every candidate href, locale prefix included
 * @returns the winning href, referentially equal to the entry passed in, or
 *          `null` when the URL sits outside the navigation entirely
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  const current = normalize(pathname);
  let best: string | null = null;
  let bestLength = -1;

  for (const candidate of hrefs) {
    const href = normalize(candidate);
    if (current !== href && !current.startsWith(`${href}/`)) continue;
    if (href.length <= bestLength) continue;
    best = candidate;
    bestLength = href.length;
  }

  return best;
}
