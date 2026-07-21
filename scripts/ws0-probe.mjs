// WS-0 Task 1b/1c — probe the live database.
//   * row counts per table with the service role (ground truth)
//   * row counts per table for each UI role (what RLS actually allows)
//   * real return shapes for every read-only RPC, called as the right role
//
//   node --env-file=.env.local scripts/ws0-probe.mjs > probe.json
//
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "123123123";

const CORE_TABLES = [
  "organizations", "profiles", "user_roles", "courses", "course_localizations",
  "content_versions", "stages", "stage_localizations", "tasks", "task_localizations",
  "task_options", "task_hints", "cohorts", "cohort_memberships", "enrollments",
  "attempts", "submissions", "reviews", "questions", "question_messages",
  "notifications", "ratings", "certificates", "support_issues", "audit_events",
  "task_evidence", "attempt_hint_usage",
];

const svc = createClient(url, service, { auth: { persistSession: false } });

// ---- describe the shape of a value, not its contents ----------------------
function shape(v, depth = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "[] (empty)";
    return [shape(v[0], depth + 1)];
  }
  if (typeof v === "object") {
    if (depth > 2) return "{…}";
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = shape(val, depth + 1);
    return o;
  }
  return typeof v;
}

const report = { counts: {}, rls: {}, rpc: {}, ids: {} };

// ---- 1. ground-truth row counts -------------------------------------------
for (const t of CORE_TABLES) {
  const { count, error } = await svc.from(t).select("*", { count: "exact" }).limit(1);
  report.counts[t] = error ? `ERR ${error.code}: ${error.message}` : count;
}

// ---- 2. grab sample ids we need to call RPCs with -------------------------
async function firstId(table, col = "id", filter) {
  let q = svc.from(table).select(col).limit(1);
  if (filter) q = q.match(filter);
  const { data, error } = await q;
  if (error || !data?.length) return null;
  return data[0][col];
}
report.ids.organization_id = await firstId("organizations");
report.ids.course_id = await firstId("courses");
report.ids.task_id = await firstId("tasks");
report.ids.cohort_id = await firstId("cohorts");
report.ids.enrollment_id = await firstId("enrollments");
report.ids.submission_id = await firstId("submissions");
report.ids.question_id = await firstId("questions");
report.ids.content_version_id = await firstId("content_versions");

// courses may carry a slug used by get_public_catalog_course
{
  const { data } = await svc.from("courses").select("*").limit(1);
  report.ids.courses_columns = data?.length ? Object.keys(data[0]) : [];
  report.ids.course_slug = data?.[0]?.slug ?? null;
}

// ---- 3. per-role: RLS counts + RPC return shapes --------------------------
const ROLES = {
  student: "learner@ditele.local",
  trainer: "trainer@ditele.local",
  admin: "admin@ditele.local",
};

// read-only RPCs, mapped to the args we will call them with
function readRpcs(ids) {
  return {
    get_public_catalog: { p_locale: "de" },
    get_public_catalog_course: ids.course_id ? { p_course_id: ids.course_id } : null,
    list_my_learning_courses: { p_locale: "de" },
    get_my_learning_course: ids.course_id ? { p_course_id: ids.course_id, p_locale: "de" } : null,
    get_my_learning_task: ids.task_id ? { p_task_id: ids.task_id } : null,
    list_my_learning_history: { p_limit: 10, p_locale: "de" },
    list_my_question_participant_contexts: {},
    list_my_question_task_contexts: { p_locale: "de" },
    list_my_available_question_contexts: { p_locale: "de" },
    list_visible_skill_prerequisites: {},
    get_submission_review_context: ids.submission_id
      ? { p_submission_id: ids.submission_id, p_locale: "de" } : null,
    list_active_cohort_trainers: ids.cohort_id ? { p_cohort_id: ids.cohort_id } : null,
    list_active_question_trainers: ids.cohort_id ? { p_cohort_id: ids.cohort_id } : null,
    get_content_archive_impact: ids.content_version_id
      ? { p_content_version_id: ids.content_version_id } : null,
    list_organization_member_profiles: ids.organization_id
      ? { p_organization_id: ids.organization_id } : null,
  };
}

// anon first — the guest surface
{
  const c = createClient(url, anon, { auth: { persistSession: false } });
  report.rls.anon = {};
  for (const t of CORE_TABLES) {
    const { count, error } = await c.from(t).select("*", { count: "exact" }).limit(1);
    report.rls.anon[t] = error ? `DENIED ${error.code}` : count;
  }
  report.rpc.anon = {};
  for (const [name, args] of Object.entries(readRpcs(report.ids))) {
    if (!args) { report.rpc.anon[name] = "SKIPPED (no id)"; continue; }
    const { data, error } = await c.rpc(name, args);
    report.rpc.anon[name] = error
      ? `ERR ${error.code}: ${error.message}`
      : { rows: Array.isArray(data) ? data.length : 1, shape: shape(data) };
  }
}

for (const [uiRole, email] of Object.entries(ROLES)) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: sess, error: authErr } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (authErr) { report.rls[uiRole] = `LOGIN FAILED: ${authErr.message}`; continue; }
  report.ids[`${uiRole}_user_id`] = sess.user.id;

  report.rls[uiRole] = {};
  for (const t of CORE_TABLES) {
    const { count, error } = await c.from(t).select("*", { count: "exact" }).limit(1);
    report.rls[uiRole][t] = error ? `DENIED ${error.code}` : count;
  }

  report.rpc[uiRole] = {};
  for (const [name, args] of Object.entries(readRpcs(report.ids))) {
    if (!args) { report.rpc[uiRole][name] = "SKIPPED (no id)"; continue; }
    const { data, error } = await c.rpc(name, args);
    report.rpc[uiRole][name] = error
      ? `ERR ${error.code}: ${error.message}`
      : { rows: Array.isArray(data) ? data.length : 1, shape: shape(data) };
  }
  await c.auth.signOut();
}

// ---- 4. what roles do the seeded users actually hold? ---------------------
{
  const { data } = await svc.from("user_roles").select("*");
  report.user_roles_rows = data ?? [];
}

console.log(JSON.stringify(report, null, 2));
