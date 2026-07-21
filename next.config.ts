import type { NextConfig } from "next";

/**
 * Origin of the external practice target embedded by IframePanel.
 * Read from env so go-live is one env edit, never a grep across the codebase.
 * The seeded task points at https://example.invalid/testing-target.
 */
const practiceTargetOrigin =
  process.env.NEXT_PUBLIC_PRACTICE_TARGET_ORIGIN ?? "https://example.invalid";

const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // frame-src governs what WE may embed — the practice target in IframePanel.
  // X-Frame-Options above governs who may embed US. They are not in conflict.
  { key: "Content-Security-Policy", value: `frame-src 'self' ${practiceTargetOrigin};` },
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
