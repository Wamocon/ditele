// WS-4 — the exact shape of submission_versions.task_snapshot, plus what a
// trainer can read of evidence / attempt_hint_usage / task_hints.
//
//   node --env-file=.env.local scripts/ws4-probe2.mjs
//
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const c = createClient(url, anon, { auth: { persistSession: false } });
const { error } = await c.auth.signInWithPassword({
  email: "trainer@ditele.local",
  password: "123123123",
});
if (error) throw error;

const { data: v, error: e1 } = await c
  .from("submission_versions")
  .select("*")
  .limit(1);
console.log("=== submission_versions row ===");
console.log(e1 ?? JSON.stringify(v?.[0], null, 1).slice(0, 4000));

console.log("\n=== embedded select (queue query) ===");
const { data: q, error: e2 } = await c
  .from("submissions")
  .select(
    "id,state,created_at,updated_at,learner_id,task_id,cohort_id,latest_version_number,row_version,submission_versions(id,version_number,submitted_at,elapsed_seconds,hint_used,evidence_refs)"
  )
  .order("created_at", { ascending: true });
console.log(e2 ?? JSON.stringify(q, null, 1).slice(0, 2500));

console.log("\n=== trainer reads of the side tables ===");
for (const [t, sel] of [
  ["evidence", "*"],
  ["attempt_hint_usage", "*"],
  ["task_hints", "*"],
  ["reviews", "*"],
  ["submission_transfers", "*"],
  ["notifications", "*"],
]) {
  const { data, error: e } = await c.from(t).select(sel).limit(2);
  console.log(`--- ${t}`, e ? `ERR ${e.code} ${e.message}` : JSON.stringify(data).slice(0, 900));
}
