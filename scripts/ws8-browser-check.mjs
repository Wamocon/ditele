#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-8 — the slice, in a real browser.
//
//   NEXT_DIST_DIR=.next-ws8 npx next build
//   NEXT_DIST_DIR=.next-ws8 DITELE_APP_ORIGIN=http://127.0.0.1:3108 \
//     npx next start --hostname 127.0.0.1 --port 3108
//   WS8_BASE_URL=http://127.0.0.1:3108 node --env-file=.env.local \
//     scripts/ws8-browser-check.mjs
//
// 06_ARENA_WORKSTREAMS.md §3: "Do not open Wave B until this slice round-trips
// in a browser." ws8-roundtrip.mjs proves the RPC layer. This proves the pages.
//
// ⚠️ It has to be a real browser, and that is not a stylistic preference.
// The task workspace renders its content on the CLIENT: a plain `fetch` of
// /de/learn/tasks/<id> returns a 37,814-byte shell that is byte-for-byte
// IDENTICAL for two different tasks and contains neither title. A fetch-based
// assertion therefore cannot distinguish a working page from a broken one —
// and, worse, the shell embeds the bundled 404 component in its Flight
// payload, so naive grepping for "nicht gefunden" reports an error on a
// perfectly healthy page. Both mistakes were made on the way here.
//
// ⚠️ Do NOT point this at `next dev` — Turbopack wedges on this machine and
// the hang reads exactly like an application bug (RELEASE.md §7).
//
// Reads only.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";
import { chromium } from "playwright";

const BASE = process.env.WS8_BASE_URL ?? "http://127.0.0.1:3108";
const PASSWORD = "123123123";

const COURSE = "01980a20-0000-7000-8000-000000000001";
const HUNT_TASK = "019f9100-0000-7000-8000-000000000001";
const GATED_TASK = "019f9100-0000-7000-8000-000000000002";
const EXISTING_TASK = "01980a26-0000-7000-8000-000000000001";

const HUNT_TITLE = "Checkout-Jagd";
const GATED_TITLE = "Testfallentwurf";

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
await context.addCookies(await cookiesFor("learner@ditele.local"));
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

async function visit(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

// ─── the course page ────────────────────────────────────────────────────────
const courseText = await visit(`/de/learn/courses/${COURSE}`);
record("course page renders", courseText.length > 200);
record("the hunt is listed on the course page", courseText.includes(HUNT_TITLE));
record("the follow-on task is listed on the course page", courseText.includes(GATED_TITLE));

// ─── the hunt workspace ─────────────────────────────────────────────────────
const huntText = await visit(`/de/learn/tasks/${HUNT_TASK}`);
record("the hunt workspace shows its German title", huntText.includes(HUNT_TITLE));
record(
  "the hunt workspace shows its instructions",
  huntText.includes("Rabatt") || huntText.includes("Fehler"),
);
record("the hunt workspace is not a 404", !huntText.includes("Seite nicht gefunden"));

// ─── the task the hunt unlocked ─────────────────────────────────────────────
const gatedText = await visit(`/de/learn/tasks/${GATED_TASK}`);
record("the unlocked task workspace opens", gatedText.includes(GATED_TITLE));

// ─── regression: the shipped V3 task workspace ──────────────────────────────
const existingText = await visit(`/de/learn/tasks/${EXISTING_TASK}`);
record(
  "REGRESSION: the pre-existing V3 task still renders",
  existingText.includes("Login-Ablauf"),
);
const dashText = await visit("/de/learn");
record("REGRESSION: the student dashboard still renders", dashText.length > 200);

// ─── 375px, the width WS-7 fixed once already ───────────────────────────────
await page.setViewportSize({ width: 375, height: 720 });
await page.goto(`${BASE}/de/learn/tasks/${HUNT_TASK}`, { waitUntil: "networkidle" });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
record("the hunt workspace has no horizontal scroll at 375px", !overflow);

record(
  "no console errors on the hunt workspace",
  consoleErrors.length === 0,
  consoleErrors[0] ?? "",
);

await browser.close();

const failed = checks.filter(([, ok]) => !ok).length;
console.log(`\n${failed === 0 ? "BROWSER ROUND-TRIP ✔" : `${failed} check(s) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
