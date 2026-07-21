#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-8 — vertical-slice probe.
//
//   node --env-file=.env.local scripts/ws8-probe.mjs
//
// Answers one question at a time, as the real role, through the real RPCs:
// does the hunt task exist, is the follow-on task locked, and is it locked for
// the RIGHT reason (`required_task`, not `schedule` or `configuration`)?
//
// Reads only. Safe to re-run.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123"; // verified in plan/status/WS-8.md / WS-0.md

const HUNT_TASK = "019f9100-0000-7000-8000-000000000001";
const GATED_TASK = "019f9100-0000-7000-8000-000000000002";
const COURSE = "01980a20-0000-7000-8000-000000000001";

async function signIn(email) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

const learner = await signIn("learner@ditele.local");

const { data: course, error } = await learner.rpc("get_my_learning_course", {
  p_course_id: COURSE,
  p_locale: "de",
});
if (error) throw new Error(`get_my_learning_course: ${error.message}`);

const activities = (course?.stages ?? []).flatMap((s) => s.activities ?? []);

console.log(`\ncourse: ${course?.title}`);
console.log(`progression_mode: ${course?.progression_mode}`);
console.log(`activities: ${activities.length}\n`);

for (const a of activities) {
  const reasons = a.lock_reasons ?? [];
  const tag =
    a.id === HUNT_TASK ? "HUNT   " : a.id === GATED_TASK ? "GATED  " : "existing";
  console.log(`${tag} ${a.id}`);
  console.log(`         title : ${a.title}`);
  console.log(`         state : ${a.state}`);
  console.log(`         locks : ${JSON.stringify(reasons)}`);
}

// ---- the assertions the slice actually rests on --------------------------
const hunt = activities.find((a) => a.id === HUNT_TASK);
const gated = activities.find((a) => a.id === GATED_TASK);

const checks = [
  ["hunt task is visible to the learner", Boolean(hunt)],
  ["hunt task is NOT locked", hunt && (hunt.lock_reasons ?? []).length === 0],
  ["gated task is visible", Boolean(gated)],
  ["gated task IS locked", gated && (gated.lock_reasons ?? []).length > 0],
  [
    "gated task is locked by the prerequisite, not by schedule/config",
    gated &&
      (gated.lock_reasons ?? []).some(
        (r) => (typeof r === "string" ? r : r?.code) === "required_task",
      ),
  ],
];

console.log("");
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed += 1;
}

console.log(
  `\n${failed === 0 ? "slice precondition GREEN" : `${failed} check(s) FAILED`}`,
);
process.exit(failed === 0 ? 0 : 1);
