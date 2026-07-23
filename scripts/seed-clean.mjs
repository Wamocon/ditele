// Seed the clean schema: 5 role users + one sample course with tasks and arena.
// Run: node --env-file=.env.local scripts/seed-clean.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-clean.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const must = (label, error) => { if (error) { console.error(label, error.message ?? error); process.exit(1); } };

// ── 1) Users + profiles ──────────────────────────────────────────────
const USERS = [
  { email: "admin1@gmail.com",   role: "admin",   name: "Admin Eins" },
  { email: "trainer1@gmail.com", role: "trainer", name: "Trainer Eins" },
  { email: "trainer2@gmail.com", role: "trainer", name: "Trainer Zwei" },
  { email: "student1@gmail.com", role: "student", name: "Student Eins" },
  { email: "student2@gmail.com", role: "student", name: "Student Zwei" },
];
const id = {};
const { data: existing } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
for (const u of USERS) {
  let uid = existing?.users?.find((x) => x.email === u.email)?.id;
  if (!uid) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email, password: "123123123", email_confirm: true,
    });
    must(`createUser ${u.email}`, error);
    uid = data.user.id;
  }
  id[u.email] = uid;
  must(`profile ${u.email}`, (await db.from("profiles").upsert({
    id: uid, role: u.role, display_name: u.name, locale: "de", is_active: true,
  }).select().single()).error);
}
console.log("users:", Object.keys(id).length);

// ── 2) Sample content (idempotent by course slug) ────────────────────
const slug = "praxiskurs-softwaretester";
// Reset previous demo activity so re-seeding is fully idempotent.
const NIL = "00000000-0000-0000-0000-000000000000";
for (const t of ["reviews", "submission_images", "submission_options", "submissions", "xp_ledger", "badge_awards", "task_feedback", "course_feedback"]) {
  await db.from(t).delete().neq("id", NIL);
}
await db.from("courses").delete().eq("slug", slug);
await db.from("arena_tasks").delete().neq("id", NIL);
await db.from("badges").delete().neq("id", NIL);

const courseId = randomUUID();
must("course", (await db.from("courses").insert({
  id: courseId, slug, title: "Praxiskurs Softwaretester",
  description: "Softwaretesten lernt man durch Testen: echte Praxisaufgaben und Fehlerberichte.",
  cover_image_url: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200",
  intro_video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  completion_video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  state: "active", created_by: id["admin1@gmail.com"],
}).select().single()).error);

// Arena tasks + answer keys + a badge
const badgeId = randomUUID();
must("badge", (await db.from("badges").insert({ id: badgeId, name: "Bug Hunter", description: "Ersten Fehler im Login gefunden." }).select().single()).error);
const arena1 = randomUUID(), arena2 = randomUUID();
must("arena_tasks", (await db.from("arena_tasks").insert([
  { id: arena1, order_index: 1, title: "Login-Formular testen", description: "Finde die Fehler im Login.", html_window: "<form><input placeholder='E-Mail'><input type='password'><button>Anmelden</button></form>", hint: "Was passiert bei leeren Feldern?", xp_reward: 50, badge_id: null, state: "active" },
  { id: arena2, order_index: 2, title: "Registrierung testen", description: "Finde die Fehler in der Registrierung.", html_window: "<form><input placeholder='Name'><input placeholder='E-Mail'><button>Konto erstellen</button></form>", hint: "Wird die E-Mail validiert?", xp_reward: 75, badge_id: badgeId, state: "active" },
]).select()).error);
must("arena_answer", (await db.from("arena_task_answer").insert([
  { arena_task_id: arena1, acceptance_criteria: "Meldet fehlende Feldvalidierung.", answer_key: "Bug: Anmelden ohne Eingabe möglich; kein Format-Check der E-Mail." },
  { arena_task_id: arena2, acceptance_criteria: "Meldet fehlende E-Mail-Validierung.", answer_key: "Bug: E-Mail-Format nicht geprüft; Name darf leer sein." },
]).select()).error);

// Course tasks (task 2 attaches arena1; tasks 1 & 2 have a mandatory MCQ)
const t1 = randomUUID(), t2 = randomUUID(), t3 = randomUUID();
must("course_tasks", (await db.from("course_tasks").insert([
  { id: t1, course_id: courseId, order_index: 1, title: "Was ist Softwaretesten?", description: "Lies die Einführung und beantworte die Frage.", hint: "Denk an das Ziel.", mcq_question: "Was ist ein Ziel des Softwaretestens?", video_before_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", video_after_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", arena_task_id: null, state: "active" },
  { id: t2, course_id: courseId, order_index: 2, title: "Einen Fehlerbericht schreiben", description: "Bearbeite zuerst die Arena-Aufgabe, dann beantworte die Frage.", hint: "Struktur zählt.", mcq_question: "Welche Angabe gehört in einen Fehlerbericht?", arena_task_id: arena1, state: "active" },
  { id: t3, course_id: courseId, order_index: 3, title: "Testfälle entwerfen", description: "Entwirf Testfälle für ein Login.", hint: null, mcq_question: null, arena_task_id: null, state: "active" },
]).select()).error);

const o = () => randomUUID();
const t1o = [o(), o(), o()], t2o = [o(), o(), o()];
must("options", (await db.from("course_task_options").insert([
  { id: t1o[0], course_task_id: t1, order_index: 1, label: "Fehler in Software finden" },
  { id: t1o[1], course_task_id: t1, order_index: 2, label: "Neuen Code schreiben" },
  { id: t1o[2], course_task_id: t1, order_index: 3, label: "Die Qualität bewerten" },
  { id: t2o[0], course_task_id: t2, order_index: 1, label: "Schritte zur Reproduktion" },
  { id: t2o[1], course_task_id: t2, order_index: 2, label: "Der Name des Entwicklers" },
  { id: t2o[2], course_task_id: t2, order_index: 3, label: "Erwartetes vs. tatsächliches Verhalten" },
]).select()).error);
must("answers", (await db.from("course_task_answer").insert([
  { course_task_id: t1, verification_answer: "Testen findet Fehler und bewertet die Qualität.", correct_option_ids: [t1o[0], t1o[2]] },
  { course_task_id: t2, verification_answer: "Ein Fehlerbericht braucht Titel, Schritte, erwartetes und tatsächliches Verhalten, Schweregrad.", correct_option_ids: [t2o[0], t2o[2]] },
  { course_task_id: t3, verification_answer: "Sinnvolle Positiv- und Negativfälle für das Login.", correct_option_ids: [] },
]).select()).error);

// Enrollments + trainer assignment
must("enrollments", (await db.from("enrollments").insert([
  { student_id: id["student1@gmail.com"], course_id: courseId, assigned_by: id["admin1@gmail.com"] },
  { student_id: id["student2@gmail.com"], course_id: courseId, assigned_by: id["admin1@gmail.com"] },
]).select()).error);
must("course_trainers", (await db.from("course_trainers").insert({
  course_id: courseId, trainer_id: id["trainer1@gmail.com"], assigned_by: id["admin1@gmail.com"],
}).select().single()).error);

console.log("seed done: course", slug, "with 3 tasks, 2 arena tasks, 2 students, 1 trainer");
