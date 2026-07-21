// ---------------------------------------------------------------------------
// WS-5 probe 2 — can an admin session author a version all the way to PUBLISHED?
//
//   node --env-file=.env.local scripts/ws5-probe2.mjs [--keep]
//
// Probe 1 proved courses / course_localizations / content_versions / stages /
// stage_localizations accept a direct admin insert. It failed on `tasks` because
// task_kind must be one of practical | knowledge | placement, which cascaded into
// false RLS failures on the task child tables.
//
// This one walks the REAL happy path derived from
// app_private.assert_content_version_ready (migration …099200 line 781 and
// …099600 line 592):
//
//   course + 3 localizations (en/de/ru, all non-empty)
//   → content_version (draft)
//   → stages, positions CONTIGUOUS FROM 0, 3 localizations each
//   → tasks per stage, positions contiguous from 0, 3 localizations each
//   → task_skill_mappings summing to exactly 10000 basis points, one mapping_version
//   → submit_content_for_review → decide_content_review('approved')
//   → publish_content_version
//
// Deletes everything it created unless --keep is passed.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const KEEP = process.argv.includes("--keep");
const ORG = "01980a10-0000-7000-8000-000000000001";
const SLUG = "ws5-probe-lifecycle";

const db = createClient(url, anon, { auth: { persistSession: false } });
const uuid = () => crypto.randomUUID();
const key = (label) => `ws5probe-${label}-${SLUG}`.slice(0, 200); // must be 16..200 chars

function show(label, error, extra) {
  console.log(`  ${error ? "❌" : "✅"} ${label}${error ? ` — ${error.code}: ${error.message}` : extra ? ` — ${extra}` : ""}`);
  return !error;
}

const { error: authError } = await db.auth.signInWithPassword({
  email: "admin@ditele.local",
  password: "123123123",
});
if (authError) {
  console.error("admin sign-in failed:", authError.message);
  process.exit(1);
}

/* ── cleanup any previous run ─────────────────────────────────────────── */
async function purge() {
  const { data: rows } = await db.from("courses").select("id").eq("slug", SLUG);
  for (const row of rows ?? []) {
    const { data: tasks } = await db.from("tasks").select("id").eq("course_id", row.id);
    for (const t of tasks ?? []) {
      await db.from("task_skill_mappings").delete().eq("task_id", t.id);
      await db.from("task_option_answers").delete().eq("task_option_id", t.id);
      await db.from("task_hints").delete().eq("task_id", t.id);
      await db.from("task_options").delete().eq("task_id", t.id);
      await db.from("task_assessments").delete().eq("task_id", t.id);
      await db.from("task_localizations").delete().eq("task_id", t.id);
    }
    await db.from("tasks").delete().eq("course_id", row.id);
    const { data: stages } = await db.from("stages").select("id").eq("course_id", row.id);
    for (const s of stages ?? []) await db.from("stage_localizations").delete().eq("stage_id", s.id);
    await db.from("stages").delete().eq("course_id", row.id);
    await db.from("content_versions").delete().eq("course_id", row.id);
    await db.from("course_localizations").delete().eq("course_id", row.id);
    const { error } = await db.from("courses").delete().eq("id", row.id);
    if (error) console.log(`  ⚠️ could not delete course ${row.id}: ${error.code} ${error.message}`);
  }
}
await purge();

/* ── 0. what skills exist? ───────────────────────────────────────────── */
console.log("── 0. skills available for a mapping ──");
const { data: skills, error: skillErr } = await db
  .from("skills")
  .select("id, code, state, organization_id")
  .eq("state", "active")
  .limit(5);
show("read skills", skillErr, `${skills?.length ?? 0} active`);
console.log("   ", JSON.stringify(skills ?? []));
const skillId = skills?.[0]?.id;
if (!skillId) {
  console.error("no active skill — a task can never satisfy the 10000-point rule. Stopping.");
  process.exit(1);
}

/* ── 1. course + 3 localizations ─────────────────────────────────────── */
console.log("\n── 1. course ──");
const courseId = uuid();
show(
  "insert courses",
  (
    await db.from("courses").insert({
      id: courseId,
      organization_id: ORG,
      slug: SLUG,
      default_locale: "de",
      estimated_minutes: 120,
      state: "active",
    })
  ).error
);
show(
  "insert 3 course_localizations",
  (
    await db.from("course_localizations").insert(
      ["de", "en", "ru"].map((locale) => ({
        course_id: courseId,
        locale,
        title: `WS-5 Lifecycle Probe (${locale})`,
        summary: `Summary ${locale}`,
        description_html: `<p>Description ${locale}</p>`,
        learning_outcomes: ["A"],
      }))
    )
  ).error
);

