#!/usr/bin/env node
// Dump every visible word a student sees on /en (and flag German-looking ones).
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3107").replace(/\/$/, "");
const PW = "123123123";
const LOCALE = process.argv[2] ?? "en";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const ROUTES = [
  "/learn",
  "/learn/courses",
  "/learn/tasks",
  "/learn/history",
  "/learn/questions",
  "/learn/questions/new",
  "/learn/notifications",
  "/learn/profile",
  "/learn/certificates",
  "/learn/courses/01980a20-0000-7000-8000-000000000001",
  "/learn/tasks/01980a26-0000-7000-8000-000000000001",
  "/learn/enroll/01980a20-0000-7000-8000-000000000001",
];

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

function visibleText(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return body
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z]+;/gi, " ")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Heuristics for "this is German, not English".
const GERMAN_RE =
  /[äöüßÄÖÜ]|\b(der|die|das|und|oder|nicht|kein|keine|noch|schon|dein|deine|mein|meine|ein|eine|einen|einem|einer|für|von|mit|auf|zum|zur|bei|nach|über|unter|durch|ohne|gegen|wird|wurde|werden|wurden|haben|hat|hast|sind|ist|sein|kannst|kann|musst|muss|soll|sollen|alle|alles|jede|jeden|hier|dort|dann|wenn|weil|aber|auch|sehr|mehr|neu|neue|neuen|zurück|weiter|anzeigen|ansehen|öffnen|speichern|abbrechen|senden|hinzufügen|löschen|bearbeiten|erstellen|anlegen|suchen|filtern|Aufgabe|Aufgaben|Kurs|Kurse|Frage|Fragen|Abgabe|Abgaben|Fortschritt|Übersicht|Einstellungen|Benachrichtigung|Benachrichtigungen|Zertifikat|Zertifikate|Verlauf|Profil|Stufe|Stufen|Hinweis|Hinweise|Punkte|Bewertung|erledigt|offen|bestanden|Willkommen|Anmelden|Abmelden)\b/;

async function main() {
  const cookie = await session("learner@ditele.local");
  for (const route of ROUTES) {
    const res = await fetch(`${BASE}/${LOCALE}${route}`, { headers: { cookie } });
    const lines = visibleText(await res.text());
    const uniq = [...new Set(lines)];
    const german = uniq.filter((l) => GERMAN_RE.test(l));
    console.log(`\n########## ${LOCALE}${route}  (${res.status})  ${uniq.length} strings, ${german.length} German-looking`);
    for (const g of german) console.log(`  DE| ${g}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
