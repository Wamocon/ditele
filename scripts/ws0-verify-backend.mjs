// WS-0 Task 1a — verify backend health and the seeded login password.
// Prints PASS/FAIL only. Never prints a key, token or password value.
//
//   node --env-file=.env.local scripts/ws0-verify-backend.mjs
//
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("MISSING ENV:", { url: !!url, anon: !!anon, service: !!service });
  process.exit(1);
}
console.log("URL host:", new URL(url).host);

// --- 1. health -------------------------------------------------------------
for (const path of ["/auth/v1/health", "/rest/v1/"]) {
  try {
    const r = await fetch(url + path, { headers: { apikey: anon } });
    console.log(`GET ${path} -> ${r.status}`);
  } catch (e) {
    console.log(`GET ${path} -> NETWORK ERROR: ${e.message}`);
  }
}

// --- 2. list the auth users we care about ----------------------------------
const admin = createClient(url, service, { auth: { persistSession: false } });
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.log("listUsers ERROR:", listErr.message);
} else {
  console.log(`\nauth.users total: ${list.users.length}`);
  for (const u of list.users) {
    console.log(
      `  ${u.email}  confirmed=${!!u.email_confirmed_at}  banned=${u.banned_until ?? "no"}  last_sign_in=${u.last_sign_in_at ?? "never"}`
    );
  }
}

// --- 3. try the candidate passwords ----------------------------------------
const ACCOUNTS = [
  "learner@ditele.local",
  "trainer@ditele.local",
  "admin@ditele.local",
  "org-admin@ditele.local",
];
// Order matters: seed_role_accounts.sql runs LAST and overwrites seed.sql's
// password with '123123123'. That file is the source of truth, not seed.sql.
const CANDIDATES = ["123123123", "Ditele-Local-2026!"];

console.log("\n--- login attempts ---");
const working = {};
for (const email of ACCOUNTS) {
  let ok = false;
  let lastErr = "";
  for (const pw of CANDIDATES) {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
    if (!error && data?.session) {
      console.log(`  ${email}: PASS  (candidate #${CANDIDATES.indexOf(pw) + 1})`);
      working[email] = pw;
      ok = true;
      await c.auth.signOut();
      break;
    }
    lastErr = error?.message ?? "no session returned";
  }
  if (!ok) console.log(`  ${email}: FAIL  (last error: ${lastErr})`);
}

console.log("\nRESULT:", Object.keys(working).length, "of", ACCOUNTS.length, "accounts logged in");
if (Object.keys(working).length) {
  const uniq = [...new Set(Object.values(working))];
  console.log("Working candidate index/indices:", uniq.map((p) => CANDIDATES.indexOf(p) + 1).join(", "));
}
