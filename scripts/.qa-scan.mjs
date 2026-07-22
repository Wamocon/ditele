// Student-view locale audit: visible text AND accessible-name attributes.
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3999";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const ROUTES = [
  "/learn", "/learn/courses", "/learn/tasks", "/learn/history",
  "/learn/questions", "/learn/questions/new", "/learn/notifications",
  "/learn/profile", "/learn/certificates",
  "/learn/courses/01980a20-0000-7000-8000-000000000001",
  "/learn/tasks/01980a26-0000-7000-8000-000000000001",
  "/learn/enroll/01980a20-0000-7000-8000-000000000001",
];

// German course content is German-only by design (commit 8a507cb).
const CONTENT = [/Testfallentwurf/, /Checkout dieses Shops/, /Checkout-Jagd/, /Practical Software Testing/];

const RE = /[äöüßÄÖÜ]|\b(der|die|das|und|oder|nicht|kein|keine|noch|dein|deine|für|von|mit|auf|zum|zur|über|unter|durch|ohne|wird|werden|wurde|hat|hast|sind|ist|sein|kannst|kann|musst|muss|soll|alle|alles|jede|hier|dort|dann|wenn|weil|aber|auch|sehr|mehr|neue|neuen|zurück|weiter|anzeigen|ansehen|öffnen|Öffnet|speichern|abbrechen|senden|hinzufügen|löschen|bearbeiten|erstellen|anlegen|suchen|wählen|Aufgabe|Aufgaben|Kurs|Kurse|Frage|Fragen|Abgabe|Abgaben|Fortschritt|Übersicht|Einstellungen|Benachrichtigung|Benachrichtigungen|Zertifikat|Zertifikate|Verlauf|Profil|Stufe|Hinweis|Hinweise|Punkte|erledigt|offen|Anmelden|Abmelden|Navigation|nötig|Eintrag|Eingabe|Fehler|Datensatz|Berechtigung|Server|Verbindung|Video|Startseite|Sprache|Konto|Design|Schließen|Unbekannter|gefunden)\b/;

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
const decode = (s) => s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
  .replace(/&#x27;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&[a-z]+;/gi, " ").trim();

function visible(html) {
  return strip(html).replace(/<[^>]+>/g, "\n").split("\n").map(decode).filter(Boolean);
}
/** aria-label, title, placeholder, alt — the names a screen reader reads out. */
function attributes(html) {
  const out = [];
  for (const m of strip(html).matchAll(/\b(aria-label|title|placeholder|alt)="([^"]+)"/gi)) {
    const v = decode(m[2]);
    if (v) out.push(`[${m[1]}] ${v}`);
  }
  return out;
}

const sb = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await sb.auth.signInWithPassword({
  email: "learner@ditele.local", password: "123123123",
});
if (error) { console.error("login failed:", error.message); process.exit(2); }
const ref = new URL(url).host.split(".")[0].replace(/[^a-zA-Z0-9]/g, "");
const cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: data.session.access_token, refresh_token: data.session.refresh_token,
  expires_at: data.session.expires_at, token_type: "bearer", user: data.session.user,
}))}`;

let bad = 0, checked = 0;
for (const locale of ["en", "ru"]) {
  for (const route of ROUTES) {
    const res = await fetch(`${BASE}/${locale}${route}`, { headers: { cookie } });
    const html = await res.text();
    const hits = [...new Set([...visible(html), ...attributes(html)])]
      .filter((l) => RE.test(l))
      .filter((l) => !CONTENT.some((c) => c.test(l)));
    checked += 1;
    if (hits.length) { bad += 1; console.log(`  GERMAN /${locale}${route}`); hits.forEach((h) => console.log(`      ${h}`)); }
    else console.log(`  ok     /${locale}${route}`);
  }
}
console.log(`\n${checked} renders checked, ${bad} with German UI chrome.`);
process.exit(bad > 0 ? 1 : 0);
