// ---------------------------------------------------------------------------
// WS-5 probe — what can an ADMIN session actually do to authoring tables?
//
//   node --env-file=.env.local scripts/ws5-probe.mjs
//
// RPC_CONTRACTS.md §0.6 confirms direct insert works for courses,
// course_localizations and content_versions, and is refused for the domain
// tables. It says NOTHING about stages, stage_localizations, tasks,
// task_localizations, task_options or task_hints — and the whole Content Studio
// is built on those six. This script finds out, then cleans up after itself.
//
// Read-only on everything it does not create. Never deletes a pre-existing row.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123";

const ORG = "01980a10-0000-7000-8000-000000000001";
const PROBE_SLUG = "ws5-probe-course";

const db = createClient(url, anon, { auth: { persistSession: false } });

const findings = [];
function record(label, error) {
  const okish = !error;
  findings.push({ label, ok: okish, code: error?.code ?? "", message: error?.message ?? "" });
  console.log(`  ${okish ? "✅" : "❌"} ${label}${okish ? "" : ` — ${error.code}: ${error.message}`}`);
  return okish;
}

const { error: signInError } = await db.auth.signInWithPassword({
  email: "admin@ditele.local",
  password: PASSWORD,
});
if (signInError) {
  console.error("admin sign-in failed:", signInError.message);
  process.exit(1);
}
console.log("signed in as admin@ditele.local\n");

// Clean up a previous run before starting, so the probe is re-runnable.
const { data: stale } = await db.from("courses").select("id").eq("slug", PROBE_SLUG);
for (const row of stale ?? []) {
  await db.from("tasks").delete().eq("course_id", row.id);
  await db.from("stages").delete().eq("course_id", row.id);
  await db.from("content_versions").delete().eq("course_id", row.id);
  await db.from("course_localizations").delete().eq("course_id", row.id);
  await db.from("courses").delete().eq("id", row.id);
}

const courseId = crypto.randomUUID();
const versionId = crypto.randomUUID();
const stageId = crypto.randomUUID();
const taskId = crypto.randomUUID();

console.log("── 1. courses / course_localizations / content_versions ──");
const { error: cErr } = await db.from("courses").insert({
  id: courseId,
  organization_id: ORG,
  slug: PROBE_SLUG,
  default_locale: "de",
  estimated_minutes: 60,
  state: "draft",
});
const courseOk = record("insert courses", cErr);
if (!courseOk) process.exit(1);

record(
  "insert course_localizations",
  (
    await db.from("course_localizations").insert({
      course_id: courseId,
      locale: "de",
      title: "WS-5 Probe",
      summary: "Nur ein Test.",
      description_html: "<p>Test</p>",
      learning_outcomes: [],
    })
  ).error
);
record(
  "update courses",
  (await db.from("courses").update({ estimated_minutes: 90 }).eq("id", courseId)).error
);
record(
  "insert content_versions",
  (
    await db.from("content_versions").insert({
      id: versionId,
      course_id: courseId,
      version_number: 1,
      state: "draft",
      change_summary: "probe",
      snapshot: {},
    })
  ).error
);
record(
  "update content_versions.snapshot",
  (await db.from("content_versions").update({ change_summary: "probe 2" }).eq("id", versionId)).error
);

console.log("\n── 2. stages / stage_localizations ──");
record(
  "insert stages",
  (
    await db.from("stages").insert({
      id: stageId,
      course_id: courseId,
      content_version_id: versionId,
      position: 1,
      state: "draft",
    })
  ).error
);
record(
  "insert stage_localizations",
  (
    await db.from("stage_localizations").insert({
      stage_id: stageId,
      locale: "de",
      title: "Stufe 1",
      description_html: "<p>x</p>",
    })
  ).error
);
record("update stages", (await db.from("stages").update({ position: 2 }).eq("id", stageId)).error);

console.log("\n── 3. tasks / task_localizations / task_options / task_hints ──");
record(
  "insert tasks",
  (
    await db.from("tasks").insert({
      id: taskId,
      course_id: courseId,
      stage_id: stageId,
      content_version_id: versionId,
      position: 1,
      task_kind: "theory",
      expected_minutes: 15,
      state: "draft",
    })
  ).error
);
record(
  "insert task_localizations",
  (
    await db.from("task_localizations").insert({
      task_id: taskId,
      locale: "de",
      title: "Aufgabe 1",
      instructions_html: "<p>Anleitung</p>",
    })
  ).error
);
record(
  "insert task_options",
  (
    await db.from("task_options").insert({
      task_id: taskId,
      option_key: "a",
      position: 1,
      labels: { de: "Antwort A" },
    })
  ).error
);
record(
  "insert task_hints",
  (
    await db.from("task_hints").insert({
      task_id: taskId,
      position: 1,
      content_translations: { de: "Ein Hinweis" },
    })
  ).error
);
record(
  "update tasks",
  (await db.from("tasks").update({ target_url: "https://example.org" }).eq("id", taskId)).error
);
record(
  "insert task_model_answers",
  (
    await (async () => {
      const { data: loc } = await db
        .from("task_localizations")
        .select("id")
        .eq("task_id", taskId)
        .maybeSingle();
      if (!loc) return { error: { code: "NO_LOC", message: "no task_localization to attach to" } };
      return db
        .from("task_model_answers")
        .insert({ task_localization_id: loc.id, model_answer: "Musterlösung" });
    })()
  ).error
);

