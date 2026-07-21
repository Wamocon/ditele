// WS-4 — what the TRAINER session can actually read, and the real return shape
// of get_submission_review_context (RPC_CONTRACTS.md §5 marks it UNVERIFIED).
//
//   node --env-file=.env.local scripts/ws4-probe.mjs
//
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123";

async function session(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

const trainer = await session("trainer@ditele.local");
const admin = await session("admin@ditele.local");

const TABLES = [
  "profiles", "cohorts", "cohort_memberships", "enrollments", "attempts",
  "submissions", "submission_versions", "reviews", "questions", "question_messages",
  "tasks", "stages", "courses", "course_localizations", "content_versions",
  "task_hints", "attempt_hint_usage", "notifications", "user_roles", "ratings",
];

console.log("=== row counts per session ===");
for (const t of TABLES) {
  const out = [];
  for (const [label, c] of [["trainer", trainer], ["admin", admin]]) {
    const { data, error } = await c.from(t).select("*").limit(200);
    out.push(`${label}=${error ? "ERR " + error.code : data.length}`);
  }
  console.log(t.padEnd(24), out.join("  "));
}

console.log("\n=== trainer: sample rows ===");
for (const t of ["cohorts", "cohort_memberships", "questions", "question_messages", "submissions", "profiles", "reviews"]) {
  const { data, error } = await trainer.from(t).select("*").limit(2);
  console.log(`--- ${t}`, error ? error : JSON.stringify(data, null, 1));
}

console.log("\n=== trainer: RPC probes ===");
const probes = [
  ["list_visible_skill_prerequisites", {}],
  ["list_my_question_participant_contexts", {}],
  ["list_my_question_task_contexts", { p_locale: "de" }],
  ["list_my_available_question_contexts", { p_locale: "de" }],
];
for (const [name, args] of probes) {
  const { data, error } = await trainer.rpc(name, args);
  console.log(`--- ${name}`, error ? `ERR ${error.code} ${error.message}` : JSON.stringify(data)?.slice(0, 600));
}

// cohort-scoped pickers need a cohort id
const { data: cohorts } = await trainer.from("cohorts").select("id,name,state,course_id,row_version");
if (cohorts?.length) {
  const cid = cohorts[0].id;
  for (const name of ["list_active_cohort_trainers", "list_active_question_trainers"]) {
    const { data, error } = await trainer.rpc(name, { p_cohort_id: cid });
    console.log(`--- ${name}(${cid})`, error ? `ERR ${error.code} ${error.message}` : JSON.stringify(data));
  }
}

// the big one: the review context shape
const { data: subs } = await admin.from("submissions").select("id").limit(1);
console.log("\n=== get_submission_review_context ===");
if (!subs?.length) {
  console.log("NO SUBMISSIONS EXIST — cannot verify the shape (ISSUES.md I-006).");
  const { error } = await trainer.rpc("get_submission_review_context", {
    p_submission_id: "00000000-0000-0000-0000-000000000000",
    p_locale: "de",
  });
  console.log("call with a bogus id →", error ? `${error.code}: ${error.message}` : "(no error)");
} else {
  const { data, error } = await trainer.rpc("get_submission_review_context", {
    p_submission_id: subs[0].id,
    p_locale: "de",
  });
  console.log(error ? error : JSON.stringify(data, null, 1));
}
