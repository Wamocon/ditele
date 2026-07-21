#!/usr/bin/env node
// ---------------------------------------------------------------------------
// WS-9 — the visual-correctness checklist, the mechanical half.
//
//   NEXT_DIST_DIR=.next-ws9 DITELE_ARENA_AUTHORING=1 npx next build
//   NEXT_DIST_DIR=.next-ws9 DITELE_ARENA_AUTHORING=1 \
//     DITELE_APP_ORIGIN=http://127.0.0.1:3109 \
//     npx next start --hostname 127.0.0.1 --port 3109
//   WS9_BASE_URL=http://127.0.0.1:3109 node --env-file=.env.local \
//     scripts/ws9-visual-check.mjs
//
// ⚠️ `next start`, never `next dev` — Turbopack wedges on this machine and the
// hang reads exactly like an application bug (RELEASE.md §7).
//
// The bar for the sandbox is higher than anywhere else in the app: it must be
// pixel-perfect EXCEPT for the planted defect. A student cannot tell "the bug
// I was sent to find" from "this screen is just broken", so every accidental
// visual defect becomes a false bug report and every false report costs a
// trainer a real review — the exact cost decision D2 exists to control.
//
// What this proves, across 3 viewports x 2 themes x defects on/off:
//   1. no horizontal scroll            5. no layout shift
//   2. no console errors               6. defects OFF and defects ON render
//   3. no invisible text                  IDENTICALLY until the learner acts
//   4. 44px touch targets on mobile    7. each planted defect is observable,
//                                         and absent from the clean build
//
// What it CANNOT prove is the last box on the checklist: a colleague told
// "there are no bugs in this build" finding nothing. Budget for a second
// person. That box is the real test.
//
// Reads only. It never writes to the database.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr";
import { chromium } from "playwright";

const BASE = process.env.WS9_BASE_URL ?? "http://127.0.0.1:3109";
const SCENARIO = process.env.WS9_SCENARIO ?? "checkout-v1";
const PASSWORD = "123123123";

/** Draft mode keeps the check independent of whether the seed has been applied. */
const PATH = `/de/arena/sandbox/${SCENARIO}?draft=1`;
const VIEWPORTS = [
  { name: "375", width: 375, height: 780, mobile: true },
  { name: "768", width: 768, height: 900, mobile: true },
  { name: "1280", width: 1280, height: 900, mobile: false },
];

