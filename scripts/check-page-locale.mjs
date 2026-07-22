#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Rendered-page locale check.
//
//   node --env-file=.env.local scripts/check-page-locale.mjs
//
// i18n:check compares JSON files. This checks what a signed-in user actually
// SEES: it fetches every route as the right role in /en and /ru and looks for
// German text in the rendered HTML.
//
// Detection is driven by de.json itself, not a hand-written word list. The
// first version of this script used ~24 German words I thought of, which is why
// it reported "0 showing German" while admin detail pages were still German:
// it could only ever find what I had already guessed, and it never visited a
// page with an :id in it.
//
// Now: every German string in the catalogue is a probe. If a value from
// de.json appears verbatim in a rendered /en or /ru page, that string did not
// go through translation — whatever the JSON files claim.
// ---------------------------------------------------------------------------
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3107").replace(/\/$/, "");
const PW = "123123123";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing Supabase env. Run with: node --env-file=.env.local scripts/check-page-locale.mjs");
  process.exit(2);
}

// Seeded ids — see plan/status/RPC_CONTRACTS.md §11.
const USER = "01980a00-0000-7000-8000-000000000001";
const COURSE = "01980a20-0000-7000-8000-000000000001";
const VERSION = "01980a22-0000-7000-8000-000000000001";
const SUBMISSION = "019f840a-20e6-771d-bc7a-f82d2861605a";
const QUESTION = "019f83c1-958d-7425-aaad-3b082ebbc479";
const TASK = "01980a26-0000-7000-8000-000000000001";

const ROUTES = {
  "admin@ditele.local": [
    "/admin",
    "/admin/courses",
    "/admin/courses/new",
    `/admin/courses/${COURSE}`,
    `/admin/courses/${COURSE}/versions/${VERSION}`,
    "/admin/tasks",
    "/admin/users",
    "/admin/users/new",
    `/admin/users/${USER}`,
    "/admin/applications",
    "/admin/issues",
    "/admin/settings",
    "/admin/profile",
  ],
  "trainer@ditele.local": [
    "/trainer",
    "/trainer/submissions",
    `/trainer/submissions/${SUBMISSION}`,
    "/trainer/questions",
    `/trainer/questions/${QUESTION}`,
    "/trainer/questions/archive",
    "/trainer/progress",
    "/trainer/history",
    "/trainer/profile",
  ],
  "learner@ditele.local": [
    "/learn",
    "/learn/courses",
    `/learn/courses/${COURSE}`,
    "/learn/tasks",
    `/learn/tasks/${TASK}`,
    "/learn/history",
    "/learn/questions",
    "/learn/questions/new",
    "/learn/certificates",
    "/learn/notifications",
    "/learn/profile",
  ],
};

/** Flatten a message bundle to `path -> value` pairs. */
function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) return flatten(child, path);
    return [[path, child]];
  });
}

const load = async (locale) =>
  new Map(
    flatten(
      JSON.parse(
        await readFile(new URL(`../src/shared/i18n/messages/${locale}.json`, import.meta.url), "utf8"),
      ),
    ),
  );

const de = await load("de");
const en = await load("en");
const ru = await load("ru");

/**
 * Build the probe set for one target locale: German strings that ARE meant to
 * differ in that locale.
 *
 * Skipped on purpose:
 *  - shorter than 12 chars — "Status", "Name", "E-Mail" and the like collide
 *    with English or with real data and would drown the signal in noise
 *  - identical in the target locale — proper nouns ("DiTeLe", "FAQ", "—") and
 *    anything a translator legitimately left alone
 *  - the legal namespaces — Impressum and Datenschutz stay German by design
 */
function probesFor(target) {
  // Every string the target locale legitimately renders. A German value that
  // also appears here is unusable as a probe: "Administration" is German for
  // roles.admin AND correct English for adminOps.common.administration, so
  // finding it on an /en page proves nothing. Without this the checker blamed
  // roles.admin on seven admin pages that were perfectly translated.
  const targetValues = new Set(
    [...target.values()].filter((v) => typeof v === "string"),
  );

  const probes = [];
  for (const [key, value] of de) {
    if (typeof value !== "string" || value.trim().length < 12) continue;
    if (key.startsWith("public.privacy") || key.startsWith("public.legal")) continue;
    if (target.get(key) === value) continue;
    if (targetValues.has(value)) continue;
    // Authored course material is German on every locale, by design.
    if (CONTENT.includes(value)) continue;
    probes.push([key, value]);
  }
  return probes;
}



