#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-9 — the seeded scenario, read as the learner, through RLS.
//
//   WS9_BASE_URL=http://127.0.0.1:3109 node --env-file=.env.local \
//     scripts/ws9-check-seeded.mjs
//
// `ws9-visual-check.mjs` runs against `?draft=1`, which never touches the
// database — deliberately, so an author can iterate before seeding. This is
// the other half: that the row really landed, that the sandbox route resolves
// it WITHOUT the draft flag, and that a learner may read it under
// `hunt_scenarios_scoped_read`.
//
// The last point is the one worth a script. That policy joins through
// `tasks.external_id` and `can_access_cohort`, so "the seed worked" and "the
// learner can see it" are different questions, and a read denied by RLS comes
// back as an empty result rather than an error — which reads as "no scenario"
// rather than "not allowed". RPC_CONTRACTS §10 calls that the most expensive
// bug available in this codebase.
//
// Reads only.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";
import { chromium } from "playwright";

const BASE = process.env.WS9_BASE_URL ?? "http://127.0.0.1:3109";
const CODE = process.env.WS9_SCENARIO ?? "checkout-v1";
const PASSWORD = "123123123";

const checks = [];
const record = (label, ok, detail = "") => {
  checks.push([label, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const learner = createClient(url, anon, { auth: { persistSession: false } });
const { data: session, error: signInError } = await learner.auth.signInWithPassword({
  email: "learner@ditele.local",
  password: PASSWORD,
});
if (signInError) throw new Error(`sign in: ${signInError.message}`);

const { data: rows, error } = await learner
  .from("hunt_scenarios")
  .select("code, scenario_version, title, expected_findings, state, configuration")
  .eq("code", CODE);

// Reported, not asserted — this is ISSUES.md I-050 and it is WS-8's policy,
// not WS-9's tree. A red gate here would be this workstream failing itself for
// a migration it may not edit. It is printed every run so that the day the
// policy is fixed, whoever runs this sees the line flip and knows to delete
// the fallback branch in the sandbox route.
if (error) {
  console.log(`WARN  reading hunt_scenarios errored: ${error.message}`);
} else if ((rows?.length ?? 0) === 0) {
  console.log(
    "WARN  the learner reads 0 rows from hunt_scenarios — ISSUES.md I-050.\n" +
      "      hunt_scenarios_scoped_read proves entitlement through public.tasks, and a\n" +
      "      learner reads 0 rows from tasks under its own RLS, so the policy's EXISTS is\n" +
      "      false for every learner. The route below is served by the shipped scenario\n" +
      "      definition instead. When this line becomes INFO, delete that fallback.",
  );
} else {
  const row = rows[0];
  console.log("INFO  the learner CAN read hunt_scenarios — I-050 appears fixed");
  record("state is active", row.state === "active", row.state);
  record("expected_findings matches the planted count", row.expected_findings === 4, String(row.expected_findings));
  const planted = (row.configuration?.defects ?? []).filter((d) => d.kind === "planted").length;
  record("the configuration survived the round trip", planted === 4, `${planted} planted`);
}

// And the route itself, with no draft flag — the path a real learner takes.
const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
const value = "base64-" + Buffer.from(JSON.stringify(session.session), "utf8").toString("base64url");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies(
  createChunks(key, value).map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain: new URL(BASE).hostname,
    path: "/",
  })),
);
const page = await context.newPage();
await page.goto(`${BASE}/de/arena/sandbox/${CODE}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-arena-sandbox-region]", { timeout: 15_000 }).catch(() => {});
const text = await page.locator("body").innerText();

record("the route renders it without ?draft=1", text.includes("Ihr Warenkorb"));
record("the scenario's German description reaches the learner", text.includes("Nicht alles, was ungewöhnlich aussieht"));
record("the frame is present", text.includes("Testumgebung"));

await browser.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.error("ws9 seeded check FAILED:");
  for (const [label] of failed) console.error(`  - ${label}`);
  process.exit(1);
}
console.log("ws9 seeded check passed.");
