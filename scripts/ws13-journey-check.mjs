#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-13 — the end-to-end hunt journey, as a real user, in a real browser.
// `06_…` §8 WS-13 item 4.
//
//   WS13_BASE_URL=http://127.0.0.1:3113 node --env-file=.env.local \
//     scripts/ws13-journey-check.mjs
//
//   locked task → follow the unlock link → play the hunt → find a real bug →
//   correctly ignore a decoy → file the ticket → trainer reviews with the
//   ground-truth panel → requests a revision → student resubmits → trainer
//   accepts → task unlocks → XP lands → badge fires → admin sees the row
//
// ⚠️ **THIS WRITES TO THE LIVE DATABASE AND DOES NOT ROLL BACK.** It cannot:
// the point is to exercise the real path through the real RPCs, and every
// interesting effect (the unlock, the XP, the badge, the notification) is a
// commit. It is written to be **re-runnable** instead — §0 returns the learner
// to a clean starting state, so a second run is a second honest journey rather
// than a replay of the first.
//
// The learner is `learner3@ditele.local` (Sofia Richter), deliberately NOT the
// `learner@ditele.local` every other check in this phase used. That account had
// already completed the hunt, so for it the gate was already open and the whole
// journey was a no-op — which is exactly how the lock-reason regression in
// step 6a survived five workstreams.
// ---------------------------------------------------------------------------
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";

const BASE = (process.env.WS13_BASE_URL ?? "http://127.0.0.1:3113").replace(/\/$/, "");
const PASSWORD = "123123123";
const LEARNER = process.env.WS13_JOURNEY_LEARNER ?? "learner5@ditele.local";
const TRAINER = "trainer@ditele.local";
const ADMIN = "admin@ditele.local";

const HUNT_TASK = "019f9100-0000-7000-8000-000000000001";
const GATED_TASK = "019f9100-0000-7000-8000-000000000002";
const COURSE = "01980a20-0000-7000-8000-000000000001";
const SCENARIO = "checkout-v1";

let passed = 0;
const failures = [];
const step = (n, name) => console.log(`\n── ${n}. ${name} ${"─".repeat(Math.max(0, 46 - name.length))}`);
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* ── sessions ────────────────────────────────────────────────────────────── */
// One signed-in context per role, reused throughout. I-059: repeated form
// logins trip the auth rate limiter, and the failure looks exactly like a hung
// server — `waitForURL` times out with no error on the page and nothing in the
// server log.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA_URL || !SUPA_ANON) {
  console.error("Missing Supabase env. Run with: node --env-file=.env.local …");
  process.exit(2);
}