const checks = [];
const record = (label, ok, detail = "") => {
  checks.push([label, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

async function cookiesFor(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
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

/* ── In-page measurements ─────────────────────────────────────────────────── */

/**
 * Relative luminance and contrast, WCAG 2.1. Only used here to catch text that
 * is genuinely INVISIBLE — `scripts/check-contrast.mjs` already proves the
 * token pairs meet AA. A ratio under 1.6 means "you cannot read this at all",
 * which is a rendering defect rather than a design preference.
 */
const MEASURE = `() => {
  const parseColor = (value) => {
    const match = value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const backgroundOf = (element) => {
    let node = element;
    while (node) {
      const colour = parseColor(getComputedStyle(node).backgroundColor);
      if (colour && colour.a > 0.5) return colour;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const invisible = [];
  const small = [];
  for (const element of document.querySelectorAll('body *')) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent.trim())
      .join('');
    if (ownText.length > 0) {
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      if (foreground && foreground.a > 0.5 && style.visibility !== 'hidden') {
        const background = backgroundOf(element);
        const a = luminance(foreground) + 0.05;
        const b = luminance(background) + 0.05;
        const ratio = a > b ? a / b : b / a;
        if (ratio < 1.6) {
          invisible.push(element.tagName + ':' + ownText.slice(0, 32) + ' ratio=' + ratio.toFixed(2));
        }
      }
    }

    if (element.matches('button, a[href], input, select, textarea, [role="button"]')) {
      if (rect.height < 44) {
        small.push(element.tagName + ' ' + Math.round(rect.height) + 'px: ' +
          (element.getAttribute('aria-label') || element.textContent.trim().slice(0, 24)));
      }
    }
  }

  return {
    invisible,
    small,
    horizontalScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    text: (document.querySelector('[data-arena-sandbox-region]')?.innerText ?? '').trim(),
    surfaces: document.querySelectorAll('[data-arena-sandbox-region] > div > section').length,
  };
}`;

async function openSandbox(context, { theme, defects, viewport }) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // The app-wide nav prefetches /learn/arena, which WS-11 has not built yet
    // (ISSUES.md I-043). It 404s on EVERY authenticated page, not just this
    // one, so counting it here would report someone else's known gap as a
    // sandbox defect on 12 checks at once.
    if (message.text().includes("Failed to load resource")) return;
    errors.push(message.text());
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && !url.includes("/learn/arena")) {
      errors.push(`${response.status()} ${url}`);
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  // Set the theme the way the app does, before the first paint, so nothing is
  // measured mid-transition. `documentElement` is null this early on the very
  // first init-script run, hence the guard — without it the check reports its
  // own TypeError as an application console error.
  await page.addInitScript((value) => {
    const apply = () => document.documentElement?.setAttribute("data-theme", value);
    apply();
    document.addEventListener("DOMContentLoaded", apply);
    window.localStorage.setItem("ditele.theme", value);
  }, theme);

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE}${PATH}${defects ? "" : "&defects=off"}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-arena-sandbox-region]", { timeout: 15_000 });
  // Long enough for the slow-thumbnail decoy (1200 ms) to resolve, so the two
  // builds are compared in their settled state.
  await page.waitForTimeout(2_000);
  return { page, errors };
}

/* ── The run ──────────────────────────────────────────────────────────────── */

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies(await cookiesFor("learner@ditele.local"));

console.log(`ws9 visual check — ${BASE}${PATH}\n`);

const settledText = new Map();

for (const viewport of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    for (const defects of [true, false]) {
      const label = `${viewport.name}px ${theme} defects=${defects ? "on" : "off"}`;
      const { page, errors } = await openSandbox(context, { theme, defects, viewport });
      const measured = await page.evaluate(`(${MEASURE})()`);

      record(`${label} · renders its surfaces`, measured.surfaces >= 3, `${measured.surfaces} sections`);
      record(`${label} · no horizontal scroll`, measured.horizontalScroll <= 0, `${measured.horizontalScroll}px`);
      record(`${label} · no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
      record(`${label} · no invisible text`, measured.invisible.length === 0, measured.invisible.slice(0, 2).join(" | "));
      if (viewport.mobile) {
        record(`${label} · 44px touch targets`, measured.small.length === 0, measured.small.slice(0, 3).join(" | "));
      }

      settledText.set(label, measured.text);
      await page.close();
    }
  }
}

// ⭐ The one that matters most: with defects enabled and nobody having touched
// anything yet, the sandbox must look EXACTLY like the clean build. Every
// planted defect in this scenario needs an interaction, and the decoy has
// settled by now — so any difference here is an unplanted visual defect, which
// is precisely the thing that generates false bug reports.
for (const viewport of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    const on = settledText.get(`${viewport.name}px ${theme} defects=on`);
    const off = settledText.get(`${viewport.name}px ${theme} defects=off`);
    record(
      `${viewport.name}px ${theme} · defects on and off render identically before any interaction`,
      on === off && on.length > 0,
      on === off ? `${on.length} chars` : "the two builds differ at rest",
    );
  }
}

/* ── Layout shift ─────────────────────────────────────────────────────────── */
{
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}${PATH}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  const cls = await page.evaluate(() => window.__cls ?? 0);
  // The decoy deliberately resolves late; it must not MOVE anything while it
  // does, which is the difference between a decoy and a real layout defect.
  record("no layout shift on load (CLS < 0.02)", cls < 0.02, `CLS=${cls.toFixed(4)}`);
  await page.close();
}

/* ── Each planted defect is observable, and absent from the clean build ───── */

/**
 * One probe per defect, each on a FRESH page.
 *
 * The first version of this drove all four defects down one page and compared
 * the two runs' totals — which proved nothing, because the runs had diverged:
 * the armed build could push a quantity negative and the clean build could
 * not, so by the time the coupon was applied the two carts held different
 * goods. A comparison is only worth making when the sequence of interactions
 * is identical in both builds and the ONLY variable is whether the defect is
 * armed. That is why these are four small probes instead of one long one.
 */
async function probe(defects, drive) {
  const { page } = await openSandbox(context, { theme: "light", defects, viewport: VIEWPORTS[2] });
  const result = await drive(page);
  await page.close();
  return result;
}

const tidy = (value) => value.replace(/\s+/g, " ").trim();

/** QTY_ACCEPTS_NEGATIVE — the stepper's lower bound stops being enforced. */
const driveQuantity = async (page) => {
  const decrease = page.getByRole("button", { name: "Menge verringern" }).first();
  // Ask rather than click blindly: in the clean build this button is correctly
  // disabled at 1, and clicking a disabled button just times out after 30 s,
  // which says nothing about whether the defect is there.
  if (!(await decrease.isDisabled())) {
    await decrease.click();
    await decrease.click();
  }
  return { quantity: tidy(await page.locator("output").first().innerText()) };
};

/**
 * SHIPPING_DOUBLE_COUNTED — stateful, arms on the third quantity change.
 *
 * The LAST line (44,50 €), deliberately. Three increases of the FIRST line
 * would push the subtotal over the 1.000,00 € free-shipping threshold, and
 * shipping that is free cannot be doubled — the defect would be unobservable
 * and no learner could ever find it. That is exactly what this script caught
 * on its first real run, and why the threshold moved from 500 to 1.000 €.
 */
const driveShipping = async (page) => {
  const increase = page.getByRole("button", { name: "Menge erhöhen" }).last();
  for (let click = 0; click < 3; click += 1) await increase.click();
  return {
    shipping: tidy(await page.locator("dl > div", { hasText: "Versandkosten" }).first().innerText()),
    total: tidy(await page.locator("dl > div").last().innerText()),
  };
};

/** TOTAL_IGNORES_DISCOUNT — the discount line and the total disagree. */
const driveCoupon = async (page) => {
  await page.getByLabel("Gutscheincode").fill("WMC10");
  await page.getByRole("button", { name: "Einlösen" }).click();
  const summary = page.locator("section", { hasText: "Bestellübersicht" }).first();
  return {
    discountShown: (await summary.innerText()).includes("Rabatt"),
    total: tidy(await page.locator("dl > div").last().innerText()),
  };
};

/** EMAIL_VALIDATION_BYPASS — input-dependent: a domain with no TLD. */
const driveEmail = async (page) => {
  await page.getByLabel("E-Mail-Adresse").fill("kunde@beispiel");
  for (const [label, value] of [
    ["Vorname", "Anna"],
    ["Nachname", "Sørensen"],
    ["Straße und Hausnummer", "Lindenstraße 12"],
    ["Postleitzahl", "20095"],
    ["Ort", "Hamburg"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Zahlungspflichtig bestellen" }).click();
  await page.waitForTimeout(200);
  return { accepted: (await page.locator("form").innerText()).includes("entgegengenommen") };
};

const quantity = { armed: await probe(true, driveQuantity), clean: await probe(false, driveQuantity) };
record("QTY_ACCEPTS_NEGATIVE is observable", quantity.armed.quantity !== "1", `quantity "${quantity.armed.quantity}"`);
record("QTY_ACCEPTS_NEGATIVE is absent from the clean build", quantity.clean.quantity === "1", `quantity "${quantity.clean.quantity}"`);

const shipping = { armed: await probe(true, driveShipping), clean: await probe(false, driveShipping) };
record("SHIPPING_DOUBLE_COUNTED arms after the third change", shipping.armed.shipping.includes("9,90"), shipping.armed.shipping);
record("SHIPPING_DOUBLE_COUNTED is absent from the clean build", shipping.clean.shipping.includes("4,95"), shipping.clean.shipping);
record(
  "SHIPPING_DOUBLE_COUNTED — the two totals differ after the SAME three clicks",
  shipping.armed.total !== shipping.clean.total,
  `armed "${shipping.armed.total}" vs clean "${shipping.clean.total}"`,
);

const coupon = { armed: await probe(true, driveCoupon), clean: await probe(false, driveCoupon) };
record("TOTAL_IGNORES_DISCOUNT — the discount line renders in both builds", coupon.armed.discountShown && coupon.clean.discountShown);
record(
  "TOTAL_IGNORES_DISCOUNT — the armed total does not subtract it",
  coupon.armed.total !== coupon.clean.total,
  `armed "${coupon.armed.total}" vs clean "${coupon.clean.total}"`,
);

const email = { armed: await probe(true, driveEmail), clean: await probe(false, driveEmail) };
record("EMAIL_VALIDATION_BYPASS accepts a domain with no TLD", email.armed.accepted);
record("EMAIL_VALIDATION_BYPASS is absent from the clean build", !email.clean.accepted);

/* ── Can the task workspace actually frame this? ──────────────────────────── */
//
// Reported, not asserted. `X-Frame-Options` is set for every route in
// `next.config.ts`, which is app-wide policy and not WS-9's tree — so a red
// gate here would be this workstream failing itself for someone else's header.
// It is printed loudly because it decides whether a learner reaches the
// sandbox from the task at all. See ISSUES.md I-049.
{
  const page = await context.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: "domcontentloaded" });
  const framed = await page.evaluate(async (source) => {
    const frame = document.createElement("iframe");
    frame.src = source;
    document.body.appendChild(frame);
    await new Promise((resolve) => {
      frame.addEventListener("load", resolve, { once: true });
      setTimeout(resolve, 4000);
    });
    try {
      // Same-origin, so a frame that really loaded is readable. A blocked one
      // throws or stays about:blank.
      return (frame.contentDocument?.body?.innerText ?? "").includes("Warenkorb");
    } catch {
      return false;
    }
  }, `${BASE}${PATH}&embed=1`);
  await page.close();

  console.log(
    framed
      ? "\nINFO  the sandbox can be embedded same-origin — the task workspace can show it"
      : "\nWARN  the sandbox CANNOT be embedded: next.config.ts sends X-Frame-Options: DENY\n" +
          "      on every route, which blocks even same-origin framing. The practice panel\n" +
          "      will show an empty frame until that becomes SAMEORIGIN. ISSUES.md I-049;\n" +
          "      the standalone route is unaffected.",
  );
}

await browser.close();

const failed = checks.filter(([, ok]) => !ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) {
  console.error("ws9 visual check FAILED:");
  for (const [label] of failed) console.error(`  - ${label}`);
  process.exit(1);
}
console.log("ws9 visual check passed — the mechanical boxes only. The last box needs a person.");