console.log("\n── 4. lifecycle RPCs on the probe version ──");
const { data: cv } = await db
  .from("content_versions")
  .select("row_version, state")
  .eq("id", versionId)
  .maybeSingle();
console.log(`  content_versions.row_version = ${cv?.row_version}, state = ${cv?.state}`);

const submitRes = await db.rpc("submit_content_for_review", {
  p_content_version_id: versionId,
  p_expected_version: cv?.row_version ?? 1,
  p_correlation_id: crypto.randomUUID(),
  p_idempotency_key: `ws5probe:submit:${versionId}`,
});
record("submit_content_for_review", submitRes.error);
if (!submitRes.error) console.log("     →", JSON.stringify(submitRes.data));

const { data: cv2 } = await db
  .from("content_versions")
  .select("row_version, state")
  .eq("id", versionId)
  .maybeSingle();
console.log(`  after submit: row_version = ${cv2?.row_version}, state = ${cv2?.state}`);

const decideRes = await db.rpc("decide_content_review", {
  p_content_version_id: versionId,
  p_decision: "approved",
  p_comment: "probe",
  p_expected_version: cv2?.row_version ?? 1,
  p_correlation_id: crypto.randomUUID(),
  p_idempotency_key: `ws5probe:decide:${versionId}`,
});
record("decide_content_review('approved')", decideRes.error);
if (!decideRes.error) console.log("     →", JSON.stringify(decideRes.data));

const { data: cv3 } = await db
  .from("content_versions")
  .select("row_version, state")
  .eq("id", versionId)
  .maybeSingle();
console.log(`  after decide: row_version = ${cv3?.row_version}, state = ${cv3?.state}`);

const publishRes = await db.rpc("publish_content_version", {
  p_content_version_id: versionId,
  p_expected_version: cv3?.row_version ?? 1,
  p_correlation_id: crypto.randomUUID(),
  p_idempotency_key: `ws5probe:publish:${versionId}`,
});
record("publish_content_version", publishRes.error);
if (!publishRes.error) console.log("     →", JSON.stringify(publishRes.data));

const { data: cv4 } = await db
  .from("content_versions")
  .select("row_version, state, snapshot")
  .eq("id", versionId)
  .maybeSingle();
console.log(`  after publish: row_version = ${cv4?.row_version}, state = ${cv4?.state}`);
console.log(
  `  snapshot keys after publish: ${JSON.stringify(Object.keys(cv4?.snapshot ?? {}))}`
);

const impactRes = await db.rpc("get_content_archive_impact", { p_content_version_id: versionId });
record("get_content_archive_impact", impactRes.error);
if (!impactRes.error) console.log("     →", JSON.stringify(impactRes.data));

console.log("\n── 5. existing seeded data shape ──");
for (const table of ["courses", "content_versions", "stages", "tasks"]) {
  const { data, error, count } = await db.from(table).select("*", { count: "exact" }).limit(1);
  if (error) console.log(`  ${table}: ERROR ${error.code} ${error.message}`);
  else console.log(`  ${table}: ${count} rows · sample keys ${JSON.stringify(Object.keys(data?.[0] ?? {}))}`);
}
const { data: realSnapshot } = await db
  .from("content_versions")
  .select("snapshot")
  .eq("id", "01980a22-0000-7000-8000-000000000001")
  .maybeSingle();
console.log(
  "  published snapshot top-level keys:",
  JSON.stringify(Object.keys(realSnapshot?.snapshot ?? {}))
);
console.log("  published snapshot (truncated):");
console.log(JSON.stringify(realSnapshot?.snapshot ?? {}, null, 1).slice(0, 2500));

console.log("\n── 6. cleanup ──");
record("delete task_hints", (await db.from("task_hints").delete().eq("task_id", taskId)).error);
record("delete task_options", (await db.from("task_options").delete().eq("task_id", taskId)).error);
record(
  "delete task_localizations",
  (await db.from("task_localizations").delete().eq("task_id", taskId)).error
);
record("delete tasks", (await db.from("tasks").delete().eq("id", taskId)).error);
record(
  "delete stage_localizations",
  (await db.from("stage_localizations").delete().eq("stage_id", stageId)).error
);
record("delete stages", (await db.from("stages").delete().eq("id", stageId)).error);
record(
  "delete content_versions",
  (await db.from("content_versions").delete().eq("id", versionId)).error
);
record(
  "delete course_localizations",
  (await db.from("course_localizations").delete().eq("course_id", courseId)).error
);
record("delete courses", (await db.from("courses").delete().eq("id", courseId)).error);

console.log("\n── SUMMARY ──");
for (const f of findings) {
  console.log(`${f.ok ? "PASS" : "FAIL"}  ${f.label}${f.ok ? "" : `  [${f.code}] ${f.message}`}`);
}
await db.auth.signOut();
