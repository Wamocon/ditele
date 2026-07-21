#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-8 steps 5 + 6 — relative scheduling and lock-reason enrichment.
//
//   node --env-file=.env.local scripts/ws8-verify-schedule-and-locks.mjs
//
// Reads only. The caller flips the hunt's schedule into relative mode around
// this script (see WS-8.md) so the differential below is meaningful.
//
// Two questions:
//   1. Does a locked task now say WHICH task unlocks it, and its kind and
//      German title -- so the UI can offer "play the hunt that unlocks this"?
//   2. Does one offset_days row resolve to a DIFFERENT date per learner,
//      against each learner's own enrollments.decided_at?
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123";
const COURSE = "01980a20-0000-7000-8000-000000000001";
const HUNT_TASK = "019f9100-0000-7000-8000-000000000001";
const GATED_TASK = "019f9100-0000-7000-8000-000000000002";

async function activitiesFor(email) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  const { data, error: rpcError } = await client.rpc("get_my_learning_course", {
    p_course_id: COURSE,
    p_locale: "de",
  });
  if (rpcError) throw new Error(`${email}: ${rpcError.message}`);
  const map = new Map();
  for (const a of (data?.stages ?? []).flatMap((s) => s.activities ?? [])) map.set(a.id, a);
  return map;
}

const checks = [];
const record = (label, ok, detail = "") => {
  checks.push([label, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

// ─── 1. enrichment: a learner who has NOT done the hunt ─────────────────────
// learner1 has no accepted hunt, so the follow-on task is still gated for them.
const l1 = await activitiesFor("learner1@ditele.local");
const gated = l1.get(GATED_TASK);
const reason = (gated?.lock_reasons ?? []).find((r) => r?.code === "required_task");

console.log(`\nlearner1 sees the gated task as: ${gated?.state}`);
console.log(`lock reason: ${JSON.stringify(reason)}\n`);

record("the gated task is locked for a learner who has not done the hunt", Boolean(reason));
record(
  "the lock reason names the required task id",
  reason?.required_task_id === HUNT_TASK,
  reason?.required_task_id ?? "missing",
);
record(
  "the lock reason names the required task KIND",
  reason?.required_task_kind === "hunt",
  reason?.required_task_kind ?? "missing",
);
record(
  "the lock reason carries the German title, so the UI can deep-link",
  typeof reason?.required_task_title === "string"
    && reason.required_task_title.includes("Checkout-Jagd"),
  reason?.required_task_title ?? "missing",
);

// ─── 2. relative scheduling resolves per learner ────────────────────────────
// The hunt's schedule is in offset mode (offset_days = 1) for this run.
//   learner  decided_at 2026-07-20 -> day 1 has passed  -> open
//   learner5 decided_at 2026-07-21 -> day 1 is tomorrow -> locked by 'schedule'
// One schedule row, two different answers: that is the whole requirement.
const early = await activitiesFor("learner@ditele.local");
const late = await activitiesFor("learner5@ditele.local");

const earlyHunt = early.get(HUNT_TASK);
const lateHunt = late.get(HUNT_TASK);
const codes = (a) => (a?.lock_reasons ?? []).map((r) => r?.code ?? r);

console.log(`\nhunt for learner  (joined 2026-07-20): ${JSON.stringify(codes(earlyHunt))}`);
console.log(`hunt for learner5 (joined 2026-07-21): ${JSON.stringify(codes(lateHunt))}\n`);

record(
  "the earlier learner's day-1 has arrived, so the hunt is open for them",
  !codes(earlyHunt).includes("schedule"),
);
record(
  "the later learner's day-1 has NOT arrived, so the same row locks it",
  codes(lateHunt).includes("schedule"),
);
record(
  "one schedule row therefore resolved to two different answers",
  codes(earlyHunt).includes("schedule") !== codes(lateHunt).includes("schedule"),
);

const failed = checks.filter(([, ok]) => !ok).length;
console.log(`\n${failed === 0 ? "STEPS 5 + 6 VERIFIED ✔" : `${failed} check(s) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
