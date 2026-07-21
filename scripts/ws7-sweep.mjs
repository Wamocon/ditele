// ---------------------------------------------------------------------------
// WS-7 — the responsive / dark-mode / accessibility sweep.
//
//   node --env-file=.env.local scripts/ws7-sweep.mjs
//   WS7_BASE_URL=http://127.0.0.1:3107 node --env-file=.env.local scripts/ws7-sweep.mjs
//   WS7_ONLY=/learn/tasks node --env-file=.env.local scripts/ws7-sweep.mjs   # substring filter
//
// Every Wave-1 chat marked its "375px", "Dark" and "Keyboard" columns as
// unverified because none of them had a browser. This is that verification,
// done by measurement rather than by eye, so the result is reproducible and a
// regression is caught rather than argued about.
//
// For each route × viewport × theme it measures:
//   1. HORIZONTAL SCROLL  — scrollWidth > clientWidth, and names the elements
//      that stick out. This is 02_WORKSTREAMS §9 step 4's hard stop.
//   2. INVISIBLE TEXT     — every text-bearing element's computed colour against
//      its real (walked-up) background. < 3.0:1 is "invisible", < 4.5:1 is an
//      AA failure. This is step 5's hard stop.
//   3. TAP TARGETS        — interactive elements under 44 × 44 at 375px
//      (MASTER_PLAN §6.5, "non-negotiable on mobile").
//   4. FOCUS VISIBILITY   — tabs through the page and asserts every stop draws a
//      visible outline/ring/shadow (step 6).
//
// Exits non-zero if any hard stop fails.
// ---------------------------------------------------------------------------
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";

const BASE = (process.env.WS7_BASE_URL ?? "http://127.0.0.1:3107").replace(/\/$/, "");
const LOCALE = process.env.WS7_LOCALE ?? "de";
const ONLY = process.env.WS7_ONLY ?? "";
const PASSWORD = "123123123";

const COURSE = "01980a20-0000-7000-8000-000000000001";
const TASK = "01980a26-0000-7000-8000-000000000001";
const COHORT = "01980a30-0000-7000-8000-000000000001";
const SLUG = "practical-software-testing";

const ROLES = [
  {
    name: "guest",
    email: null,
    paths: [
      "", "/catalog", `/catalog/${SLUG}`, "/about", "/faq", "/privacy", "/legal",
      "/403", "/login", "/register", "/reset-password", "/update-password",
    ],
  },
  {
    name: "student",
    email: "learner1@ditele.local",
    paths: [
      "/learn", "/learn/courses", `/learn/courses/${COURSE}`, "/learn/tasks",
      `/learn/tasks/${TASK}`, "/learn/history", `/learn/enroll/${COURSE}`,
      "/learn/questions", "/learn/questions/new", "/learn/certificates",
      "/learn/notifications", "/learn/profile",
    ],
  },
  {
    name: "trainer",
    email: "trainer@ditele.local",
    paths: [
      "/trainer", "/trainer/submissions", "/trainer/questions",
      "/trainer/questions/archive", "/trainer/groups", `/trainer/groups/${COHORT}`,
      "/trainer/progress", "/trainer/history", "/trainer/profile",
    ],
  },
  {
    name: "admin",
    email: "admin@ditele.local",
    paths: [
      "/admin", "/admin/courses", "/admin/courses/new", `/admin/courses/${COURSE}`,
      "/admin/tasks", "/admin/users", "/admin/users/new", "/admin/groups",
      "/admin/groups/new", "/admin/applications", "/admin/issues", "/admin/ratings",
      "/admin/settings", "/admin/profile",
    ],
  },
];

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
];

// ── auth ───────────────────────────────────────────────────────────────────
// Same cookie construction as scripts/smoke.mjs. WS-0 learned the hard way that
// getting it wrong produces a silent green over routes that only ever 307'd.
async function cookiesFor(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Missing Supabase env. Run with:  node --env-file=.env.local scripts/ws7-sweep.mjs");
    process.exit(2);
  }
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);

  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  const { hostname } = new URL(BASE);

  return createChunks(key, value).map((chunk) => ({
    name: chunk.name,
    value: chunk.value,
    domain: hostname,
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  }));
}

