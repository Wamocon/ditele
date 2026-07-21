// WS-5 probe 3 — audit_events writability + the shapes the admin screens read.
//   node --env-file=.env.local scripts/ws5-probe3.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);
const { data: auth } = await db.auth.signInWithPassword({
  email: "admin@ditele.local",
  password: "123123123",
});
const actorId = auth.user.id;
console.log("admin user id:", actorId);

console.log("\n── audit_events: can an admin session insert one? ──");
const insert = await db.from("audit_events").insert({
  organization_id: "01980a10-0000-7000-8000-000000000001",
  actor_id: actorId,
  actor_role: "content_admin",
  event_type: "content.probe",
  aggregate_type: "content_version",
  aggregate_id: crypto.randomUUID(),
  aggregate_version: 1,
  correlation_id: crypto.randomUUID(),
  metadata: { probe: true },
});
console.log(insert.error ? `❌ ${insert.error.code}: ${insert.error.message}` : "✅ insert ok");
if (!insert.error) {
  const del = await db.from("audit_events").delete().eq("event_type", "content.probe");
  console.log(del.error ? `  cleanup failed: ${del.error.message}` : "  cleanup ok");
}

console.log("\n── shapes the admin screens read ──");
for (const q of [
  ["courses", db.from("courses").select("*").limit(3)],
  ["course_localizations", db.from("course_localizations").select("*").limit(2)],
  [
    "content_versions",
    db.from("content_versions").select("id, course_id, version_number, state, change_summary, row_version, published_at, created_at").limit(5),
  ],
  ["stages", db.from("stages").select("*").limit(3)],
  ["tasks", db.from("tasks").select("*").limit(3)],
  ["task_localizations", db.from("task_localizations").select("*").limit(3)],
  ["task_assessments", db.from("task_assessments").select("*").limit(3)],
  ["task_options", db.from("task_options").select("*").limit(3)],
  ["task_skill_mappings", db.from("task_skill_mappings").select("*").limit(3)],
  ["skills", db.from("skills").select("id, code, labels, state").limit(5)],
  ["cohorts", db.from("cohorts").select("id, state, content_version_id").limit(5)],
  ["profiles", db.from("profiles").select("user_id, display_name").limit(3)],
  ["user_roles", db.from("user_roles").select("user_id, role_id, revoked_at").limit(10)],
  ["roles", db.from("roles").select("*").limit(10)],
  ["enrollments", db.from("enrollments").select("id, state").limit(10)],
  ["support_issues", db.from("support_issues").select("id, state").limit(3)],
  ["submissions", db.from("submissions").select("id, state").limit(3)],
]) {
  const [name, query] = q;
  const { data, error, count } = await query;
  if (error) console.log(`  ${name}: ❌ ${error.code} ${error.message}`);
  else
    console.log(
      `  ${name}: ${data.length} rows · keys ${JSON.stringify(Object.keys(data[0] ?? {}))}`
    );
}

console.log("\n── sample rows that matter ──");
const { data: cvs } = await db
  .from("content_versions")
  .select("id, course_id, version_number, state, row_version, change_summary, published_at")
  .order("version_number");
console.log("content_versions:", JSON.stringify(cvs, null, 1));
const { data: taskRow } = await db.from("tasks").select("*").limit(1).maybeSingle();
console.log("task:", JSON.stringify(taskRow));
const { data: assess } = await db.from("task_assessments").select("*").limit(1).maybeSingle();
console.log("task_assessment:", JSON.stringify(assess));
const { data: roleRows } = await db.from("roles").select("*");
console.log("roles:", JSON.stringify(roleRows));
await db.auth.signOut();
