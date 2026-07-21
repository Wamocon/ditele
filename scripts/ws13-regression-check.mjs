#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-13 — the regression pass. `06_…` §8 WS-13 item 3.
//
//   WS13_BASE_URL=http://127.0.0.1:3113 node --env-file=.env.local \
//     scripts/ws13-regression-check.mjs
//
// ⭐ The premise, in one line: **this phase modified a shipped app.** WS-8
// widened `learner_snapshot_task_lock_reasons` (security definer, feeds RLS)
// and `task_schedules`; WS-10 changed `defect-form.tsx`; WS-8 changed
// `nav-config.ts`; WS-13 changed the app-wide `X-Frame-Options`. All four are
// load-bearing for features that shipped in V3. A new feature that works while
// an old one silently died is a failed release.
//
// What this asserts that `smoke.mjs` cannot:
//
//   1. **`<main>` is not a hole.** RELEASE.md §6 item 6 asks for this and §8
//      item 4 schedules it into smoke. It cannot go there: every route in this
//      app streams through a Suspense boundary, so the `<main>` in the initial
//      HTML holds a shimmer skeleton and the real content is grafted in by the
//      client. Extracting `<main>` from a fetch yields 0 characters on every
//      healthy page — measured, 39 false failures out of 47. Here the page is
//      hydrated first, so the text read is the text a human sees.
//   2. **No console errors**, per role, per route. I-043's dead-nav-link 404
//      was invisible to every gate in the repo and visible here immediately.
//   3. **375px, dark mode, and reduced motion** on the routes this phase added.
//
// Reads only. Safe to re-run. Uses ONE signed-in session per role, injected as
// cookies rather than typed into the login form — I-059 records that repeated
// form logins trip the auth rate limiter and that the failure looks exactly
// like a hung server.
// ---------------------------------------------------------------------------
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";

const BASE = (process.env.WS13_BASE_URL ?? "http://127.0.0.1:3113").replace(/\/$/, "");
const LOCALE = process.env.WS13_LOCALE ?? "de";
const PASSWORD = "123123123";

const COURSE = "01980a20-0000-7000-8000-000000000001";
const TASK = "01980a26-0000-7000-8000-000000000001";
const HUNT_TASK = "019f9100-0000-7000-8000-000000000001";
const GATED_TASK = "019f9100-0000-7000-8000-000000000002";
const SUBMISSION = "019f8408-296a-7804-94ab-c3279f5b633c";
const LEARNER_USER = "01980a00-0000-7000-8000-000000000001";
const CONTENT_VERSION = "01980a22-0000-7000-8000-000000000001";
const SLUG = "practical-software-testing";
const SCENARIO = "checkout-v1";

/** `arena` marks a route this phase ADDED — those also get 375px + dark mode. */
const ROLES = [
  {
    name: "guest",
    email: null,
    paths: [
      { p: "" }, { p: "/catalog" }, { p: `/catalog/${SLUG}` }, { p: "/about" },
      { p: "/faq" }, { p: "/privacy" }, { p: "/legal" }, { p: "/403" },
      { p: "/login" }, { p: "/register" }, { p: "/reset-password" },
    ],
  },
  {
    name: "student",
    email: "learner@ditele.local",
    paths: [
      { p: "/learn" }, { p: "/learn/courses" }, { p: `/learn/courses/${COURSE}` },
      { p: "/learn/tasks" }, { p: `/learn/tasks/${TASK}`, client: true },
      { p: `/learn/tasks/${HUNT_TASK}`, client: true, arena: true },
      { p: `/learn/tasks/${GATED_TASK}`, client: true, arena: true },
      { p: "/learn/history" }, { p: `/learn/enroll/${COURSE}` },
      { p: "/learn/questions" }, { p: "/learn/questions/new" },
      { p: "/learn/certificates" }, { p: "/learn/notifications" },
      { p: "/learn/profile" },
      { p: "/learn/arena", arena: true },
      { p: `/arena/sandbox/${SCENARIO}`, arena: true },
    ],
  },
  {
    name: "trainer",
    email: "trainer@ditele.local",
    paths: [
      { p: "/trainer" }, { p: "/trainer/submissions" },
      { p: `/trainer/submissions/${SUBMISSION}`, arena: true },
      { p: "/trainer/questions" }, { p: "/trainer/questions/archive" },
      { p: "/trainer/progress", arena: true },
      { p: "/trainer/history" }, { p: "/trainer/profile" },
    ],
  },
  {
    name: "admin",
    email: "admin@ditele.local",
    paths: [
      { p: "/admin" }, { p: "/admin/courses" }, { p: "/admin/courses/new" },
      { p: `/admin/courses/${COURSE}` },
      { p: `/admin/courses/${COURSE}/versions/${CONTENT_VERSION}` },
      { p: "/admin/tasks" }, { p: "/admin/users" }, { p: "/admin/users/new" },
      { p: `/admin/users/${LEARNER_USER}` },
      { p: "/admin/applications" }, { p: "/admin/issues" },
      { p: "/admin/settings" }, { p: "/admin/profile" },
      { p: "/admin/progress", arena: true },
    ],
  },
];

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function cookiesFor(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Missing Supabase env. Run with: node --env-file=.env.local …");
    process.exit(2);
  }
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  const { hostname } = new URL(BASE);
  return createChunks(key, value).map((chunk) => ({
    name: chunk.name, value: chunk.value, domain: hostname,
    path: "/", httpOnly: false, secure: false, sameSite: "Lax",
  }));
}

