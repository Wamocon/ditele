// WS-5 — do the upsert conflict targets in content.ts actually exist?
// A wrong onConflict raises 42P10 at runtime, on a save button, in production.
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: "admin@ditele.local", password: "123123123" });

// Work on the DRAFT probe-free course seeded by WS-0 so nothing published moves.
const { data: version } = await db.from("content_versions").select("id, course_id").eq("state", "draft").limit(1).maybeSingle();
console.log("draft version:", version?.id);

const courseId = version.course_id;
const versionId = version.id;
const stageId = crypto.randomUUID();
const taskId = crypto.randomUUID();
const show = (l, e) => console.log(`  ${e ? "❌" : "✅"} ${l}${e ? ` — ${e.code}: ${e.message}` : ""}`);

console.log("\n1. course_localizations upsert onConflict course_id,locale");
const { data: existing } = await db.from("course_localizations").select("*").eq("course_id", courseId).eq("locale", "de").maybeSingle();
show("upsert", (await db.from("course_localizations").upsert({
  course_id: courseId, locale: "de",
  title: existing?.title ?? "x", summary: existing?.summary ?? "x",
  description_html: existing?.description_html ?? "<p>x</p>", learning_outcomes: existing?.learning_outcomes ?? [],
}, { onConflict: "course_id,locale" })).error);

console.log("\n2. stage + stage_localizations upsert onConflict stage_id,locale");
show("insert stage", (await db.from("stages").insert({ id: stageId, course_id: courseId, content_version_id: versionId, position: 99, state: "draft" })).error);
show("insert 3 localizations", (await db.from("stage_localizations").insert(["de","en","ru"].map(l => ({ stage_id: stageId, locale: l, title: "t", description_html: "<p>d</p>" })))).error);
show("upsert same locale again", (await db.from("stage_localizations").upsert({ stage_id: stageId, locale: "de", title: "t2", description_html: "<p>d2</p>" }, { onConflict: "stage_id,locale" })).error);

console.log("\n3. task + task_localizations upsert onConflict task_id,locale");
show("insert task", (await db.from("tasks").insert({ id: taskId, course_id: courseId, stage_id: stageId, content_version_id: versionId, position: 0, task_kind: "knowledge", expected_minutes: 5, state: "draft" })).error);
show("insert 3 localizations", (await db.from("task_localizations").insert(["de","en","ru"].map(l => ({ task_id: taskId, locale: l, title: "t", instructions_html: "<p>i</p>" })))).error);
show("upsert same locale again", (await db.from("task_localizations").upsert({ task_id: taskId, locale: "de", title: "t2", instructions_html: "<p>i2</p>" }, { onConflict: "task_id,locale" })).error);

console.log("\n4. task_assessments upsert onConflict task_id");
show("insert", (await db.from("task_assessments").upsert({ task_id: taskId, question_translations: { de: "f", en: "q", ru: "в" }, selection_mode: "single", minimum_selections: 1, maximum_selections: 1 }, { onConflict: "task_id" })).error);
show("upsert again", (await db.from("task_assessments").upsert({ task_id: taskId, question_translations: { de: "f2", en: "q2", ru: "в2" }, selection_mode: "single", minimum_selections: 1, maximum_selections: 1 }, { onConflict: "task_id" })).error);

console.log("\n5. options + answers + skill mappings (delete-then-insert, as content.ts does)");
const optionId = crypto.randomUUID();
show("insert option", (await db.from("task_options").insert({ id: optionId, task_id: taskId, option_key: "option-1", position: 0, labels: { de: "a", en: "a", ru: "a" } })).error);
show("insert answer", (await db.from("task_option_answers").insert({ task_option_id: optionId, is_correct: true })).error);
const { data: skill } = await db.from("skills").select("id").eq("state", "active").limit(1).maybeSingle();
show("insert skill mapping", (await db.from("task_skill_mappings").insert({ task_id: taskId, skill_id: skill.id, mapping_version: 1, weight_basis_points: 10000, evidence_required: false })).error);
show("insert hint", (await db.from("task_hints").insert({ task_id: taskId, position: 0, content_translations: { de: "h", en: "h", ru: "h" } })).error);

console.log("\n6. cleanup");
await db.from("task_option_answers").delete().eq("task_option_id", optionId);
for (const t of ["task_options","task_hints","task_skill_mappings","task_assessments","task_localizations"]) {
  show(`delete ${t}`, (await db.from(t).delete().eq("task_id", taskId)).error);
}
show("delete task", (await db.from("tasks").delete().eq("id", taskId)).error);
show("delete stage_localizations", (await db.from("stage_localizations").delete().eq("stage_id", stageId)).error);
show("delete stage", (await db.from("stages").delete().eq("id", stageId)).error);
