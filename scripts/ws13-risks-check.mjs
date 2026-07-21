#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-13 — the two designed-in risks from `05_…` §6, VERIFIED rather than
// assumed. `06_…` §8 WS-13 item 5.
//
//   WS13_BASE_URL=http://127.0.0.1:3113 node --env-file=.env.local \
//     scripts/ws13-risks-check.mjs
//
// RISK 1 — TRAINER LOAD. Decision D2 exists to make a hunt review "seconds
// instead of minutes". `06_…` says: time an actual review with the panel, and
// if it is not dramatically faster than reading cold, D2 did not deliver and
// that goes in the release notes.
//
//   ⚠️ **A script cannot time a human reading.** What it CAN do is measure the
//   thing that makes the difference — how much a trainer must read before they
//   can decide — and that is what this measures: the words of free prose in the
//   report versus the words in the panel's structured verdict area, plus
//   whether the decision signals (match, progress, field completeness) are
//   present at all without opening the prose. The judgement call built on those
//   numbers is stated plainly in RELEASE-ARENA.md rather than hidden behind a
//   green tick.
//
// RISK 2 — RELATIVE FAIRNESS. Two learners ~3 weeks apart must each see their
// OWN day-N on every screen, and no screen may rank one above the other on
// absolute XP. The data half is `ws13-fairness-probe.sql`; this is the screen
// half, and both are needed — the database computing per-learner means nothing
// if a screen throws it away.
// ---------------------------------------------------------------------------
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";

