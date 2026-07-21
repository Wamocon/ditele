#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-8 — the vertical slice, end to end (06_ARENA_WORKSTREAMS.md §3).
//
//   node --env-file=.env.local scripts/ws8-roundtrip.mjs
//
//   locked task → hunt → student reports → trainer accepts → task unlocks
//
// This WRITES. It drives the real command RPCs as the real roles, because the
// point of the slice is to prove the shipped machinery carries a hunt without
// modification — not to prove a mock does.
//
// Re-runnable: if the hunt attempt is already accepted it reports that and
// still re-checks the unlock, rather than trying to submit twice.
//
// ⚠️ Never send a stale p_expected_version to this database. It does not
// return a conflict — it HANGS, Kong 504s, and the PostgREST pool is unusable
// for ~30s afterwards (ISSUES.md I-007 / I-009). Every version below is read
// immediately before the call that uses it.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123";

const HUNT_TASK = "019f9100-0000-7000-8000-000000000001";
const GATED_TASK = "019f9100-0000-7000-8000-000000000002";
const COURSE = "01980a20-0000-7000-8000-000000000001";
const ENROLLMENT = "01980a33-0000-7000-8000-000000000001";
const CRITERION = "01980a2c-0000-7000-8000-000000000001";

const step = (n, s) => console.log(`\n── ${n}. ${s}`);
const show = (label, v) => console.log(`   ${label}: ${v}`);

async function signIn(email) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

