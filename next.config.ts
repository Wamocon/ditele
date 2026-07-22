import type { NextConfig } from "next";

/**
 * Origins the practice panel (`IframePanel`) is allowed to embed.
 *
 * ⚠️ **This defaulted to `https://example.invalid` and went to production that
 * way.** Every Arena task in the Praxiskurs points at
 * `https://shop.ditele-learn.ai/?taskid=…`, which was therefore NOT in
 * `frame-src`, so Chrome refused the frame and the learner got an empty grey
 * box. It survived a certificate renewal, an incognito window and a cache
 * clear, because none of those were the cause.
 *
 * The failure mode is the problem, not the value. A blocked frame produces no
 * server error, no failed request in the network tab worth noticing, and no
 * message on screen — only a blank panel that looks exactly like a slow or
 * broken remote site. "Go-live is one env edit" was true and was still missed,
 * so the default no longer depends on anyone remembering it.
 *
 * `example.invalid` stays in the list: the seeded fixture course points at it,
 * and dropping it would break the local seed to fix production.
 *
 * Override with `NEXT_PUBLIC_PRACTICE_TARGET_ORIGINS` — space- or
 * comma-separated, e.g. "https://shop.example.com https://staging.example.com".
 * Adding a practice target on a NEW origin means adding it here, or its panel
 * will be blank in the same silent way.
 */
const DEFAULT_PRACTICE_TARGET_ORIGINS = [
  "https://shop.ditele-learn.ai",
  "https://example.invalid",
];

const practiceTargetOrigins = (
  process.env.NEXT_PUBLIC_PRACTICE_TARGET_ORIGINS ??
  process.env.NEXT_PUBLIC_PRACTICE_TARGET_ORIGIN ??
  ""
)
  .split(/[\s,]+/)
  .map((origin) => origin.trim())
  .filter(Boolean);

const frameSources = (
  practiceTargetOrigins.length > 0
    ? practiceTargetOrigins
    : DEFAULT_PRACTICE_TARGET_ORIGINS
).join(" ");

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /**
   * ⭐ `SAMEORIGIN`, not `DENY` — changed by WS-13 under `ISSUES.md` I-049,
   * deliberately, because this is an app-wide security header and not a typo.
   *
   * `DENY` forbids framing outright, **including same-origin**. Decision D1
   * chose an in-app sandbox partly so the task workspace could frame it; with
   * `DENY` the practice panel rendered an empty box and a hunt was reachable
   * only by opening the sandbox in its own tab. WS-9 measured this with a real
   * iframe on a page already on the app origin, rather than inferring it.
   *
   * What is given up: a DiTeLe page may now frame another DiTeLe page. Framing
   * from any *other* origin is still refused, so the clickjacking case this
   * header exists for is unchanged — exploiting the difference needs an
   * attacker-controlled document on our own origin, and the only HTML sink we
   * have is admin-authored task instructions, written by people who already
   * hold far stronger powers.
   *
   * Rejected alternative: keep `DENY` globally and relax it only on
   * `/:locale/arena/sandbox/*`. Next applies every matching `headers()` rule,
   * so a per-route exception needs a negative lookahead on the *global* rule —
   * and one mistake in that pattern silently drops `nosniff`, COOP and
   * Referrer-Policy from the entire application. A narrower blast radius was
   * not worth a wider failure mode.
   */
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Two different directions, both stated explicitly:
  //   frame-src       — what WE may embed (the practice target in IframePanel)
  //   frame-ancestors — who may embed US, the modern replacement for
  //                     X-Frame-Options. Kept in step with it on purpose: where
  //                     both are present browsers may honour either, so they
  //                     must not disagree. That disagreement is what I-049 was.
  {
    key: "Content-Security-Policy",
    value: `frame-src 'self' ${frameSources}; frame-ancestors 'self';`,
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false,

  // Lets parallel chats run dev servers without corrupting each other's build
  // output. Each workstream exports NEXT_DIST_DIR=.next-ws<n>.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
