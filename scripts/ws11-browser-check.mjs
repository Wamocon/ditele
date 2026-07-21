#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-11 — the Arena hub, in a real browser, as a real learner.
//
//   WS11_BASE_URL=http://127.0.0.1:3111 node --env-file=.env.local \
//     scripts/ws11-browser-check.mjs
//
// Why a browser and not a fetch: WS-8 recorded that a `fetch` of a student
// route returns a shell that is byte-identical for two different pages and
// embeds the bundled 404 component in its Flight payload — so a fetch-based
// check cannot tell a working page from a broken one, and grepping it for
// "nicht gefunden" reports an error on a healthy page.
//
// Reads only. Safe to re-run.
// ---------------------------------------------------------------------------
import { chromium } from "@playwright/test";

const BASE = process.env.WS11_BASE_URL ?? "http://127.0.0.1:3111";
const PASSWORD = "123123123"; // verified in plan/status/WS-0.md
const LEARNER = process.env.WS11_LEARNER ?? "learner@ditele.local";

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
const context = await browser.newContext();
const page = await context.newPage();

/**
 * Every console error is a failure, with one deliberate exception documented
 * below. WS-8's own check does the same; the point is that a page which renders
 * correctly while throwing in the console is not actually working.
 */
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

console.log(`\nWS-11 browser check — ${BASE}\n`);

/* ── Sign in ──────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/de/login`, { waitUntil: "domcontentloaded" });
await page.fill('input[type="email"]', LEARNER);
await page.fill('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 }),
  page.click('button[type="submit"]'),
]);
check("learner signs in", !page.url().includes("/login"), page.url());

/* ── The hub renders ──────────────────────────────────────────────────────── */

const response = await page.goto(`${BASE}/de/learn/arena`, { waitUntil: "networkidle" });
check("GET /de/learn/arena is 200", response?.status() === 200, `status ${response?.status()}`);

const main = await page.locator("main").innerText();
check("main is not empty", main.trim().length > 0, `${main.length} chars`);
check("renders the page title", /Arena/i.test(main));

// ⚠️ I-043: the nav has pointed at this route since WS-8, and Next prefetches
// every link in the viewport — so before this route existed, EVERY student page
// took a 404 on `/de/learn/arena?_rsc=…`. That is the regression this check
// exists to prove is gone, so assert it from a different page, not this one.
await page.goto(`${BASE}/de/learn`, { waitUntil: "networkidle" });
const arenaPrefetch = [];
page.on("response", (r) => {
  if (r.url().includes("/learn/arena")) arenaPrefetch.push(r.status());
});
await page.reload({ waitUntil: "networkidle" });
check(
  "I-043 closed: the Arena nav prefetch no longer 404s",
  arenaPrefetch.every((status) => status < 400),
  `statuses ${arenaPrefetch.join(",") || "(none observed)"}`,
);

/* ── The standing is real, not a placeholder ──────────────────────────────── */

await page.goto(`${BASE}/de/learn/arena`, { waitUntil: "networkidle" });
const hub = await page.locator("main").innerText();

// innerText returns RENDERED text, so `uppercase` CSS changes it — WS-10 lost
// time to exactly this. Fold case in every assertion below.
const hubLower = hub.toLowerCase();

check("shows a level", /level\s*\d+/i.test(hub), hub.slice(0, 200));
check("names the level", /neuling|entdecker|lehrling|tester|experte|meister|champion|guru|legende/i.test(hub));
check("shows an XP total", /\d[\d.]*\s*xp/i.test(hub));
check("has a hunts section", hubLower.includes("jagden"));
check("has a badges section", hubLower.includes("abzeichen"));

// WS-8 seeded one badge award for learner@. If this learner holds it, the badge
// list must show it rather than its empty state — the empty state is correct
// only when there is genuinely nothing.
const hasBadgeEmptyState = hubLower.includes("noch keine abzeichen");
console.log(`  note  badge section is ${hasBadgeEmptyState ? "EMPTY" : "populated"}`);

/* ── The rules the whole app is held to ───────────────────────────────────── */

await page.setViewportSize({ width: 375, height: 812 });
await page.reload({ waitUntil: "networkidle" });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check("no horizontal scroll at 375px", overflow <= 0, `${overflow}px over`);

// Every interactive element must clear 44px. WS-7 fixed this once app-wide.
const small = await page.evaluate(() =>
  [...document.querySelectorAll("main a, main button")]
    .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 40), h: el.getBoundingClientRect().height }))
    .filter((el) => el.h > 0 && el.h < 44),
);
check("every touch target is at least 44px", small.length === 0, JSON.stringify(small));

await page.emulateMedia({ colorScheme: "dark" });
await page.reload({ waitUntil: "networkidle" });
const invisible = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll("main *")) {
    if (!el.textContent?.trim() || el.children.length > 0) continue;
    const style = getComputedStyle(el);
    if (style.color === "rgba(0, 0, 0, 0)" || style.opacity === "0") {
      bad.push(el.textContent.trim().slice(0, 40));
    }
  }
  return bad;
});
check("no invisible text in dark mode", invisible.length === 0, JSON.stringify(invisible));

check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
