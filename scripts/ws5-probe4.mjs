// WS-5 — restore a readable German name on the archived probe course.
// The course cannot be deleted (`55000 published content versions are
// immutable`) and its task therefore survives in the inventory. Leaving the
// course cell blank there would look like a bug, so it gets an honest label.
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);
await db.auth.signInWithPassword({ email: "admin@ditele.local", password: "123123123" });

const { data: course } = await db
  .from("courses")
  .select("id")
  .eq("slug", "ws5-probe-lifecycle")
  .maybeSingle();
if (!course) {
  console.log("no probe course left — nothing to do");
  process.exit(0);
}

for (const locale of ["de", "en", "ru"]) {
  const { error } = await db.from("course_localizations").upsert(
    {
      course_id: course.id,
      locale,
      title: "WS-5 Testlauf (archiviert)",
      summary: "Rest eines Lifecycle-Tests. Archiviert, nicht im Katalog.",
      description_html: "<p>Archivierter Testlauf.</p>",
      learning_outcomes: [],
    },
    { onConflict: "course_id,locale" }
  );
  console.log(locale, error ? `${error.code} ${error.message}` : "ok");
}