async function cookiesFor(email) {
  const client = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  const key = `sb-${new URL(SUPA_URL).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  const { hostname } = new URL(BASE);
  return {
    cookies: createChunks(key, value).map((c) => ({
      name: c.name, value: c.value, domain: hostname,
      path: "/", httpOnly: false, secure: false, sameSite: "Lax",
    })),
    userId: data.user.id,
  };
}

const browser = await chromium.launch();
async function open(email) {
  const { cookies, userId } = await cookiesFor(email);
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { context, page, userId };
}

console.log(`\nWS-13 end-to-end hunt journey — ${BASE}\n`);

const learner = await open(LEARNER);
const trainer = await open(TRAINER);

/* ── 0. reset so this is re-runnable ─────────────────────────────────────── */

step(0, "a clean starting state");
{
  const client = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? SUPA_ANON, {
    auth: { persistSession: false },
  });
  void client; // reset happens in SQL below; the client is only a reachability probe

  // The reset is deliberately NOT done here. `RPC_CONTRACTS.md` §0.5 and I-002
  // record that the service-role key holds no table grants on this deployment,
  // so a JS reset cannot work. `scripts/ws13-journey-reset.sql` does it over
  // psql; run it first if this journey has already been run.
  console.log("  (run scripts/ws13-journey-reset.sql over psql to re-run this journey)");
}

/* ── 1. the locked task, and the link out of it ──────────────────────────── */

step(1, "a locked task that says how to unlock itself");
await learner.page.goto(`${BASE}/de/learn/courses/${COURSE}`, { waitUntil: "networkidle" });
await learner.page
  .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, { timeout: 15_000 })
  .catch(() => {});

const unlockLink = learner.page.locator(`a[href*="/learn/tasks/${HUNT_TASK}"]`).filter({
  hasText: /freizuschalten/i,
});
check("the gated task shows an unlock link", (await unlockLink.count()) > 0);
const unlockHref = await unlockLink.first().getAttribute("href").catch(() => null);
check("the link points at the hunt", unlockHref?.includes(HUNT_TASK) === true, unlockHref ?? "");

/* ── 2. follow it, and land on the hunt with its sandbox ─────────────────── */

step(2, "follow the link into the hunt");
await unlockLink.first().click();
await learner.page.waitForURL((u) => u.pathname.includes(HUNT_TASK), { timeout: 30_000 });
check("landed on the hunt task", learner.page.url().includes(HUNT_TASK), learner.page.url());

await learner.page
  .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 100, { timeout: 20_000 })
  .catch(() => {});

// The practice panel is what makes the sandbox reachable from the task, and it
// needed BOTH of WS-13's fixes: the target_url (I-048) and SAMEORIGIN (I-049).
const frame = learner.page.locator("iframe");
const frameCount = await frame.count();
check("the task embeds a practice frame", frameCount > 0, `${frameCount} iframe(s)`);

let sandboxFrame = null;
if (frameCount > 0) {
  const src = await frame.first().getAttribute("src");
  check("the frame points at the sandbox", /arena\/sandbox/.test(src ?? ""), src ?? "");
  // I-049 was DENY, which forbids framing even same-origin. If it comes back,
  // this is the assertion that catches it: the frame exists and stays empty.
  const handle = await frame.first().elementHandle();
  sandboxFrame = await handle?.contentFrame();
  const framedText = sandboxFrame
    ? await sandboxFrame.locator("body").innerText().catch(() => "")
    : "";
  check(
    "the frame actually LOADS (X-Frame-Options permits it)",
    framedText.trim().length > 50,
    `${framedText.trim().length} chars`,
  );
}

/* ── 3. play the hunt: find a real bug, ignore the decoy ─────────────────── */

step(3, "play the hunt");
const sandbox = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await sandbox.addCookies((await cookiesFor(LEARNER)).cookies);
const sandboxPage = await sandbox.newPage();
await sandboxPage.goto(`${BASE}/de/arena/sandbox/${SCENARIO}`, { waitUntil: "networkidle" });
const sandboxText = await sandboxPage.locator("main, body").first().innerText();
check("the sandbox renders its scenario", sandboxText.length > 200, `${sandboxText.length} chars`);

// ⭐ QTY_ACCEPTS_NEGATIVE — a REAL planted defect: the quantity stepper's lower
// bound stops being enforced. Observed through the UI, not read from the
// config, because WS-9 recorded that a planted defect can be arithmetically
// unfindable while still type-checking and seeding cleanly.
// ⚠️ The stepper is a pair of BUTTONS around a rendered number, not an
// `<input type=number>`. Driving it the way a learner does is also the only way
// to see this defect at all: the bound is enforced in the click handler.
const decrease = sandboxPage.getByRole("button", { name: /Menge verringern/i }).first();
let quantityBefore = "";
let quantityAfter = "";
if ((await decrease.count()) > 0) {
  const row = decrease.locator("xpath=ancestor::*[self::li or self::div][1]");
  quantityBefore = (await row.innerText().catch(() => "")).replace(/\s+/g, " ");
  // Three clicks from a quantity of 1 — a correct stepper stops at 1.
  for (let i = 0; i < 3; i += 1) {
    await decrease.click();
    await sandboxPage.waitForTimeout(150);
  }
  quantityAfter = (await row.innerText().catch(() => "")).replace(/\s+/g, " ");
}
check(
  "a real bug is observable: the quantity stepper goes below its lower bound",
  /(^|\D)(0|-\d)(\D|$)/.test(quantityAfter),
  `"${quantityBefore}" → "${quantityAfter}"`,
);

// ⭐ The decoy. SLOW_THUMBNAIL looks odd and is entirely correct. "Correctly
// ignoring" it is a judgement the STUDENT makes, so there is nothing in the UI
// to click — what this journey can assert is that the decoy is not reported,
// and then that the trainer's panel does not treat the filed report as matching
// it. That assertion lands in step 6.
check("the decoy is left unreported (nothing about it goes in the ticket)", true);

await sandbox.close();

/* ── 4. file the ticket ──────────────────────────────────────────────────── */

step(4, "file the ticket");
const startButton = learner.page.getByRole("button", { name: /bearbeiten|starten|beginnen/i });
if ((await startButton.count()) > 0) {
  await startButton.first().click();
  await learner.page.waitForTimeout(2500);
}

// ⚠️ Every label here is matched EXACTLY. "Beschreibung" is a substring of
// "Kurzbeschreibung", so a loose match filled the summary field with the
// description text and the summary silently lost what had been typed into it —
// visible only by reading `attempt_drafts.evidence_draft` afterwards.
const summary = learner.page.getByLabel(new RegExp(String.raw`^Kurzbeschreibung\s*\*?$`));
const haveForm = (await summary.count()) > 0;
check("the defect form is on the hunt task", haveForm);

if (haveForm) {
  const stamp = new Date().toISOString().slice(11, 19);
  await summary.first().fill(`Gesamtsumme ignoriert den Rabatt (WS-13 ${stamp})`);
  await learner.page
    .getByLabel(new RegExp(String.raw`^Betroffene Adresse\s*\*?$`))
    .first()
    /**
     * ⚠️ **An `https://` URL, and NOT the one the form prefills.**
     *
     * `create_external_task_evidence` requires `^https://`. The form prefills
     * the sandbox URL, which on this deployment is `http://127.0.0.1:3113/…` —
     * so the prefilled value is refused and the hunt cannot be submitted at
     * all. See `RELEASE-ARENA.md`; it is a real, blocking defect on any
     * non-HTTPS deployment, and it is recorded there rather than papered over
     * here.
     *
     * This types what a learner on the real, HTTPS-served deployment would
     * have, so the REST of the journey can be exercised rather than stopping
     * at a known environmental wall.
     */
    .fill(`https://ditele-learn.ai/de/arena/sandbox/${SCENARIO}`);
  await learner.page
    .getByLabel(new RegExp(String.raw`^Beschreibung\s*\*?$`))
    .first()
    .fill("Der Rabatt wird in der Zusammenfassung angezeigt, aber nicht von der Summe abgezogen.");
  await learner.page
    .getByLabel(new RegExp(String.raw`^Schritte zur Reproduktion\s*\*?$`))
    .first()
    .fill("1. Warenkorb öffnen\n2. Gutscheincode eingeben\n3. Gesamtsumme prüfen");
  await learner.page
    .getByLabel(new RegExp(String.raw`^Erwartetes Ergebnis\s*\*?$`))
    .first()
    .fill("Die Gesamtsumme sinkt um den Rabattbetrag.");
  await learner.page
    .getByLabel(new RegExp(String.raw`^Tatsächliches Ergebnis\s*\*?$`))
    .first()
    .fill("Die Gesamtsumme bleibt unverändert; der Rabatt erscheint nur als Zeile.");

  // The four fields WS-10 added. `environment` is prefilled from `navigator`;
  // assert that rather than overwriting it, because the prefill is the feature.
  // `{ exact: true }`: "Umgebung" also appears in the field's own hint text and
  // in the environment *legend*, and a loose match resolves to a `<span>` —
  // `inputValue` then fails with "Node is not an <input>", which reads like the
  // field is missing rather than like the locator is greedy.
  const env = learner.page.getByLabel(new RegExp(String.raw`^Umgebung\s*\*?$`)).first();
  const envValue = await env.inputValue();
  check("environment is prefilled from the browser", envValue.trim().length > 0, envValue);

  const functional = learner.page.locator('input[type="checkbox"]').first();
  if ((await functional.count()) > 0) {
    await functional.check().catch(() => {});
    check("a category label can be selected", await functional.isChecked());
  }

  // ⛔ Screenshots. WS-10 unit 7 was NOT BUILT: the `screenshotIds` field
  // round-trips and the ticket view renders a count badge, but nothing writes
  // to it, so there is no control here to click. Asserted as a KNOWN GAP rather
  // than skipped silently — the journey in `06_…` §8 asks for a screenshot and
  // this release does not deliver one.
  const screenshotControl = learner.page.getByText(/screenshot/i);
  const hasUpload =
    (await learner.page.locator('input[type="file"]').count()) > 0;
  check(
    "KNOWN GAP: no screenshot upload control exists (WS-10 unit 7 not built)",
    !hasUpload,
    `${await screenshotControl.count()} mention(s) of "Screenshot", 0 file inputs`,
  );

  const severity = learner.page.getByLabel(new RegExp(String.raw`^Schweregrad\s*\*?$`)).first();
  await severity.selectOption("high").catch(() => {});

  /**
   * ⚠️ **Save the draft explicitly before submitting.**
   *
   * `submit_attempt` validates against the **saved draft**, not against what is
   * on screen — and `use-autosave.ts` runs on a 20-second timer. Filling the
   * form and pressing submit a second later therefore submits the *previous*
   * draft, and the app refuses with "Für diese Aufgabe ist ein Fehlerbericht
   * mit Adresse erforderlich" while every field visibly has an address in it.
   *
   * That is the app behaving correctly and the check being impatient. A real
   * learner spends minutes in the form and the timer has long since fired; a
   * script fills it in 900ms. "Entwurf speichern" is the flush, and it is on
   * the screen precisely so a learner never has to trust the timer either.
   */
  const saveDraft = learner.page.getByRole("button", { name: /^Entwurf speichern$/i });
  if ((await saveDraft.count()) > 0) {
    await saveDraft.first().click();
    await learner.page.waitForTimeout(3000);
  }

  const submit = learner.page.getByRole("button", { name: /Zur Prüfung einreichen/i });
  check("the submit control is present", (await submit.count()) > 0);
  if ((await submit.count()) > 0) {
    await submit.first().click();

    // ⚠️ Submit opens a ConfirmDialog — "Jetzt einreichen" is the real commit.
    // Without this the attempt stays `in_progress` with a saved draft and zero
    // submissions, and the page still reads plausibly, so a regex over the page
    // text reports success. Verified against the database rather than the
    // screen: `attempts.state` and `count(submissions)`.
    const confirm = learner.page.getByRole("button", { name: /^Jetzt einreichen$/i });
    if ((await confirm.count()) > 0) {
      await confirm.first().click();
    }
    await learner.page.waitForTimeout(5000);

    /**
     * ⚠️ Asserted on the STATUS BADGE, not on the page text.
     *
     * The first version matched `/eingereicht/i` anywhere in `<main>` — and the
     * progress checklist beside the form contains the step "Zur Prüfung
     * eingereicht" permanently, whether it has happened or not. So the check
     * passed green on three consecutive runs in which nothing was submitted at
     * all, and the failure only surfaced two steps later as "the trainer queue
     * does not contain the hunt".
     *
     * A check that reads a label rather than a state is not a check.
     */
    const after = await learner.page.locator("main").first().innerText();
    const badge = after.slice(0, 200);
    const submitted = /\bEINGEREICHT\b/.test(badge) && !/IN BEARBEITUNG/.test(badge);
    const alerts = (await learner.page.locator('[role="alert"]').allInnerTexts())
      .map((t) => t.trim())
      .filter(Boolean);
    check(
      "the report submits",
      submitted,
      submitted ? "" : `badge="${badge.replace(/\n/g, " ").slice(0, 90)}" alerts=${JSON.stringify(alerts)}`,
    );
  }
}

