// WS-0 Task 1b (round 2) — the service role has NO table grants on this
// deployment, so all discovery runs through the authenticated admin session.
//
//   node --env-file=.env.local scripts/ws0-probe2.mjs > probe2.json
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

function shape(v, depth = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : "[] (empty)";
  if (typeof v === "object") {
    if (depth > 3) return "{…}";
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = shape(val, depth + 1);
    return o;
  }
  return typeof v;
}

const out = { ids: {}, columns: {}, rpc: {}, writeTest: {} };
const admin = await session("admin@ditele.local");
const student = await session("learner@ditele.local");
const trainer = await session("trainer@ditele.local");

// ---- discover ids + real column lists via the admin session ---------------
for (const t of [
  "organizations", "courses", "content_versions", "stages", "tasks", "task_options",
  "task_hints", "cohorts", "cohort_memberships", "enrollments", "attempts",
  "submissions", "questions", "notifications", "profiles", "user_roles",
  "course_localizations", "task_localizations", "ratings", "support_issues",
]) {
  const { data, error } = await admin.from(t).select("*").limit(2);
  if (error) { out.columns[t] = `ERR ${error.code}: ${error.message}`; continue; }
  out.columns[t] = data.length ? Object.keys(data[0]) : "[] (no rows)";
  if (data.length) out.ids[t] = data[0].id ?? null;
}
// the learner owns its own enrollment/attempt; read those as the learner
for (const t of ["enrollments", "attempts", "notifications"]) {
  const { data } = await student.from(t).select("*").limit(1);
  if (data?.length) {
    out.ids[`student_${t}`] = data[0].id;
    out.columns[`student_${t}`] = Object.keys(data[0]);
  }
}

// ---- call the read RPCs with real ids -------------------------------------
const ids = out.ids;
const CALLS = [
  ["anon-catalog", null, "get_public_catalog", { p_locale: "de" }],
  ["anon-catalog-course", null, "get_public_catalog_course", { p_course_id: ids.courses }],
  ["student", student, "list_my_learning_courses", { p_locale: "de" }],
  ["student", student, "get_my_learning_course", { p_course_id: ids.courses, p_locale: "de" }],
  ["student", student, "get_my_learning_task", { p_task_id: ids.tasks }],
  ["student", student, "list_my_learning_history", { p_limit: 10, p_locale: "de" }],
  ["student", student, "list_my_available_question_contexts", { p_locale: "de" }],
  ["student", student, "list_my_question_participant_contexts", {}],
  ["trainer", trainer, "list_active_cohort_trainers", { p_cohort_id: ids.cohorts }],
  ["trainer", trainer, "list_active_question_trainers", { p_cohort_id: ids.cohorts }],
  ["trainer", trainer, "get_submission_review_context", { p_submission_id: ids.submissions, p_locale: "de" }],
  ["admin", admin, "get_content_archive_impact", { p_content_version_id: ids.content_versions }],
  ["admin", admin, "list_organization_member_profiles", { p_organization_id: ids.organizations }],
  ["admin", admin, "list_visible_skill_prerequisites", {}],
];
for (const [label, client, name, args] of CALLS) {
  const c = client ?? createClient(url, anon, { auth: { persistSession: false } });
  if (Object.values(args).some((v) => v === undefined || v === null)) {
    out.rpc[`${label}:${name}`] = "SKIPPED (missing id)";
    continue;
  }
  const { data, error } = await c.rpc(name, args);
  out.rpc[`${label}:${name}`] = error
    ? `ERR ${error.code}: ${error.message}`
    : { rows: Array.isArray(data) ? data.length : 1, shape: shape(data) };
}

// ---- can the admin session WRITE? this decides how we seed ----------------
{
  const probeSlug = `ws0-write-probe-${Date.now()}`;
  const { data, error } = await admin
    .from("courses")
    .insert({ slug: probeSlug, organization_id: ids.organizations })
    .select();
  out.writeTest.courses_insert = error
    ? `ERR ${error.code}: ${error.message}${error.hint ? " | hint: " + error.hint : ""}${error.details ? " | details: " + error.details : ""}`
    : `OK id=${data?.[0]?.id}`;
  if (!error && data?.[0]?.id) {
    const del = await admin.from("courses").delete().eq("id", data[0].id);
    out.writeTest.courses_delete = del.error ? `ERR ${del.error.code}: ${del.error.message}` : "OK (cleaned up)";
  }
}

console.log(JSON.stringify(out, null, 2));