/* ── 2. content version ──────────────────────────────────────────────── */
console.log("\n── 2. content version ──");
const versionId = uuid();
show(
  "insert content_versions (draft, v1)",
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

/* ── 3. stage, position 0, 3 localizations ───────────────────────────── */
console.log("\n── 3. stage ──");
const stageId = uuid();
show(
  "insert stages (position 0)",
  (
    await db.from("stages").insert({
      id: stageId,
      course_id: courseId,
      content_version_id: versionId,
      position: 0,
      state: "draft",
    })
  ).error
);
show(
  "insert 3 stage_localizations",
  (
    await db.from("stage_localizations").insert(
      ["de", "en", "ru"].map((locale) => ({
        stage_id: stageId,
        locale,
        title: `Stufe 1 (${locale})`,
        description_html: `<p>Stage ${locale}</p>`,
      }))
    )
  ).error
);

/* ── 4. task, position 0, 3 localizations, skill mapping ─────────────── */
console.log("\n── 4. task ──");
const taskId = uuid();
show(
  "insert tasks (task_kind 'knowledge', position 0)",
  (
    await db.from("tasks").insert({
      id: taskId,
      course_id: courseId,
      stage_id: stageId,
      content_version_id: versionId,
      position: 0,
      task_kind: "knowledge",
      expected_minutes: 20,
      state: "draft",
    })
  ).error
);
show(
  "insert 3 task_localizations",
  (
    await db.from("task_localizations").insert(
      ["de", "en", "ru"].map((locale) => ({
        task_id: taskId,
        locale,
        title: `Aufgabe 1 (${locale})`,
        instructions_html: `<p>Instructions ${locale}</p>`,
      }))
    )
  ).error
);
show(
  "insert task_hints (all 3 locales, position 0)",
  (
    await db.from("task_hints").insert({
      task_id: taskId,
      position: 0,
      content_translations: { de: "Hinweis", en: "Hint", ru: "Подсказка" },
    })
  ).error
);
show(
  "insert task_skill_mappings (10000 bp)",
  (
    await db.from("task_skill_mappings").insert({
      task_id: taskId,
      skill_id: skillId,
      weight_basis_points: 10000,
      mapping_version: 1,
      evidence_required: false,
    })
  ).error
);

/* ── 5. lifecycle ────────────────────────────────────────────────────── */
async function versionRow() {
  const { data } = await db
    .from("content_versions")
    .select("row_version, state")
    .eq("id", versionId)
    .maybeSingle();
  return data;
}

console.log("\n── 5. lifecycle ──");
let cv = await versionRow();
console.log(`  state=${cv?.state} row_version=${cv?.row_version}`);

const submit = await db.rpc("submit_content_for_review", {
  p_content_version_id: versionId,
  p_expected_version: cv.row_version,
  p_correlation_id: uuid(),
  p_idempotency_key: key("submit"),
});
show("submit_content_for_review", submit.error);

cv = await versionRow();
console.log(`  state=${cv?.state} row_version=${cv?.row_version}`);

if (cv?.state === "in_review") {
  const decide = await db.rpc("decide_content_review", {
    p_content_version_id: versionId,
    p_expected_version: cv.row_version,
    p_decision: "approved",
    p_comment: "Freigegeben durch Probe.",
    p_correlation_id: uuid(),
    p_idempotency_key: key("decide"),
  });
  show("decide_content_review('approved')", decide.error);

  cv = await versionRow();
  console.log(`  state=${cv?.state} row_version=${cv?.row_version}`);

  const publish = await db.rpc("publish_content_version", {
    p_content_version_id: versionId,
    p_expected_version: cv.row_version,
    p_correlation_id: uuid(),
    p_idempotency_key: key("publish"),
  });
  show("publish_content_version", publish.error);

  cv = await versionRow();
  console.log(`  state=${cv?.state} row_version=${cv?.row_version}`);

  if (cv?.state === "published") {
    const impact = await db.rpc("get_content_archive_impact", { p_content_version_id: versionId });
    show("get_content_archive_impact", impact.error);
    console.log("   ", JSON.stringify(impact.data));

    const archive = await db.rpc("archive_content_version", {
      p_content_version_id: versionId,
      p_reason: "Probe abgeschlossen.",
      p_impact_fingerprint: impact.data?.fingerprint,
      p_expected_version: cv.row_version,
      p_correlation_id: uuid(),
      p_idempotency_key: key("archive"),
    });
    show("archive_content_version", archive.error);
    console.log(`  final state = ${(await versionRow())?.state}`);
  }
} else {
  console.log("  (skipping decide/publish — version is not in_review)");
}

/* ── 6. what a second version_number looks like ──────────────────────── */
console.log("\n── 6. a second draft version on the same course ──");
const v2 = uuid();
show(
  "insert content_versions (draft, v2)",
  (
    await db.from("content_versions").insert({
      id: v2,
      course_id: courseId,
      version_number: 2,
      state: "draft",
      change_summary: "probe v2",
      snapshot: {},
    })
  ).error
);

/* ── 7. cleanup ──────────────────────────────────────────────────────── */
if (KEEP) {
  console.log(`\n── kept: course ${courseId} (slug ${SLUG}) ──`);
} else {
  console.log("\n── 7. cleanup ──");
  await purge();
  const { count } = await db.from("courses").select("*", { count: "exact" }).eq("slug", SLUG);
  console.log(`  remaining probe courses: ${count}`);
}
await db.auth.signOut();