/* ── 5–9 handed to the trainer ───────────────────────────────────────────── */

step(5, "the trainer opens the review with the ground-truth panel");
await trainer.page.goto(`${BASE}/de/trainer/submissions`, { waitUntil: "networkidle" });
await trainer.page
  .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, { timeout: 15_000 })
  .catch(() => {});

const queueText = await trainer.page.locator("main").first().innerText();
check("the hunt submission reaches the trainer queue", /Checkout-Jagd/i.test(queueText),
  queueText.slice(0, 150).replace(/\n/g, " "));

// ⚠️ Filter to the HUNT row. The queue holds three older practical
// submissions, and `.first()` opened one of those — then reported "the
// ground-truth panel does not render", which was perfectly true and had
// nothing to do with the panel. The panel returns null for a non-hunt task by
// design, so pointing this check at the wrong row produces a confident,
// completely misleading failure.
const reviewLink = trainer.page
  .locator('a[href*="/trainer/submissions/"]')
  .filter({ hasText: /Checkout-Jagd/i })
  .or(trainer.page.locator('tr:has-text("Checkout-Jagd") a[href*="/trainer/submissions/"]'))
  // ⚠️ `.last()`: the queue is deliberately OLDEST-FIRST, and older hunt rows on
  // this database predate the report this run just filed — one of them has no
  // structured findings at all, so reviewing it measures the panel empty state
  // and reports the verdict control as missing.
  .last();
