// ---------------------------------------------------------------------------
// WS-10 — does the ground-truth panel actually render, for a real trainer, in a
// real browser?
//
// WS-8 learned the hard way that a fetch-based check cannot tell a working page
// from a broken one in this app: the task workspace renders on the client, and
// the Flight payload embeds the bundled 404 component, so grepping the HTML
// reports an error on a healthy page. Any page assertion here needs a browser.
//
// Reads only. It asserts what is on screen and does not click a verdict —
// deciding a finding would mutate live data and is covered by the SQL probes in
// plan/status/WS-10.md instead.
//
// Run (server must already be up on WS-10's port):
//   NEXT_DIST_DIR=.next-ws10 DITELE_APP_ORIGIN=http://127.0.0.1:3110 \
//     npx next start --hostname 127.0.0.1 --port 3110
//   node --env-file=.env.local scripts/ws10-browser-check.mjs
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";
import { chromium } from "playwright";

const BASE = process.env.WS10_BASE_URL ?? "http://127.0.0.1:3110";
const PASSWORD = "123123123";

// WS-8's slice: the hunt submission, and a practical one to prove the panel
// stays invisible everywhere it does not belong.
const HUNT_SUBMISSION = "019f8566-6e34-7ecf-b7cf-b3e68bf7374d";
const PRACTICAL_SUBMISSION = "019f8408-296a-7804-94ab-c3279f5b633c";

async function cookiesFor(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value =
    "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  const { hostname } = new URL(BASE);
  return createChunks(key, value).map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain: hostname,
    path: "/",
  }));
}

const checks = [];
const record = (label, ok, detail = "") => {
  checks.push([label, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies(await cookiesFor("trainer@ditele.local"));
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));

/* ── The hunt review ────────────────────────────────────────────────────── */
await page.goto(`${BASE}/de/trainer/submissions/${HUNT_SUBMISSION}`, {
  waitUntil: "networkidle",
});
// innerText returns RENDERED text, and the section labels carry `uppercase`,
// so "Schritte zur Reproduktion" arrives as "SCHRITTE ZUR REPRODUKTION". Every
// comparison below folds case for that reason -- an earlier version of this
// script reported seven false failures against a panel that was working.
const huntBody = (await page.locator("main").innerText()).toLowerCase();
const has = (needle) => huntBody.includes(needle.toLowerCase());

record("panel renders on a hunt review", has("Fehlerjagd — Abgleich"));
record(
  "shows the scenario title (German course material)",
  has("Kassen-Jagd"),
  huntBody.match(/kassen-jagd[^\n]*/)?.[0] ?? "not found",
);
record(
  'shows the "n von m gefunden" scoreboard',
  /\d+ von \d+ gefunden/.test(huntBody),
  huntBody.match(/\d+ von \d+ gefunden/)?.[0] ?? "not found",
);
record(
  "ranks the right planted defect first",
  has("TOTAL_IGNORES_DISCOUNT"),
);
record(
  "labels that match as a likely one, not a maybe",
  has("Wahrscheinlicher Treffer"),
);
record("renders the ticket, not prose", has("Schritte zur Reproduktion"));
record("shows the student's labels", has("Funktional") && has("Daten"));
record("shows the environment field", has("Chrome 131"));
record(
  "field-completeness verdict is visible",
  has("Alle Pflichtfelder ausgefüllt") || has("Pflichtfelder fehlen"),
);
record(
  "the answer key lists what is still outstanding",
  has("Noch nicht gefunden") && has("QTY_ACCEPTS_NEGATIVE"),
);
record(
  "the decoy is NOT listed as outstanding",
  !/noch nicht gefunden[\s\S]{0,400}slow_thumbnail/.test(huntBody),
);
// WS-8's slice submission is already ACCEPTED, so review.decidable is false
// and the panel is correctly read-only. Asserting the buttons were present was
// the wrong expectation, not a missing feature -- what must be true here is
// that a closed review says so instead of offering a control that would fail.
record("a decided review is read-only, and says why", has("kann nicht mehr geändert werden"));
record("the verdict itself is still shown on a closed review", has("Bewertung") && has("Offen"));

/* ── Regression: every other review is untouched ────────────────────────── */
await page.goto(`${BASE}/de/trainer/submissions/${PRACTICAL_SUBMISSION}`, {
  waitUntil: "networkidle",
});
const practicalBody = (await page.locator("main").innerText()).toLowerCase();
record(
  "⭐ panel is INVISIBLE on a practical review",
  !practicalBody.includes("fehlerjagd"),
);
record(
  "the practical review still renders its own panels",
  practicalBody.includes("aufgabe") || practicalBody.includes("antwort"),
);

/* ── 375px and dark mode ────────────────────────────────────────────────── */
const narrow = await context.newPage();
await narrow.setViewportSize({ width: 375, height: 800 });
await narrow.emulateMedia({ colorScheme: "dark" });
await narrow.goto(`${BASE}/de/trainer/submissions/${HUNT_SUBMISSION}`, {
  waitUntil: "networkidle",
});
const overflow = await narrow.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
record("no horizontal scroll at 375px", overflow <= 0, `overflow ${overflow}px`);

record("no uncaught JS errors", consoleErrors.length === 0, consoleErrors.join(" | "));

await browser.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