/**
 * Console noise that is environmental rather than a defect.
 *
 * Kept deliberately short and specific. A broad filter here would hide exactly
 * the class of bug this check exists to find — I-043 was *only* ever visible as
 * a console 404.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  // The dev-only Supabase host is plain HTTP on a LAN address; Chrome warns.
  /was loaded over an insecure connection/i,
];

/** Text that means the page rendered its own error boundary, not its content. */
const ERROR_MARKERS = [
  "Etwas ist schiefgelaufen",
  "Application error",
  "This page could not be found",
];

const browser = await chromium.launch();
console.log(`\nWS-13 regression — ${BASE}\n`);

/* ── §1 every V3 route, every role: renders, and renders quietly ─────────── */

const arenaRoutes = [];

for (const role of ROLES) {
  console.log(`── ${role.name} ${"─".repeat(Math.max(0, 30 - role.name.length))}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (role.email) await context.addCookies(await cookiesFor(role.email));
  const page = await context.newPage();

  for (const route of role.paths) {
    const url = `${BASE}/${LOCALE}${route.p}`;
    const errors = [];
    const onConsole = (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
      errors.push(text);
    };
    page.on("console", onConsole);
    page.on("pageerror", (e) => errors.push(String(e)));

    let mainText = "";
    let landed = "";
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      landed = new URL(page.url()).pathname;
      // Suspense: the shell arrives first. Wait for the skeleton to be replaced
      // rather than racing it — `networkidle` alone is not enough on the
      // client-rendered routes.
      await page
        .waitForFunction(
          () => (document.querySelector("main")?.innerText ?? "").trim().length > 40,
          { timeout: 15_000 },
        )
        .catch(() => {});
      mainText = (await page.locator("main").first().innerText().catch(() => "")).trim();
    } catch (e) {
      check(`${role.name} ${route.p || "/"} loads`, false, String(e).slice(0, 120));
      page.off("console", onConsole);
      continue;
    }

    const label = `${role.name} ${route.p || "/"}`;

    // A signed-in role bounced to /login or /403 means a guard regressed.
    check(
      `${label} · stays on its own route`,
      !role.email || (!landed.endsWith("/login") && !landed.endsWith("/403")),
      `landed on ${landed}`,
    );

    // ⭐ The assertion smoke could not make.
    check(`${label} · <main> is not a hole`, mainText.length > 40, `${mainText.length} chars`);

    const marker = ERROR_MARKERS.find((m) => mainText.includes(m));
    check(`${label} · no error boundary`, !marker, marker ?? "");

    check(
      `${label} · console clean`,
      errors.length === 0,
      errors.slice(0, 2).join(" | ").slice(0, 200),
    );

    if (route.arena) arenaRoutes.push({ role, route, url });
    page.off("console", onConsole);
  }
  await context.close();
}

/* ── §2 the new routes at 375px — no horizontal scroll ───────────────────── */

console.log(`\n── 375px (${arenaRoutes.length} new routes) ${"─".repeat(8)}`);

for (const { role, route, url } of arenaRoutes) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  if (role.email) await context.addCookies(await cookiesFor(role.email));
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  await page
    .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").trim().length > 40, {
      timeout: 15_000,
    })
    .catch(() => {});

  const overflow = await page.evaluate(`(() => {
    const el = document.documentElement;
    if (el.scrollWidth <= el.clientWidth + 1) return null;
    const vw = el.clientWidth;
    for (const node of document.querySelectorAll("body *")) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1) {
        return { by: Math.round(el.scrollWidth - vw), tag: node.tagName,
                 cls: String(node.className).slice(0, 80) };
      }
    }
    return { by: Math.round(el.scrollWidth - vw), tag: "?", cls: "" };
  })()`);

  check(
    `375px ${route.p} · no horizontal scroll`,
    overflow === null,
    overflow ? `+${overflow.by}px from ${overflow.tag}.${overflow.cls}` : "",
  );
  await context.close();
}

/* ── §3 the new routes in dark mode — no invisible text ──────────────────── */
//
// "Invisible" is computed contrast against the real, walked-up background —
// the same method `ws7-sweep.mjs` uses. Below 3.0:1 is unreadable; that is the
// hard stop. AA (4.5:1) is reported but not failed here, because `verify`'s
// own contrast gate owns that threshold and this check must not disagree
// with it.

const CONTRAST_AUDIT = `(() => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || "");
    if (!m) return null;
    const parts = m[1].split(",").map((v) => parseFloat(v));
    if (parts.length > 3 && parts[3] === 0) return null;
    return parts.slice(0, 3);
  };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c) return c;
      node = node.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
  };
  const bad = [];
  for (const el of document.querySelectorAll("main *")) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
    const fg = parse(style.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 3.0) bad.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100 });
  }
  return bad.slice(0, 4);
})()`;

console.log(`\n── dark mode (${arenaRoutes.length} new routes) ${"─".repeat(5)}`);

for (const { role, route, url } of arenaRoutes) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark",
  });
  if (role.email) await context.addCookies(await cookiesFor(role.email));
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
  await page
    .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").trim().length > 40, {
      timeout: 15_000,
    })
    .catch(() => {});

  const theme = await page.evaluate(
    `document.documentElement.dataset.theme || getComputedStyle(document.body).backgroundColor`,
  );
  const invisible = await page.evaluate(CONTRAST_AUDIT);
  check(
    `dark ${route.p} · no invisible text`,
    invisible.length === 0,
    invisible.map((i) => `"${i.text}" ${i.ratio}:1`).join(", "),
  );
  check(`dark ${route.p} · theme actually applied`, Boolean(theme), String(theme));
  await context.close();
}

/* ── §4 prefers-reduced-motion, on every celebration ─────────────────────── */
//
// `06_…` §8 WS-13 item 6's last hard stop. The check is not "is there a CSS
// rule somewhere" — it is that with the media query on, nothing on the Arena
// hub is still animating. A celebration that ignores it is a genuine
// accessibility failure for vestibular disorders, and it is invisible to every
// other gate in this repo.

console.log(`\n── prefers-reduced-motion ${"─".repeat(14)}`);
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addCookies(await cookiesFor("learner@ditele.local"));
  const page = await context.newPage();
  await page.goto(`${BASE}/${LOCALE}/learn/arena`, { waitUntil: "networkidle", timeout: 45_000 });
  await page
    .waitForFunction(() => (document.querySelector("main")?.innerText ?? "").trim().length > 40, {
      timeout: 15_000,
    })
    .catch(() => {});

  const moving = await page.evaluate(`(() => {
    const out = [];
    for (const el of document.querySelectorAll("main *, [class*=celebrat], [class*=confetti]")) {
      const s = getComputedStyle(el);
      const animated =
        (s.animationName && s.animationName !== "none" &&
         parseFloat(s.animationDuration) > 0.01) ||
        (s.transitionDuration && parseFloat(s.transitionDuration) > 0.01 &&
         s.transitionProperty !== "none");
      if (animated) {
        out.push({
          cls: String(el.className).slice(0, 60),
          anim: s.animationName,
          dur: s.animationDuration,
          tdur: s.transitionDuration,
        });
      }
    }
    return out.slice(0, 6);
  })()`);

  check(
    "reduced-motion · nothing on /learn/arena animates",
    moving.length === 0,
    moving.map((m) => `${m.cls}[${m.anim} ${m.dur}/${m.tdur}]`).join(" · ").slice(0, 300),
  );

  // And the rule really is in the stylesheet, not merely absent by luck.
  const hasRule = await page.evaluate(`(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules || []) {
        if (rule.conditionText && /prefers-reduced-motion/.test(rule.conditionText)) return true;
        if (rule.media && /prefers-reduced-motion/.test(rule.media.mediaText)) return true;
      }
    }
    return false;
  })()`);
  check("reduced-motion · a @media rule exists in the stylesheet", hasRule === true);

  await context.close();
}

await browser.close();

const total = passed + failures.length;
console.log(`\n${passed}/${total} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("Regression pass green.\n");
