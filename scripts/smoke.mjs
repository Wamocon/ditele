// ---------------------------------------------------------------------------
// WS-0 Task 7 — the one automated gate everybody runs.
//
//   node scripts/smoke.mjs                 # against http://127.0.0.1:3100
//   SMOKE_BASE_URL=http://127.0.0.1:3104 node scripts/smoke.mjs
//
// Logs in as each of the three roles, requests every route, and asserts a
// 2xx/3xx response with no "Application error" in the body. Prints a pass/fail
// table and exits non-zero on any failure.
//
// Run this BEFORE every commit. It catches the "route crashes on load" class of
// bug — by far the most common failure in a parallel build — across all six
// workstreams in about 20 seconds.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const LOCALE = process.env.SMOKE_LOCALE ?? "de";
const PASSWORD = "123123123";

// Seeded ids — see plan/status/RPC_CONTRACTS.md §11.
const COURSE = "01980a20-0000-7000-8000-000000000001";
const TASK = "01980a26-0000-7000-8000-000000000001";
const COHORT = "01980a30-0000-7000-8000-000000000001";
const SLUG = "practical-software-testing";

const GUEST = [
  "", "/catalog", `/catalog/${SLUG}`, "/about", "/faq", "/privacy", "/legal", "/403",
  "/login", "/register", "/reset-password", "/update-password",
];

const STUDENT = [
  "/learn", "/learn/courses", `/learn/courses/${COURSE}`, "/learn/tasks",
  `/learn/tasks/${TASK}`, "/learn/history", `/learn/enroll/${COURSE}`,
  "/learn/questions", "/learn/questions/new", "/learn/certificates",
  "/learn/notifications", "/learn/profile",
];

const TRAINER = [
  "/trainer", "/trainer/submissions", "/trainer/questions",
  "/trainer/questions/archive",
  "/trainer/progress", "/trainer/history", "/trainer/profile",
];

const ADMIN = [
  "/admin", "/admin/courses", "/admin/courses/new", `/admin/courses/${COURSE}`,
  "/admin/tasks", "/admin/users", "/admin/users/new", "/admin/applications", "/admin/issues",
  "/admin/settings", "/admin/profile",
];

const ROLES = [
  { name: "guest", email: null, paths: GUEST },
  { name: "student", email: "learner@ditele.local", paths: STUDENT },
  { name: "trainer", email: "trainer@ditele.local", paths: TRAINER },
  { name: "admin", email: "admin@ditele.local", paths: ADMIN },
];

/**
 * Sign in through Supabase and build the exact cookie @supabase/ssr expects.
 *
 * Three details that are easy to get wrong. Get any one wrong and the guarded
 * routes silently 307 to /login while the suite reports a green — 30 routes
 * "passing" without ever having rendered:
 *   1. Cookie name is `sb-${hostname.split(".")[0]}-auth-token`
 *      (supabase-js `defaultStorageKey`). For 192.168.178.75 that is `sb-192-…`.
 *   2. The payload is `base64-` + **base64URL** (not plain base64) of the JSON.
 *   3. Above 3180 chars it is split into `.0`, `.1`, … chunks, and the limit is
 *      measured on the URI-**encoded** length while the stored value is raw.
 *
 * We reuse the library's own `createChunks` so this can never drift from it.
 */
import { createChunks } from "@supabase/ssr";

async function cookieFor(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Missing Supabase env. Run with:  node --env-file=.env.local scripts/smoke.mjs");
    process.exit(2);
  }
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);

  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value =
    "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");

  return createChunks(key, value)
    .map((chunk) => `${chunk.name}=${encodeURIComponent(chunk.value)}`)
    .join("; ");
}

const results = [];

for (const role of ROLES) {
  let cookie = "";
  if (role.email) {
    try {
      cookie = await cookieFor(role.email);
    } catch (e) {
      results.push({ role: role.name, path: "(login)", status: "ERR", ok: false, note: e.message });
      continue;
    }
  }

  for (const path of role.paths) {
    const target = `${BASE}/${LOCALE}${path}`;
    try {
      const res = await fetch(target, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });
      const body = res.status < 400 ? await res.text() : "";
      const crashed = body.includes("Application error") || body.includes("Internal Server Error");

      // ⚠️ A signed-in role must actually RENDER its pages. If a guarded route
      // 3xx-redirects, the session cookie was not accepted — that is a failure,
      // not a pass. Treating a redirect as OK is how this suite reports a false
      // green over 30 routes that were never rendered.
      const redirected = res.status >= 300 && res.status < 400;
      const good = role.email
        ? res.status >= 200 && res.status < 300 && !crashed
        : res.status >= 200 && res.status < 400 && !crashed;

      results.push({
        role: role.name,
        path: path || "/",
        status: res.status,
        ok: good,
        note: crashed
          ? "Application error in body"
          : role.email && redirected
            ? `redirected to ${res.headers.get("location") ?? "?"} — session cookie rejected`
            : "",
      });
    } catch (e) {
      results.push({ role: role.name, path: path || "/", status: "ERR", ok: false, note: e.message });
    }
  }
}

// ── report ────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.path.length), 10);

let current = "";
for (const r of results) {
  if (r.role !== current) {
    current = r.role;
    console.log(`\n── ${current} ${"─".repeat(Math.max(0, 40 - current.length))}`);
  }
  console.log(`  ${r.ok ? "✅" : "❌"} ${r.path.padEnd(width)} ${r.status} ${r.note}`);
}

console.log(
  `\n${results.length - failed.length}/${results.length} routes OK` +
    (failed.length ? ` — ${failed.length} FAILED` : "")
);

if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  ${f.role} ${f.path} → ${f.status} ${f.note}`);
  process.exit(1);
}
