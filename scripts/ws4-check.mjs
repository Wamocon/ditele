// WS-4 — render a trainer route with a real session and grep the HTML.
// smoke.mjs only asserts "did not crash"; this asserts "the data is on the page".
//
//   node --env-file=.env.local scripts/ws4-check.mjs /trainer/submissions "Review-Queue"
//
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";

const BASE = (process.env.WS4_BASE_URL ?? "http://127.0.0.1:3104").replace(/\/$/, "");
const LOCALE = process.env.WS4_LOCALE ?? "de";
const PASSWORD = "123123123";
const EMAIL = process.env.WS4_EMAIL ?? "trainer@ditele.local";

const [path = "/trainer", ...expected] = process.argv.slice(2);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (error) throw error;

const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const value = "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
const cookie = createChunks(key, value)
  .map((chunk) => `${chunk.name}=${encodeURIComponent(chunk.value)}`)
  .join("; ");

const target = `${BASE}/${LOCALE}${path}`;
const res = await fetch(target, { headers: { cookie }, redirect: "manual" });
const body = res.status < 400 ? await res.text() : "";

console.log(`${res.status}  ${target}  (${body.length} bytes)`);
if (res.status >= 300 && res.status < 400) console.log("→ redirect to", res.headers.get("location"));
if (body.includes("Application error")) console.log("❌ Application error in the body");
if (body.includes("Diese Seite wird gerade gebaut")) console.log("⚠️  still the WS-0 stub");

let failed = false;
for (const needle of expected) {
  const hit = body.includes(needle);
  if (!hit) failed = true;
  console.log(`${hit ? "✅" : "❌"} ${needle}`);
}

if (process.env.WS4_DUMP) {
  console.log(
    body
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, Number(process.env.WS4_DUMP))
  );
}

process.exit(failed || res.status >= 300 ? 1 : 0);
