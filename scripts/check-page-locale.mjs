#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Rendered-page locale check.
//
//   node --env-file=.env.local scripts/check-page-locale.mjs
//
// i18n:check compares JSON files. This checks what a signed-in user actually
// SEES: it fetches each route as the right role in /en and /ru and looks for
// German words in the rendered HTML.
//
// Why it exists: every admin.* key was present in en.json and the pages still
// rendered German, because features/content/i18n.ts held a German-only BUNDLES
// map. File-level coverage said 100%; the screen said otherwise. Only a check
// against rendered output catches that class of bug.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3107").replace(/\/$/, "");
const PW = "123123123";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing Supabase env. Run with: node --env-file=.env.local scripts/check-page-locale.mjs");
  process.exit(2);
}

// Distinctive German words that should never survive into /en or /ru.
// Deliberately words with no English/Russian collision.
const GERMAN = [
  "Kursverwaltung", "Benutzerverwaltung", "Aufgaben-Inventar", "System-Übersicht",
  "Kurs anlegen", "Benutzer anlegen", "Einstellungen", "Kennzahlen", "Speichern",
  "Zurück", "Anmeldung", "Kennung", "Entwurf", "Stufen", "Veröffentlichung",
  "Willkommen", "Fehlermeldungen", "Kursanfragen", "Gruppenverwaltung",
  "Anzeigename", "Rolle ändern", "Passwort setzen", "Abgaben", "Fortschritt",
];

const ROUTES = {
  "admin@ditele.local": [
    "/admin", "/admin/courses", "/admin/courses/new", "/admin/tasks",
    "/admin/users", "/admin/users/new", "/admin/applications",
    "/admin/issues", "/admin/settings", "/admin/profile",
  ],
  "trainer@ditele.local": [
    "/trainer", "/trainer/submissions", "/trainer/questions",
    "/trainer/progress", "/trainer/history", "/trainer/profile",
  ],
  "learner@ditele.local": [
    "/learn", "/learn/courses", "/learn/tasks", "/learn/history",
    "/learn/questions", "/learn/notifications", "/learn/profile",
  ],
};

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

/** Strip tags, scripts and the RSC payload so we only inspect visible text. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ");
}

let failures = 0;
let checked = 0;

for (const locale of ["en", "ru"]) {
  console.log(`\n=== /${locale} ===`);
  for (const [email, routes] of Object.entries(ROUTES)) {
    const cookie = await session(email);
    for (const route of routes) {
      const res = await fetch(`${BASE}/${locale}${route}`, { headers: { cookie } });
      const text = visibleText(await res.text());
      const found = [...new Set(GERMAN.filter((w) => text.includes(w)))];
      checked += 1;
      if (found.length > 0) {
        failures += 1;
        console.log(`  GERMAN  ${route.padEnd(24)} ${found.join(", ")}`);
      } else {
        console.log(`  ok      ${route}`);
      }
    }
  }
}

console.log(`\n${checked} page renders checked, ${failures} still showing German.`);
process.exit(failures > 0 ? 1 : 0);