// ── the in-page audit ──────────────────────────────────────────────────────
// Runs inside the browser. Returns plain data only.
const AUDIT = `(() => {
  const out = { overflow: null, invisible: [], aaFail: [], smallTargets: [] };
  const docEl = document.documentElement;
  const vw = docEl.clientWidth;

  // ── 1. horizontal scroll ────────────────────────────────────────────────
  if (docEl.scrollWidth > vw + 1) {
    const culprits = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        // Report the outermost offender only — a wide parent drags its children.
        if (culprits.some((c) => c.node.contains(el))) continue;
        culprits.push({
          node: el,
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === "string" ? el.className : "").slice(0, 120),
          right: Math.round(r.right),
          left: Math.round(r.left),
        });
      }
    }
    out.overflow = {
      scrollWidth: docEl.scrollWidth,
      clientWidth: vw,
      culprits: culprits.slice(0, 6).map(({ tag, cls, right, left }) => ({ tag, cls, right, left })),
    };
  }

  // ── contrast helpers ────────────────────────────────────────────────────
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map((v) => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // The real painted background: walk up until something is not transparent.
  const bgOf = (el) => {
    let node = el;
    let acc = null;
    while (node && node !== document.documentElement.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc.a >= 1 || c.a >= 1) return acc.a >= 1 ? acc : over(acc, { r: 255, g: 255, b: 255, a: 1 });
      }
      node = node.parentElement;
    }
    return acc ?? { r: 255, g: 255, b: 255, a: 1 };
  };

  const isHidden = (el, s) =>
    s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) === 0;

  const label = (el, text) =>
    el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + ' "' + text.slice(0, 48).replace(/\\s+/g, " ") + '"';

  // ── 2. invisible / low-contrast text ────────────────────────────────────
  for (const el of document.querySelectorAll("body *")) {
    // Only elements that paint their OWN text, not a wrapper's.
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;

    const s = getComputedStyle(el);
    if (isHidden(el, s)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Skip sr-only / visually hidden text — never painted, never read by eye.
    if (r.width <= 1 && r.height <= 1) continue;
    if (s.clip === "rect(0px, 0px, 0px, 0px)" || s.clipPath === "inset(50%)") continue;

    const fg = parse(s.color);
    if (!fg) continue;
    if (fg.a === 0) { out.invisible.push({ el: label(el, own), ratio: 0, note: "color alpha 0" }); continue; }

    const bg = bgOf(el);
    const cr = ratio(fg.a < 1 ? over(fg, bg) : fg, bg);

    // AA large-text allowance: 18.66px bold, or 24px.
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;

    if (cr < 3) out.invisible.push({ el: label(el, own), ratio: Math.round(cr * 100) / 100, fg: s.color, bg: \`rgb(\${Math.round(bg.r)},\${Math.round(bg.g)},\${Math.round(bg.b)})\` });
    else if (cr < need) out.aaFail.push({ el: label(el, own), ratio: Math.round(cr * 100) / 100, need, fg: s.color });
  }

  // ── 3. tap targets ──────────────────────────────────────────────────────
  const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=separator][tabindex]';
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    const s = getComputedStyle(el);
    if (isHidden(el, s)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // A link inside a sentence is not a tap target in the WCAG 2.5.8 sense.
    if (el.tagName === "A" && el.closest("p, li, span, label") && r.height < 30) continue;
    if (el.type === "checkbox" || el.type === "radio") {
      // The label is the target; only flag when there is no label wrapper.
      if (el.closest("label") || (el.id && document.querySelector('label[for="' + el.id + '"]'))) continue;
    }
    if (r.height < 44 || r.width < 24) {
      out.smallTargets.push({
        el: label(el, (el.textContent || el.getAttribute("aria-label") || el.value || "").trim()),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }

  return out;
})()`;

// ── focus-visibility probe (desktop only, keyboard pass) ───────────────────
async function focusAudit(page, maxStops = 40) {
  const bad = [];
  const seen = new Set();
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const key =
        el.tagName.toLowerCase() +
        "|" + (el.id || "") +
        "|" + (el.textContent || "").trim().slice(0, 30);
      const visible =
        (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
        s.boxShadow !== "none" ||
        s.borderColor !== getComputedStyle(document.body).borderColor;
      return { key, visible, offscreen: r.width === 0 && r.height === 0, tag: el.tagName.toLowerCase() };
    });
    if (!info) break;
    if (seen.has(info.key)) break; // wrapped around
    seen.add(info.key);
    if (!info.visible && !info.offscreen) bad.push(info.key);
  }
  return { stops: seen.size, noFocusRing: bad };
}

// ── run ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const findings = [];
let checked = 0;