async function session(email) {
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const ref = new URL(url).host.split(".")[0].replace(/[^a-zA-Z0-9]/g, "");
  return `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    token_type: "bearer",
    user: data.session.user,
  }))}`;
}

/**
 * Course material is authored in German only (CONTENT_LOCALES === ["de"]), so a
 * German sentence inside a task title or instruction is correct on every locale.
 * Those strings must not be reported as translation bugs.
 *
 * Pulled once from the database rather than guessed: a probe is dropped if its
 * German text appears anywhere in the authored content. That is how
 * `learn.task.defectTitle` ("Fehlerbericht") stopped being flagged on two learn
 * pages — the word was in a seeded task's instructions_html, not in a UI label.
 */
async function authoredContentText() {
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data } = await supabase.auth.signInWithPassword({
    email: "admin@ditele.local",
    password: PW,
  });
  if (!data?.session) return "";

  const authed = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  // Authored course material, plus free text people typed into the product.
  // A learner's enrolment note ("Bitte um Aufnahme in diesen Kurs.") and an
  // admin's decision reason ("Genehmigt durch die Administration") are German
  // because that is what somebody wrote — translating them would be a bug, not
  // a fix. Both were reported as failures until this was included.
  const [tasks, stages, courses, enrolments, issues, orgs] = await Promise.all([
    authed.from("task_localizations").select("title, instructions_html, hint_text"),
    authed.from("stage_localizations").select("title"),
    authed.from("course_localizations").select("title, summary, description_html"),
    authed.from("enrollments").select("request_note, decision_reason"),
    authed.from("support_issues").select("title, description"),
    authed.from("organizations").select("name"),
  ]);

  return [tasks.data, stages.data, courses.data, enrolments.data, issues.data, orgs.data]
    .flatMap((rows) => rows ?? [])
    .flatMap((row) => Object.values(row))
    .filter((v) => typeof v === "string")
    .join(" ");
}

const CONTENT = await authoredContentText();

const PROBES = { en: probesFor(en), ru: probesFor(ru) };

/** Strip markup and the RSC payload so only visible text is inspected. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

let failures = 0;
let checked = 0;
const offenders = new Map(); // i18n key -> routes it leaked on

for (const locale of ["en", "ru"]) {
  console.log(`\n=== /${locale} (${PROBES[locale].length} German strings probed per page) ===`);
  for (const [email, routes] of Object.entries(ROUTES)) {
    const cookie = await session(email);
    for (const route of routes) {
      const res = await fetch(`${BASE}/${locale}${route}`, { headers: { cookie } });
      const text = visibleText(await res.text());
      const hits = PROBES[locale].filter(([, value]) => text.includes(value));
      checked += 1;

      if (hits.length > 0) {
        failures += 1;
        const shown = hits.slice(0, 4).map(([key]) => key);
        console.log(
          `  GERMAN  ${route.padEnd(52)} ${hits.length} string(s): ${shown.join(", ")}${hits.length > 4 ? " …" : ""}`,
        );
        for (const [key] of hits) {
          if (!offenders.has(key)) offenders.set(key, new Set());
          offenders.get(key).add(`${locale}${route}`);
        }
      } else {
        console.log(`  ok      ${route}`);
      }
    }
  }
}

if (offenders.size > 0) {
  console.log(`\n--- ${offenders.size} untranslated key(s), most widespread first ---`);
  const ranked = [...offenders.entries()].sort((a, b) => b[1].size - a[1].size);
  for (const [key, routes] of ranked.slice(0, 40)) {
    console.log(`  ${key}   (${routes.size} page${routes.size === 1 ? "" : "s"})`);
  }
}

console.log(`\n${checked} page renders checked, ${failures} still showing German.`);
process.exit(failures > 0 ? 1 : 0);
