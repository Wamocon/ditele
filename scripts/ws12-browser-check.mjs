#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-12 — the oversight board, in a real browser, as a real admin.
//
//   WS12_BASE_URL=http://127.0.0.1:3112 node --env-file=.env.local \
//     scripts/ws12-browser-check.mjs
//
// Why a browser and not a fetch: WS-8 recorded that a `fetch` of a route in
// this app returns a shell that is byte-identical for two different pages and
// embeds the bundled 404 component in its Flight payload — so a fetch-based
// check cannot tell a working page from a broken one.
//
// Why it matters MORE here than on other screens: this board's failure mode is
// not a blank page, it is a page full of plausible zeroes. `xp_ledger`,
// `badge_awards` and `learner_streaks` are self-read only, so an admin session
// that read them directly would render every learner at Level 1 with no streak
// and look completely healthy. So the checks below assert **non-zero** values,
// not merely that the page rendered.
//
// Reads only, except §6 which is explicitly opt-in. Safe to re-run.
// ---------------------------------------------------------------------------
import { chromium } from "@playwright/test";

const BASE = process.env.WS12_BASE_URL ?? "http://127.0.0.1:3112";
const PASSWORD = "123123123"; // verified in plan/status/WS-0.md
const ADMIN = process.env.WS12_ADMIN ?? "admin@ditele.local";
const LEARNER = process.env.WS12_LEARNER ?? "learner@ditele.local";

let passed = 0;
let failed = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const browser = await chromium.launch();

async function session(email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/de/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  return { context, page, consoleErrors };
}

console.log(`\nWS-12 browser check — ${BASE}\n`);

/* ── §1 the board renders for an admin ───────────────────────────────────── */

const admin = await session(ADMIN);
check("admin signs in", !admin.page.url().includes("/login"), admin.page.url());

await admin.page.goto(`${BASE}/de/admin/progress`, { waitUntil: "networkidle" });
check("board is not a 403", !admin.page.url().includes("/403"), admin.page.url());

const main = admin.page.locator("main");
const bodyText = await main.innerText();
check("<main> is not empty", bodyText.trim().length > 100, `${bodyText.length} chars`);
check("board renders its own title", bodyText.includes("Lernfortschritt"));

// ⚠️ The empty state is a legitimate render, so "the page loaded" proves
// nothing. There are 7 active enrollments on this deployment; assert rows.
const rowCount = await admin.page.locator("table tbody tr").count();
check("board shows enrollment rows", rowCount > 0, `${rowCount} rows`);

/* ── §2 the numbers are real, not silently-empty ─────────────────────────── */

check(
  "a learner name reached the page",
  /Lena|Mara|Sofia|Elias|Nina|Tomas|Jonas/.test(bodyText),
  bodyText.slice(0, 160)
);
check("plan-relative day is rendered", /Tag\s+\d+/.test(bodyText));
check("task progress is rendered", /\d+\/\d+/.test(bodyText));
check("level is rendered", /Level\s+\d+/.test(bodyText));

// The trap this whole workstream is built around: if the reward tables were
// read under the admin's own session they would return [] and every learner
// would show 0 XP. At least one learner has a ledger row (WS-11 awarded XP to
// learner@ditele.local), so at least one non-zero XP figure must appear.
const xpValues = [...bodyText.matchAll(/(\d+)\s*XP/g)].map((m) => Number(m[1]));
check(
  "at least one NON-ZERO XP value — the self-read-RLS trap is avoided",
  xpValues.some((v) => v > 0),
  `saw ${JSON.stringify(xpValues)}`
);

/* ── §3 risk signals, sorting and the legend ─────────────────────────────── */

check("risk legend is present", bodyText.includes("Was die Markierungen bedeuten"));
check(
  "the plan-relative note is present",
  bodyText.includes("eigenen Plan") || bodyText.includes("eigene Plan")
);

