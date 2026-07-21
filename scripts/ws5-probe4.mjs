import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: "admin@ditele.local", password: "123123123" });
for (const [name, q] of [
  ["content_reviews", db.from("content_reviews").select("*").limit(3)],
  ["stage_localizations", db.from("stage_localizations").select("*").limit(2)],
  ["task_hints", db.from("task_hints").select("*").limit(2)],
  ["task_option_answers", db.from("task_option_answers").select("*").limit(3)],
  ["audit_events", db.from("audit_events").select("*").order("occurred_at", { ascending: false }).limit(3)],
  ["bug_categories", db.from("bug_categories").select("id, code").limit(3)],
]) {
  const { data, error } = await q;
  console.log(`${name}:`, error ? `❌ ${error.code} ${error.message}` : `${data.length} rows · ${JSON.stringify(data[0] ?? {}).slice(0, 400)}`);
}
