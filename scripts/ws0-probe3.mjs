// WS-0 Task 1b (round 3) — deep shapes for the nested payloads that rounds 1
// and 2 truncated: stage activities, the task workspace payload, history rows,
// and the question-context pickers.
//
//   node --env-file=.env.local scripts/ws0-probe3.mjs
//
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123";

async function session(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

// keys + primitive type, recursing fully but collapsing arrays to their first element
function deep(v, d = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length ? [deep(v[0], d + 1)] : "[]";
  if (typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = deep(val, d + 1);
    return o;
  }
  return typeof v;
}

const student = await session("learner@ditele.local");
const COURSE = "01980a20-0000-7000-8000-000000000001";
const TASK = "01980a26-0000-7000-8000-000000000001";

const results = {};

{
  const { data } = await student.rpc("get_my_learning_course", { p_course_id: COURSE, p_locale: "de" });
  results["get_my_learning_course.stages[0]"] = deep(data?.stages?.[0]);
}
{
  const { data, error } = await student.rpc("get_my_learning_task", { p_task_id: TASK });
  results["get_my_learning_task"] = error ? `ERR ${error.code}: ${error.message}` : deep(data);
}
{
  const { data } = await student.rpc("list_my_learning_history", { p_limit: 10, p_locale: "de" });
  results["list_my_learning_history[0]"] = deep(data?.[0]);
  results["list_my_learning_history.count"] = Array.isArray(data) ? data.length : "not-array";
}
{
  const { data } = await student.rpc("list_my_available_question_contexts", { p_locale: "de" });
  results["list_my_available_question_contexts[0]"] = deep(data?.[0]);
}

console.log(JSON.stringify(results, null, 2));