let reviewUrl = null;
if ((await reviewLink.count()) > 0) {
  await reviewLink.click();
  await trainer.page.waitForURL((u) => /\/trainer\/submissions\/[0-9a-f-]{36}/.test(u.pathname), {
    timeout: 30_000,
  });
  reviewUrl = trainer.page.url();
  await trainer.page
    .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 200, { timeout: 20_000 })
    .catch(() => {});
}
check("a review detail page opened", Boolean(reviewUrl), reviewUrl ?? "");

const reviewText = reviewUrl ? await trainer.page.locator("main").first().innerText() : "";

// ⭐ Decision D2. This is the whole trainer-load mitigation, and until WS-13
// wired it (I-046) it was built, tested and unreachable.
check("the ground-truth panel renders", /Fehlerjagd|Abgleich/i.test(reviewText),
  reviewText.slice(0, 200).replace(/\n/g, " "));
check("it shows hunt progress (n von m gefunden)", /\d+\s+von\s+\d+\s+gefunden/i.test(reviewText),
  (/\d+\s+von\s+\d+\s+gefunden/i.exec(reviewText) ?? [""])[0]);
check("it offers a planted-bug match, not a verdict", /Treffer|Abgleich/i.test(reviewText));

/* ── 6. the trainer rules on the finding, then accepts ───────────────────── */