// Sorted by risk, not alphabetically: read the rendered risk-score order by
// checking that no un-flagged row appears above a flagged one.
const riskColumn = await admin.page
  .locator("table tbody tr")
  .evaluateAll((rows) =>
    rows.map((row) => {
      const cells = row.querySelectorAll("td");
      return cells.length ? cells[cells.length - 1].innerText.trim() : "";
    })
  );
const flagged = riskColumn.map((text) => !text.includes("unauffällig"));
const firstClear = flagged.indexOf(false);
const lastFlagged = flagged.lastIndexOf(true);
check(
  "board is sorted by risk, not alphabetically",
  firstClear === -1 || lastFlagged === -1 || firstClear > lastFlagged,
  `flags=${JSON.stringify(flagged)}`
);

/* ── §4 the filter chips work and keep 44px targets ──────────────────────── */

const chipBox = await admin.page.locator('nav a[href*="risk="]').first().boundingBox();
check("filter chip is a 44px touch target", chipBox !== null && chipBox.height >= 44,
  chipBox ? `${Math.round(chipBox.height)}px` : "no chip");

await admin.page.goto(`${BASE}/de/admin/progress?risk=stalled`, { waitUntil: "networkidle" });
const filteredText = await admin.page.locator("main").innerText();
check(
  "risk filter renders a page (rows or its own empty state)",
  filteredText.includes("Lernfortschritt"),
  filteredText.slice(0, 120)
);

// A bogus filter value must not 500 — it falls back to the unfiltered board.
const bogus = await admin.page.goto(`${BASE}/de/admin/progress?risk=nonsense`, {
  waitUntil: "networkidle",
});
check("an unknown risk filter does not error", bogus.status() === 200, String(bogus?.status()));

/* ── §5 375px, dark mode, and no console errors ──────────────────────────── */

await admin.page.setViewportSize({ width: 375, height: 800 });
await admin.page.goto(`${BASE}/de/admin/progress`, { waitUntil: "networkidle" });
const overflow = await admin.page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
);
check("no horizontal scroll at 375px", overflow <= 0, `${overflow}px overflow`);

await admin.page.emulateMedia({ colorScheme: "dark" });
await admin.page.reload({ waitUntil: "networkidle" });
const invisible = await admin.page.evaluate(() => {
  const parse = (c) => (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  let bad = 0;
  for (const el of document.querySelectorAll("main *")) {
    if (!el.textContent?.trim() || el.children.length > 0) continue;
    const style = getComputedStyle(el);
    const [fr, fg, fb] = parse(style.color);
    let node = el;
    let bg = "rgba(0, 0, 0, 0)";
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && !c.startsWith("rgba(0, 0, 0, 0")) {
        bg = c;
        break;
      }
      node = node.parentElement;
    }
    const [br, bgc, bb] = parse(bg);
    if (Math.abs(fr - br) + Math.abs(fg - bgc) + Math.abs(fb - bb) < 24) bad += 1;
  }
  return bad;
});
check("no invisible text in dark mode", invisible === 0, `${invisible} elements`);

check(
  "no console errors on the board",
  admin.consoleErrors.length === 0,
  admin.consoleErrors.slice(0, 2).join(" | ")
);

/* ── §6 the flag-to-trainer control ──────────────────────────────────────── */
//
// ⚠️ Opt-in with WS12_WRITE=1, because this section WRITES to a live database:
// a real notification for the assigned trainer and a real audit_events row.
// The SQL probe rolls back; this cannot, because it exercises the actual server
// action end to end and that is the whole point of running it. It is
// self-limiting — the RPC deduplicates to one notification per enrollment per
// day — but the audit rows do accumulate across runs, so it does not belong in
// the default pass.

// ⚠️ Measured at 375px, not at 1280px. The 44px rule is a *touch* target rule,
// and this codebase deliberately relaxes to a 36px desktop rhythm from `lg` up
// — see the shared Button's `size="sm"`, which does exactly this and documents
// why. An earlier version of this check measured at 1280 and reported 36px as a
// failure; the code was right and the check was wrong.
await admin.page.emulateMedia({ colorScheme: "light" });
await admin.page.setViewportSize({ width: 375, height: 800 });
await admin.page.goto(`${BASE}/de/admin/progress`, { waitUntil: "networkidle" });

