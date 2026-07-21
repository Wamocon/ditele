#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-11 — the XP rule table exists twice. This proves the two copies agree.
//
//   node --env-file=.env.local scripts/ws11-check-rules.mjs
//
// `public.xp_rules` is what the award engine pays from. `XP_RULES` in
// `src/features/arena/rewards/model.ts` is what the Arena hub renders and what
// the unit tests assert against — it has to exist client-side, because the
// level meter and the celebration are Client Components and `data.ts` is
// `server-only`.
//
// Two copies of a price list drift. When they do, the failure is quiet and
// nasty: the hub tells a learner an action is worth 20 XP and the ledger pays
// something else, and `rule_version` — the whole point of which is that an old
// award keeps its provenance — starts describing points it never recorded.
//
// This is the check that makes the duplication safe. Run it after any change to
// either side.
//
// Reads only.
// ---------------------------------------------------------------------------
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Not named `URL`: `const URL = …` at module scope shadows the global URL
// constructor, and the `new URL(…, import.meta.url)` below then dies with
// "URL is not a constructor" — which reads like a Node version problem and is
// not. The other ws*-probe scripts get away with it only because none of them
// resolves a file path.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123"; // verified in plan/status/WS-0.md

// Parsed out of the TypeScript rather than imported: this is a plain node
// script with no bundler, and `model.ts` is a .ts module. The regex is
// deliberately strict — a rule written in any other shape fails to parse and
// therefore fails the check, which is the safe direction.
const source = await readFile(
  new URL("../src/features/arena/rewards/model.ts", import.meta.url),
  "utf8",
);
const typescriptRules = new Map(
  [...source.matchAll(/\{\s*code:\s*"([a-z0-9_]+)",\s*points:\s*(\d+),/g)].map(
    ([, code, points]) => [code, Number(points)],
  ),
);

if (typescriptRules.size === 0) {
  console.error("FAIL  could not parse a single rule out of model.ts");
  process.exit(1);
}

const client = createClient(SUPABASE_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: signInError } = await client.auth.signInWithPassword({
  email: "learner@ditele.local",
  password: PASSWORD,
});
if (signInError) {
  console.error(`FAIL  sign-in: ${signInError.message}`);
  process.exit(1);
}

// Read as a LEARNER, not as an admin. If `xp_rules_member_read` were missing,
// RLS would return [] rather than an error — the failure mode RPC_CONTRACTS §10
// calls the most expensive bug available in this codebase — and this check
// would silently compare the TypeScript table against nothing.
const { data, error } = await client
  .from("xp_rules")
  .select("code, points, rule_version, is_awarded")
  .eq("state", "active");

if (error) {
  console.error(`FAIL  reading xp_rules: ${error.message}`);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.error(
    "FAIL  a learner reads ZERO rows from xp_rules — either the migration is " +
      "not applied or xp_rules_member_read is missing. An empty result is NOT " +
      "the same as no rules.",
  );
  process.exit(1);
}

const databaseRules = new Map(data.map((row) => [row.code, row.points]));

let failed = false;
const report = (ok, message) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failed = true;
};

console.log(`\nWS-11 rule parity — ${typescriptRules.size} in TS, ${databaseRules.size} in the database\n`);

for (const [code, points] of typescriptRules) {
  const stored = databaseRules.get(code);
  if (stored === undefined) {
    report(false, `${code}: in model.ts but not in xp_rules`);
  } else if (stored !== points) {
    report(false, `${code}: model.ts says ${points}, the database pays ${stored}`);
  }
}
for (const code of databaseRules.keys()) {
  if (!typescriptRules.has(code)) {
    report(false, `${code}: in xp_rules but not in model.ts`);
  }
}

report(
  typescriptRules.size === databaseRules.size,
  `both tables hold ${typescriptRules.size} rules`,
);

// §G2: the whole reason `defect_report_bonus` exists is that an unplanted find
// must be worth more. Asserted against the DATABASE, because that is what pays.
report(
  databaseRules.get("defect_report_bonus") > databaseRules.get("defect_report"),
  `an unplanted find (${databaseRules.get("defect_report_bonus")}) pays more than a planted one (${databaseRules.get("defect_report")})`,
);

console.log();
if (failed) {
  console.error("Rule parity FAILED — the hub and the ledger disagree about what an action is worth.");
  process.exit(1);
}
console.log("Rule parity passed.");