const BASE = (process.env.WS13_BASE_URL ?? "http://127.0.0.1:3113").replace(/\/$/, "");
const PASSWORD = "123123123";

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
async function cookiesFor(email) {
  const client = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  const key = `sb-${new URL(SUPA_URL).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  const { hostname } = new URL(BASE);
  return createChunks(key, value).map((c) => ({
    name: c.name, value: c.value, domain: hostname,
    path: "/", httpOnly: false, secure: false, sameSite: "Lax",
  }));
}

const browser = await chromium.launch();
async function open(email, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, ...opts });
  await context.addCookies(await cookiesFor(email));
  return { context, page: await context.newPage() };
}
const settle = (page) =>
  page
    .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, {
      timeout: 20_000,
    })
    .catch(() => {});

const words = (s) => (s.trim().match(/\S+/g) ?? []).length;

console.log(`\nWS-13 — the two designed-in risks — ${BASE}\n`);

/* ══ RISK 1 · trainer load ═══════════════════════════════════════════════ */

console.log("── RISK 1 · trainer load (decision D2) ──────────────");

const trainer = await open("trainer@ditele.local");
await trainer.page.goto(`${BASE}/de/trainer/submissions`, { waitUntil: "networkidle" });
await settle(trainer.page);

// ⚠️ `DataTable` renders every row TWICE — a `hidden md:block` table and a card
// list below it (WS-12's learning 4). So the task title and the link are not
// always in the same element: in the table the link is a cell inside the row,
// and a `hasText` filter on the anchor alone finds nothing. Both shapes are
// matched, or this reports "no hunt in the queue" while one is plainly there.
const huntRow = trainer.page
  .locator('a[href*="/trainer/submissions/"]')
  .filter({ hasText: /Checkout-Jagd/i })
  .or(trainer.page.locator('tr:has-text("Checkout-Jagd") a[href*="/trainer/submissions/"]'))
  // ⚠️ `.last()`, not `.first()`. The queue is deliberately OLDEST-FIRST ("so
  // wartet niemand doppelt so lange wie nötig"), and the oldest hunt row on
  // this database is a bare submission created by hand during debugging, with
  // no structured defect report behind it. Reviewing that one measures the
  // panel's empty state and reports D2 as undelivered. The newest row is the
  // one `ws13-journey-check.mjs` just filed through the real form.
  .last();

if ((await huntRow.count()) === 0) {
  check("a hunt submission is in the queue to review", false, "run ws13-journey-check.mjs first");
} else {
  const started = Date.now();
  await huntRow.click();
  await trainer.page.waitForURL((u) => /\/trainer\/submissions\/[0-9a-f-]{36}/.test(u.pathname), {
    timeout: 30_000,
  });
  await settle(trainer.page);
  // Wait for the panel specifically — it is a Server Component further down the
  // stream than the page shell, so "the page loaded" is not "the panel is here".
  await trainer.page
    .waitForFunction(
      () => /GEFUNDEN|gefunden/.test(document.querySelector("main")?.innerText ?? ""),
      { timeout: 20_000 },
    )
    .catch(() => {});
  const readyMs = Date.now() - started;

  const main = await trainer.page.locator("main").first().innerText();

  check(
    "the panel is on screen within a few seconds of opening the review",
    readyMs < 12_000,
    `${(readyMs / 1000).toFixed(1)}s from click to decision signals`,
  );

  // ── the three signals a trainer needs, without reading the prose ────────
  const progress = /(\d+)\s*VON\s*(\d+)\s*GEFUNDEN/i.exec(main);
  check("signal 1 · hunt progress, n of m found", Boolean(progress), progress?.[0] ?? "");
  check(
    "signal 2 · a planted-bug match is offered",
    /Treffer|Abgleich|Kein Abgleich/i.test(main),
    (/Wahrscheinlicher Treffer|Möglicher Treffer|Kein Abgleich/i.exec(main) ?? [""])[0],
  );
  check(
    "signal 3 · field completeness is called out",
    /Pflichtfelder|Nicht ausgefüllt/i.test(main),
    (/Alle Pflichtfelder ausgefüllt|Pflichtfelder fehlen/i.exec(main) ?? [""])[0],
  );

  // ⭐ D2 must RANK AND ANNOTATE, never decide. A panel that auto-accepted
  // would "save time" by removing the judgement the course is teaching.
  const verdictControls = await trainer.page
    .locator('button:has-text("Bestätigen"), select, input[type="radio"]')
    .count();
  check(
    "the trainer still decides — the match is not applied automatically",
    !/automatisch (bestätigt|angenommen)/i.test(main) && verdictControls > 0,
    `${verdictControls} verdict control(s) present`,
  );

  // ── the measurement the risk is actually about ─────────────────────────
  //
  // Reading cold means reading the learner's free text. The panel's job is to
  // put the decision signals somewhere the trainer does not have to.
  const answerPanel = await trainer.page
    .locator("main")
    .locator("text=/Antwort|Fehlerbericht/i")
    .first()
    .textContent()
    .catch(() => "");
  const proseWords = words(main);
  const signalWords = words(
    [progress?.[0], (/Wahrscheinlicher Treffer|Möglicher Treffer|Kein Abgleich/i.exec(main) ?? [""])[0],
     (/Alle Pflichtfelder ausgefüllt|Pflichtfelder fehlen/i.exec(main) ?? [""])[0]]
      .filter(Boolean)
      .join(" "),
  );
  console.log(
    `  INFO  the whole review screen is ${proseWords} words; the three decision ` +
      `signals are ${signalWords} of them (${answerPanel ? "answer panel present" : "no answer panel"})`,
  );
  console.log(
    "  INFO  a trainer who trusts the panel reads the signals and the summary; " +
      "one who does not still has the full report. That is the intended trade.",
  );
}

/* ══ RISK 2 · relative fairness ══════════════════════════════════════════ */

console.log("\n── RISK 2 · relative fairness ───────────────────────");

// Jonas enrolled ~3 weeks before Lena and has FEWER XP. So "who joined first"
// and "who has more XP" disagree, and any screen that confuses tenure with
// progress — or ranks on absolute XP — is visibly wrong on this fixture.
const admin = await open("admin@ditele.local");
await admin.page.goto(`${BASE}/de/admin/progress`, { waitUntil: "networkidle" });
await settle(admin.page);
const board = await admin.page.locator("main").first().innerText();

const dayOf = (name) => {
  // The board renders one row per enrollment; find the learner's row and read
  // its "Tag N". Scoped to the row, because a page-wide regex would happily
  // return somebody else's day.
  const rowRe = new RegExp(`${name}[\\s\\S]{0,400}?Tag\\s+(\\d+)`, "i");
  const m = rowRe.exec(board);
  return m ? Number(m[1]) : null;
};

const jonasDay = dayOf("Jonas Weber");
const lenaDay = dayOf("Lena Learner");

check("the admin board shows Jonas his own day-N", jonasDay !== null, `Tag ${jonasDay}`);
check("the admin board shows Lena her own day-N", lenaDay !== null, `Tag ${lenaDay}`);
check(
  "the two learners are on DIFFERENT days — the board is plan-relative",
  jonasDay !== null && lenaDay !== null && jonasDay !== lenaDay,
  `Jonas Tag ${jonasDay} vs Lena Tag ${lenaDay}`,
);
check(
  "the earlier-enrolled learner has the higher day-N",
  jonasDay !== null && lenaDay !== null && jonasDay > lenaDay,
  `${jonasDay} > ${lenaDay}`,
);

// ⭐ Decision D4: no leaderboard, and nothing that ranks learners against each
// other. On this fixture Lena has MORE absolute XP and FEWER days, so a screen
// that ranked by XP would put her above Jonas — which is exactly the "whoever
// enrolled in January wins forever" failure inverted, and just as wrong.
check(
  "no leaderboard or ranking language on the board",
  !/Rangliste|Leaderboard|Platz\s*\d|Rang\s*\d/i.test(board),
  (/Rangliste|Leaderboard|Platz\s*\d|Rang\s*\d/i.exec(board) ?? [""])[0],
);

// The trainer sees the same numbers, from the same RPC (I-055).
await trainer.page.goto(`${BASE}/de/trainer/progress`, { waitUntil: "networkidle" });
await settle(trainer.page);
const trainerBoard = await trainer.page.locator("main").first().innerText();
const trainerJonas = new RegExp(`Jonas Weber[\\s\\S]{0,400}?Tag\\s+(\\d+)`, "i").exec(trainerBoard);
check(
  "the TRAINER board reports the same day-N as the admin board (I-055 unified)",
  trainerJonas !== null && Number(trainerJonas[1]) === jonasDay,
  `trainer Tag ${trainerJonas?.[1]} vs admin Tag ${jonasDay}`,
);
check(
  "no ranking language on the trainer board either",
  !/Rangliste|Leaderboard|Platz\s*\d|Rang\s*\d/i.test(trainerBoard),
);

// And each learner's OWN screen speaks only about them.
const lena = await open("learner@ditele.local");
await lena.page.goto(`${BASE}/de/learn/arena`, { waitUntil: "networkidle" });
await settle(lena.page);
const hub = await lena.page.locator("main").first().innerText();
check(
  "the learner's own Arena hub shows no comparison to anyone else",
  !/Rangliste|Leaderboard|Platz\s*\d|besser als|schneller als/i.test(hub),
  (/Rangliste|Leaderboard|besser als/i.exec(hub) ?? [""])[0],
);
check(
  "the hub talks about the learner's own progress",
  /XP|Level|Streak/i.test(hub),
);

await browser.close();

const total = passed + failures.length;
console.log(`\n${passed}/${total} risk checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("Both designed-in risks verified.\n");
