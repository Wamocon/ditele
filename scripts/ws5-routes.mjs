// WS-5 route check — every route this workstream owns, including the studio,
// which scripts/smoke.mjs does not cover (it has no sample versionId).
//
//   node --env-file=.env.local scripts/ws5-routes.mjs
//
// Same cookie construction as smoke.mjs; see its comment for why it is fiddly.
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3105").replace(/\/$/, "");
const LOCALE = "de";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(url, anon, { auth: { persistSession: false } });
const { data: session, error } = await db.auth.signInWithPassword({
  email: "admin@ditele.local",
  password: "123123123",
});
if (error) {
  console.error("sign-in failed:", error.message);
  process.exit(1);
}

const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const value = "base64-" + Buffer.from(JSON.stringify(session.session), "utf8").toString("base64url");
const cookie = createChunks(key, value)
  .map((chunk) => `${chunk.name}=${encodeURIComponent(chunk.value)}`)
  .join("; ");

// Every course and every content version, so the studio is exercised in all
// four lifecycle states rather than only the happy one.
const { data: courses } = await db.from("courses").select("id, slug").order("slug");
const { data: versions } = await db
  .from("content_versions")
  .select("id, course_id, state")
  .order("state");

const paths = ["/admin", "/admin/courses", "/admin/courses/new", "/admin/tasks"];
for (const course of courses ?? []) paths.push(`/admin/courses/${course.id}`);
for (const version of versions ?? []) {
  paths.push(`/admin/courses/${version.course_id}/versions/${version.id}`);
}

let failures = 0;
for (const path of paths) {
  const target = `${BASE}/${LOCALE}${path}`;
  try {
    const response = await fetch(target, { headers: { cookie }, redirect: "manual" });
    const body = response.status < 400 ? await response.text() : "";
    const crashed = body.includes("Application error") || body.includes("Diese Seite wird gerade gebaut");
    const redirected = response.status >= 300 && response.status < 400;
    const ok = response.status < 400 && !crashed && !redirected;
    if (!ok) failures += 1;
    const note = crashed
      ? body.includes("Application error")
        ? "APPLICATION ERROR"
        : "STILL A STUB"
      : redirected
        ? `redirect → ${response.headers.get("location")}`
        : "";
    console.log(`${ok ? "PASS" : "FAIL"}  ${response.status}  ${path}  ${note}`);
  } catch (e) {
    failures += 1;
    console.log(`FAIL  ERR  ${path}  ${e.message}`);
  }
}

console.log(`\n${paths.length - failures}/${paths.length} routes ok`);
process.exit(failures ? 1 : 0);
