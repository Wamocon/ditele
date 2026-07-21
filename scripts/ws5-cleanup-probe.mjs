// Removes everything scripts/ws5-probe*.mjs created (slug prefix `ws5-probe`).
//   node --env-file=.env.local scripts/ws5-cleanup-probe.mjs
// A course that owns a published or archived content version cannot be deleted
// (`55000 published content versions are immutable`); it is set to `archived`
// instead so it disappears from the catalog.
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);
await db.auth.signInWithPassword({ email: "admin@ditele.local", password: "123123123" });

const { data: rows } = await db.from("courses").select("id, slug, state").like("slug", "ws5-probe%");
console.log("probe courses:", JSON.stringify(rows));

for (const course of rows ?? []) {
  const { data: tasks } = await db.from("tasks").select("id").eq("course_id", course.id);
  for (const task of tasks ?? []) {
    await db.from("task_skill_mappings").delete().eq("task_id", task.id);
    await db.from("task_hints").delete().eq("task_id", task.id);
    await db.from("task_options").delete().eq("task_id", task.id);
    await db.from("task_localizations").delete().eq("task_id", task.id);
  }
  await db.from("tasks").delete().eq("course_id", course.id);
  const { data: stages } = await db.from("stages").select("id").eq("course_id", course.id);
  for (const stage of stages ?? []) {
    await db.from("stage_localizations").delete().eq("stage_id", stage.id);
  }
  await db.from("stages").delete().eq("course_id", course.id);

  const { data: versions } = await db
    .from("content_versions")
    .select("id, state, version_number")
    .eq("course_id", course.id);
  for (const version of versions ?? []) {
    const { error } = await db.from("content_versions").delete().eq("id", version.id);
    console.log(
      `  v${version.version_number} (${version.state}): ${error ? `${error.code} ${error.message}` : "deleted"}`
    );
  }
  await db.from("course_localizations").delete().eq("course_id", course.id);
  const { error } = await db.from("courses").delete().eq("id", course.id);
  if (error) {
    console.log(`  course kept (${error.code}) → setting state=archived`);
    const { error: archiveError } = await db
      .from("courses")
      .update({ state: "archived" })
      .eq("id", course.id);
    console.log(`  archived: ${archiveError ? archiveError.message : "ok"}`);
  } else {
    console.log("  course deleted");
  }
}

const catalog = await db.rpc("get_public_catalog", { p_locale: "de" });
console.log("public catalog now:", JSON.stringify((catalog.data ?? []).map((r) => r.slug)));
const { count } = await db.from("courses").select("*", { count: "exact" });
console.log("total courses:", count);