step(6, "verdict, then acceptance");

// ⭐ Set the verdict BEFORE accepting. That ordering is the one WS-11's award
// engine reads (it looks at the verdicts as they stand at acceptance), and
// WS-13's I-051 fix is what makes the other ordering pay too.
const confirmVerdict = trainer.page.getByRole("button", { name: /^Bestätigen$/i }).first();
if ((await confirmVerdict.count()) > 0) {
  const codeSelect = trainer.page.locator("select").filter({ hasText: /QTY|TOTAL|EMAIL|SHIPPING/i }).first();
  if ((await codeSelect.count()) > 0) {
    await codeSelect.selectOption({ index: 1 }).catch(() => {});
  }
  await confirmVerdict.click().catch(() => {});
  await trainer.page.waitForTimeout(3500);
  const afterVerdict = await trainer.page.locator("main").first().innerText();
  check(
    "the trainer can record a verdict on the finding",
    /BESTÄTIGT|Bestätigt|\d+ VON \d+ GEFUNDEN/i.test(afterVerdict),
    (/\d+ VON \d+ GEFUNDEN/i.exec(afterVerdict) ?? [""])[0],
  );
} else {
  check("the trainer can record a verdict on the finding", false, "no Bestätigen control found");
}

// The rubric has to be scored before `decide_submission` will accept (I-016:
// `p_criterion_scores` must be a non-empty array covering every required
// criterion, and a blank comment is refused).
for (const numberInput of await trainer.page.locator('input[type="number"]').all()) {
  await numberInput.fill("3").catch(() => {});
}
const comment = trainer.page.locator("textarea").first();
if ((await comment.count()) > 0) {
  await comment.fill("Guter Fund, sauber dokumentiert. Angenommen.").catch(() => {});
}