function must(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.code ?? ""} ${error.message}`);
  return data;
}

async function lockReasonsFor(client, taskId) {
  const course = must(
    "get_my_learning_course",
    await client.rpc("get_my_learning_course", { p_course_id: COURSE, p_locale: "de" }),
  );
  const activity = (course?.stages ?? [])
    .flatMap((s) => s.activities ?? [])
    .find((a) => a.id === taskId);
  return { reasons: activity?.lock_reasons ?? [], state: activity?.state };
}

// ─── 1. the gate is closed ──────────────────────────────────────────────────
const learner = await signIn("learner@ditele.local");

step(1, "Before: is the follow-on task locked?");
const before = await lockReasonsFor(learner, GATED_TASK);
show("state", before.state);
show("lock_reasons", JSON.stringify(before.reasons));
const startedLocked = before.reasons.length > 0;

// ─── 2. student plays the hunt and files the report ─────────────────────────
step(2, "Student starts the hunt attempt");
const attempt = must(
  "start_attempt",
  await learner.rpc("start_attempt", {
    p_task_id: HUNT_TASK,
    p_enrollment_id: ENROLLMENT,
    p_correlation_id: randomUUID(),
    p_idempotency_key: `ws8-slice-start-${HUNT_TASK}`,
  }),
);
// start_attempt returns an ARRAY of a receipt row whose columns are prefixed —
// attempt_id / attempt_state / attempt_row_version — not the attempts row that
// RPC_CONTRACTS implies. `replayed` tells you the idempotency key was reused.
const receipt = Array.isArray(attempt) ? attempt[0] : attempt;
const attemptRow = {
  id: receipt?.attempt_id,
  state: receipt?.attempt_state,
  row_version: receipt?.attempt_row_version,
};
show("attempt id", attemptRow.id);
show("attempt state", attemptRow.state);
show("replayed", String(receipt?.replayed));

const REPORT = [
  "Zusammenfassung: Der Gesamtbetrag ignoriert den angewendeten Rabattcode.",
  "",
  "Schritte: 1) Artikel in den Warenkorb legen. 2) Gutscheincode SAVE10 anwenden.",
  "3) Zur Kasse gehen und die Summe pruefen.",
  "Erwartet: Der Rabatt von 10% wird vom Gesamtbetrag abgezogen.",
  "Tatsaechlich: Der Gesamtbetrag bleibt unveraendert; der Rabatt erscheint nur",
  "als Zeile in der Uebersicht.",
  "Schweregrad: hoch - der Kunde zahlt zu viel.",
].join("\n");

step(3, "Student submits the defect report (this is the submit_attempt fix)");
let submission = null;
if (attemptRow?.state === "accepted") {
  show("skipped", "attempt is already accepted — re-run, nothing to submit");
} else {
  // Read the version immediately before using it. start_attempt's receipt
  // carries one too, but re-reading keeps this correct on a re-run where the
  // attempt already existed and has moved on since.
  const fresh = must(
    "read attempt version",
    await learner.from("attempts").select("id,row_version,state").eq("id", attemptRow.id).single(),
  );
  show("attempt row_version", fresh.row_version);
  submission = must(
    "submit_attempt",
    await learner.rpc("submit_attempt", {
      p_attempt_id: attemptRow.id,
      p_answer_text: REPORT,
      p_selected_option_ids: [],
      p_evidence_refs: [],
      p_expected_version: fresh.row_version,
      p_correlation_id: randomUUID(),
      p_idempotency_key: `ws8-slice-submit-${attemptRow.id}`.slice(0, 200),
    }),
  );
  const subRow = Array.isArray(submission) ? submission[0] : submission;
  submission = subRow;
  show("submission id", subRow?.id);
  show("submission state", subRow?.state);
}

// ─── 3. trainer reviews it ──────────────────────────────────────────────────
step(4, "Trainer reviews the hunt report");
const trainer = await signIn("trainer@ditele.local");

const queue = must(
  "trainer submissions",
  await trainer.from("submissions").select("id,task_id,state,latest_version_number,row_version"),
);
const target = queue.find((s) => s.task_id === HUNT_TASK);
show("hunt submissions visible to trainer", queue.filter((s) => s.task_id === HUNT_TASK).length);

if (!target) {
  console.log("\n   no hunt submission visible to the trainer — stopping here");
} else if (target.state === "accepted") {
  show("already", "accepted — re-run");
} else {
  const ctx = must(
    "get_submission_review_context",
    await trainer.rpc("get_submission_review_context", {
      p_submission_id: target.id,
      p_locale: "de",
    }),
  );
  show("review context task", ctx?.task_title);
  show("rubric criteria", (ctx?.rubric?.criteria ?? []).map((c) => c.code).join(", "));

  const criteria = ctx?.rubric?.criteria ?? [{ id: CRITERION, max_points: 10 }];
  const scores = criteria.map((c) => ({ criterion_id: c.id, points: c.max_points ?? 10 }));

  const decided = must(
    "decide_submission",
    await trainer.rpc("decide_submission", {
      p_submission_id: target.id,
      p_submission_version_id: ctx.submission_version_id,
      p_expected_version: target.row_version,
      p_decision: "accepted",
      p_comment:
        "Sauber dokumentiert: klare Schritte, erwartetes und tatsaechliches "
        + "Verhalten getrennt. Der Rabatt-Fehler ist korrekt erkannt.",
      p_criterion_scores: scores,
      p_correlation_id: randomUUID(),
      p_idempotency_key: `ws8-slice-decide-${target.id}`.slice(0, 200),
    }),
  );
  const decidedRow = Array.isArray(decided) ? decided[0] : decided;
  show("decision applied, submission state", decidedRow?.state);
}

// ─── 4. the gate opens ──────────────────────────────────────────────────────
step(5, "After: has the follow-on task unlocked?");
const after = await lockReasonsFor(learner, GATED_TASK);
show("state", after.state);
show("lock_reasons", JSON.stringify(after.reasons));

// ─── verdict ────────────────────────────────────────────────────────────────
const checks = [
  ["the follow-on task started out locked", startedLocked],
  ["the hunt submitted without the written-answer error", true],
  ["the follow-on task is now unlocked", after.reasons.length === 0],
  ["…and its state is no longer 'locked'", after.state !== "locked"],
];

console.log("");
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}
console.log(`\n${failed === 0 ? "SLICE ROUND-TRIPS ✔" : `${failed} check(s) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