// ⚠️ `:visible` everywhere in this section. DataTable renders the SAME row
// twice — a `hidden md:block` table and a card list below it — so a bare
// locator matches 12 controls for 6 rows and `.first()` picks the one that is
// display:none at the current width. That returns a null bounding box, which
// reads as "the control is missing" rather than "you measured the wrong copy".
const notifyToggle = admin.page
  .locator("summary:visible", { hasText: "Trainer benachrichtigen" })
  .first();
check("notify control is present on a row", (await notifyToggle.count()) > 0);

const toggleBox = await notifyToggle.boundingBox();
check(
  "notify control is a 44px touch target at 375px",
  toggleBox !== null && toggleBox.height >= 44,
  toggleBox ? `${Math.round(toggleBox.height)}px` : "not found"
);

await admin.page.setViewportSize({ width: 1280, height: 900 });
await admin.page
  .locator("summary:visible", { hasText: "Trainer benachrichtigen" })
  .first()
  .click();
const noteField = admin.page.locator('textarea[name="note"]:visible').first();
check("note field opens", await noteField.isVisible());
check(
  "the note is required — a flag without a reason is just an interruption",
  await noteField.evaluate((el) => el.required)
);

// A row whose course has NO assigned trainer never renders the form at all —
// it renders the "kein Trainer zugeordnet" notice instead, so there is nothing
// to submit. Assert that notice exists somewhere, since this deployment has
// exactly such an enrollment (Mara Keller's second course) and it is how the
// gap was found in the first place.
const fullText = await admin.page.locator("main").innerText();
check(
  "a course with no trainer says so INSTEAD of offering the form",
  !fullText.includes("Trainer benachrichtigen") ||
    fullText.includes("kein Trainer zugeordnet") ||
    (await admin.page.locator("summary", { hasText: "Trainer benachrichtigen" }).count()) ===
      (await admin.page.locator("table tbody tr").count()),
  "no row showed the missing-trainer notice"
);

if (process.env.WS12_WRITE === "1") {
  await noteField.fill("Automatischer Prüflauf: Fortschritt stockt, bitte nachfassen.");
  await admin.page
    .locator('button:visible[type="submit"]', { hasText: "Benachrichtigung senden" })
    .first()
    .click();
  // ⚠️ Scoped to the OPEN details panel, not to the page. There is already an
  // empty aria-live region in the shell, so a page-wide `waitForSelector` on
  // [role=status] resolves instantly against that one and reads "" before the
  // action has returned — a race that fails the check while the feature works.
  // `ActionMessage` renders nothing while idle, so inside `details[open]` the
  // element's existence IS the completion signal.
  const outcomeNode = admin.page
    .locator('details[open] [role="status"], details[open] [role="alert"]')
    .first();
  await outcomeNode.waitFor({ state: "visible", timeout: 20_000 });
  const outcome = await outcomeNode.innerText();
  // Three legitimate outcomes, and the third one is the point: an admin must
  // never be told a flag was sent when it was not.
  check(
    "flagging reports a real, specific outcome",
    /benachrichtigt|bereits gesendet|kein Trainer zugeordnet/i.test(outcome),
    outcome
  );
} else {
  console.log("  SKIP  submitting the flag (set WS12_WRITE=1 — it writes to the live DB)");
}

/* ── §7 a learner may not reach it ───────────────────────────────────────── */

const learner = await session(LEARNER);
await learner.page.goto(`${BASE}/de/admin/progress`, { waitUntil: "domcontentloaded" });
check(
  "a learner is redirected away from the board",
  learner.page.url().includes("/403") || learner.page.url().includes("/login"),
  learner.page.url()
);

/* ── verdict ─────────────────────────────────────────────────────────────── */

await browser.close();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