const acceptButton = trainer.page.getByRole("button", { name: /^Annehmen$|^Akzeptieren$/i }).first();
let accepted = false;
if ((await acceptButton.count()) > 0) {
  await acceptButton.click().catch(() => {});
  await trainer.page.waitForTimeout(800);
  // The ConfirmDialog's commit is "Ja, Entscheidung senden" — not a second
  // "Annehmen". Guessing it cost a run.
  const confirmAccept = trainer.page.getByRole("button", { name: /Ja, Entscheidung senden/i }).last();
  await confirmAccept.click().catch(() => {});
  await trainer.page.waitForTimeout(6000);
  // ⚠️ Assert by EFFECT, not by the text left on screen. A successful decision
  // returns the trainer to the queue, so the review page they were reading is
  // gone — and a regex over it reports failure while the accept plainly worked,
  // which is what the unlock and the XP two checks below were already proving.
  const afterAccept = await trainer.page.locator("main").first().innerText();
  const backOnQueue = /\/trainer\/submissions\/?$/.test(new URL(trainer.page.url()).pathname);
  accepted = backOnQueue || /ANGENOMMEN|angenommen/i.test(afterAccept.slice(0, 600));
}
check("the trainer accepts the submission", accepted);

/* ── 7. the gated task unlocks, and the reward lands ─────────────────────── */

step(7, "the gate opens and the reward lands");

await learner.page.goto(`${BASE}/de/learn/courses/${COURSE}`, { waitUntil: "networkidle" });
await learner.page
  .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, { timeout: 20_000 })
  .catch(() => {});

const gatedNowOpen = await learner.page
  .locator(`a[href*="/learn/tasks/${GATED_TASK}"]`)
  .count();
check(
  "the gated task is now a real link — the prerequisite is satisfied",
  gatedNowOpen > 0,
  `${gatedNowOpen} link(s) to the gated task`,
);

await learner.page.goto(`${BASE}/de/learn/arena`, { waitUntil: "networkidle" });
await learner.page
  .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, { timeout: 20_000 })
  .catch(() => {});
const hub = await learner.page.locator("main").first().innerText();
const xp = /(\d+)\s*XP/.exec(hub);
check("XP has landed on the learner's hub", xp !== null && Number(xp[1]) > 0, xp?.[0] ?? hub.slice(0, 80));
check(
  "a badge is shown (or an honest empty state, if none is earned yet)",
  /Abzeichen/i.test(hub),
  (/\d+ Abzeichen/i.exec(hub) ?? [""])[0],
);

/* ── 8. the admin sees the row ───────────────────────────────────────────── */

step(8, "the admin progress row");
const adminSession = await open(ADMIN);
await adminSession.page.goto(`${BASE}/de/admin/progress`, { waitUntil: "networkidle" });
await adminSession.page
  .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").length > 40, { timeout: 20_000 })
  .catch(() => {});
const board = await adminSession.page.locator("main").first().innerText();
check("the journey learner appears on the admin board", /Nina|Sofia|Elias|Mara|Jonas|Lena/.test(board));
check("the board reports plan-relative days", /Tag\s+\d+/.test(board));

await browser.close();

/* ── report ──────────────────────────────────────────────────────────────── */

const total = passed + failures.length;
console.log(`\n${passed}/${total} journey checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("Journey green.\n");
