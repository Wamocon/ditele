// WS-0 — dump the existing seeded rows so scripts/seed-mock.mjs can mirror
// their exact shape (enum values, jsonb layout, which columns are really set).
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(url, anon, { auth: { persistSession: false } });
await c.auth.signInWithPassword({ email: "admin@ditele.local", password: "123123123" });

const out = {};
for (const t of [
  "organizations", "courses", "course_localizations", "content_versions",
  "stages", "stage_localizations", "tasks", "task_localizations",
  "task_options", "task_hints", "cohorts", "cohort_memberships",
  "enrollments", "roles", "user_roles", "bug_categories",
]) {
  const { data, error } = await c.from(t).select("*").limit(3);
  out[t] = error ? `ERR ${error.code}: ${error.message}` : data;
}
console.log(JSON.stringify(out, null, 2));
