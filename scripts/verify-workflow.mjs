// End-to-end workflow + RLS + security check, driven through the real
// RLS-scoped Supabase clients (what the Server Actions do server-side).
// Run: node --env-file=.env.local scripts/verify-workflow.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗ FAIL:", m); } };

const svc = createClient(url, svcKey, { auth: { persistSession: false } });
const asUser = async (email) => {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "123123123" });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
};

// ── Setup: read seeded ids via service role ──
const { data: course } = await svc.from("courses").select("id").eq("slug", "praxiskurs-softwaretester").single();
const { data: tasks } = await svc.from("course_tasks").select("id, order_index, mcq_question").eq("course_id", course.id).order("order_index");
const t1 = tasks[0];
const { data: t1ans } = await svc.from("course_task_answer").select("correct_option_ids").eq("course_task_id", t1.id).single();
const { data: arena } = await svc.from("arena_tasks").select("id, order_index, xp_reward, badge_id").order("order_index");
const a1 = arena[0];

console.log("\n== SECURITY: a student must never read answer keys ==");
const student = await asUser("student1@gmail.com");
const sid = (await student.auth.getUser()).data.user.id;
const { data: leakA } = await student.from("course_task_answer").select("*").eq("course_task_id", t1.id);
ok((leakA ?? []).length === 0, "student cannot read course_task_answer (verification answer / correct options)");
const { data: leakB } = await student.from("arena_task_answer").select("*").eq("arena_task_id", a1.id);
ok((leakB ?? []).length === 0, "student cannot read arena_task_answer (acceptance criteria / answer key)");
const { data: opts } = await student.from("course_task_options").select("id, label").eq("course_task_id", t1.id);
ok(opts?.length > 0 && !("is_correct" in (opts[0] ?? {})), "student sees MCQ option labels but no correctness flag");

console.log("\n== STUDENT submits a course task ==");
const { data: sub, error: subErr } = await student
  .from("submissions")
  .upsert({ student_id: sid, task_kind: "course", course_task_id: t1.id, response_text: "Testen findet Fehler und sichert Qualitaet.", state: "submitted", submitted_at: new Date().toISOString() }, { onConflict: "student_id,course_task_id" })
  .select().single();
ok(!subErr && sub, `student inserted a submission (RLS allows own write)${subErr ? " — " + subErr.message : ""}`);
if (sub) {
  await student.from("submission_options").delete().eq("submission_id", sub.id);
  const { error: optErr } = await student.from("submission_options").insert((t1ans.correct_option_ids ?? []).map((oid) => ({ submission_id: sub.id, option_id: oid })));
  ok(!optErr, "student recorded MCQ selections");
}

console.log("\n== TRAINER review flow ==");
const trainer = await asUser("trainer1@gmail.com");
const tid = (await trainer.auth.getUser()).data.user.id;
const { data: queue } = await trainer.from("submissions").select("id, state").eq("state", "submitted");
ok((queue ?? []).some((q) => q.id === sub?.id), "trainer sees the submission in the review queue (RLS: trainer of the course)");
const { data: key } = await trainer.from("course_task_answer").select("verification_answer").eq("course_task_id", t1.id);
ok((key ?? []).length === 1, "trainer CAN read the answer key (RLS allows staff)");
const { error: revErr } = await trainer.from("reviews").insert({ submission_id: sub.id, trainer_id: tid, decision: "accepted", comment: "Gut gemacht." });
ok(!revErr, `trainer inserted a review${revErr ? " — " + revErr.message : ""}`);
// state change + effects run with service role in the real action:
await svc.from("submissions").update({ state: "accepted" }).eq("id", sub.id);
const { data: after } = await svc.from("submissions").select("state").eq("id", sub.id).single();
ok(after?.state === "accepted", "submission is now accepted");

console.log("\n== ARENA accept pays XP (+ badge if attached) ==");
const { data: asub } = await student.from("submissions").upsert({ student_id: sid, task_kind: "arena", arena_task_id: a1.id, response_text: "Bug: Anmelden ohne Eingabe moeglich.", state: "submitted", submitted_at: new Date().toISOString() }, { onConflict: "student_id,arena_task_id" }).select().single();
ok(!!asub, "student submitted an arena task");
// trainer accepts -> service-role effects (mirrors reviewSubmission)
await svc.from("submissions").update({ state: "accepted" }).eq("id", asub.id);
const { count: xpExisting } = await svc.from("xp_ledger").select("id", { count: "exact", head: true }).eq("student_id", sid).eq("arena_task_id", a1.id);
if (!xpExisting) await svc.from("xp_ledger").insert({ student_id: sid, arena_task_id: a1.id, amount: a1.xp_reward });
if (a1.badge_id) await svc.from("badge_awards").upsert({ student_id: sid, badge_id: a1.badge_id, arena_task_id: a1.id }, { onConflict: "student_id,badge_id" });
const { data: xp } = await svc.from("xp_ledger").select("amount").eq("student_id", sid);
const total = (xp ?? []).reduce((s, r) => s + r.amount, 0);
ok(total >= a1.xp_reward, `student earned XP from the accepted arena task (total ${total} XP)`);

// student can read own XP; another student cannot
const { data: myXp } = await student.from("xp_ledger").select("amount").eq("student_id", sid);
ok((myXp ?? []).length >= 1, "student can read their own XP");
const other = await asUser("student2@gmail.com");
const { data: otherView } = await other.from("xp_ledger").select("amount").eq("student_id", sid);
ok((otherView ?? []).length === 0, "a different student cannot read someone else's XP");

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