for (const role of ROLES) {
  const cookies = role.email ? await cookiesFor(role.email) : [];
  const paths = ONLY ? role.paths.filter((p) => p.includes(ONLY)) : role.paths;
  if (paths.length === 0) continue;

  for (const theme of ["light", "dark"]) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      if (cookies.length) await context.addCookies(cookies);
      await context.addInitScript(`try { localStorage.setItem("ditele-theme", "${theme}"); } catch {}`);
      const page = await context.newPage();

      for (const path of paths) {
        const url = `${BASE}/${LOCALE}${path}`;
        try {
          const res = await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
          const status = res?.status() ?? 0;
          // Give animations (fade-in-up is 320ms) time to settle before measuring.
          await page.waitForTimeout(450);

          const actualTheme = await page.evaluate(() => document.documentElement.dataset.theme);
          if (actualTheme !== theme) {
            findings.push({
              role: role.name, path, theme, vp: vp.name, kind: "THEME",
              detail: `data-theme is "${actualTheme}", expected "${theme}"`,
            });
          }

          const audit = await page.evaluate(AUDIT);
          checked++;

          if (audit.overflow) {
            findings.push({
              role: role.name, path, theme, vp: vp.name, kind: "OVERFLOW",
              detail:
                `${audit.overflow.scrollWidth}px content in ${audit.overflow.clientWidth}px viewport · ` +
                audit.overflow.culprits
                  .map((c) => `<${c.tag} class="${c.cls}"> right=${c.right}`)
                  .join(" | "),
            });
          }
          for (const t of audit.invisible) {
            findings.push({
              role: role.name, path, theme, vp: vp.name, kind: "INVISIBLE",
              detail: `${t.ratio}:1  ${t.el}  fg=${t.fg ?? "?"} bg=${t.bg ?? "?"} ${t.note ?? ""}`,
            });
          }
          // AA text failures are reported once per route+theme, not per viewport.
          if (vp.name === "1440") {
            for (const t of audit.aaFail) {
              findings.push({
                role: role.name, path, theme, vp: "-", kind: "AA-TEXT",
                detail: `${t.ratio}:1 (needs ${t.need}) ${t.el} fg=${t.fg}`,
              });
            }
          }
          if (vp.name === "375" && theme === "light") {
            for (const t of audit.smallTargets) {
              findings.push({
                role: role.name, path, theme: "-", vp: "375", kind: "TAP-TARGET",
                detail: `${t.w}×${t.h}px  ${t.el}`,
              });
            }
            if (status >= 400) {
              findings.push({ role: role.name, path, theme: "-", vp: "-", kind: "STATUS", detail: String(status) });
            }
          }
          if (vp.name === "1440" && theme === "light") {
            const focus = await focusAudit(page);
            if (focus.noFocusRing.length) {
              findings.push({
                role: role.name, path, theme: "-", vp: "-", kind: "FOCUS",
                detail: `${focus.noFocusRing.length}/${focus.stops} stops with no visible focus: ${focus.noFocusRing.slice(0, 4).join(", ")}`,
              });
            }
          }
        } catch (e) {
          findings.push({
            role: role.name, path, theme, vp: vp.name, kind: "ERROR",
            detail: e.message.split("\n")[0],
          });
        }
      }
      await context.close();
    }
  }
}

await browser.close();

// ── report ─────────────────────────────────────────────────────────────────
const KINDS = ["ERROR", "STATUS", "OVERFLOW", "INVISIBLE", "THEME", "TAP-TARGET", "AA-TEXT", "FOCUS"];
const HARD_STOP = new Set(["ERROR", "STATUS", "OVERFLOW", "INVISIBLE", "THEME"]);

console.log(`\n${checked} route/viewport/theme combinations measured against ${BASE}\n`);

for (const kind of KINDS) {
  const rows = findings.filter((f) => f.kind === kind);
  const marker = HARD_STOP.has(kind) ? "⛔" : "⚠️ ";
  console.log(`${marker} ${kind}: ${rows.length}`);
  const seen = new Set();
  for (const r of rows) {
    // Collapse the same finding repeated across viewports/themes.
    const key = `${r.role}${r.path}${r.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`    ${r.role.padEnd(8)} ${r.path.padEnd(46)} ${String(r.theme).padEnd(6)} ${String(r.vp).padEnd(5)} ${r.detail}`);
  }
  if (rows.length) console.log("");
}

const hard = findings.filter((f) => HARD_STOP.has(f.kind));
console.log(
  hard.length
    ? `\n⛔ ${hard.length} hard-stop findings (overflow / invisible text / crash).`
    : `\n✅ No hard-stop findings. Zero horizontal scroll, zero invisible text.`
);
if (hard.length) process.exit(1);
