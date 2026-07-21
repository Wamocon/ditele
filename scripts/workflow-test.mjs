#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Workflow coverage test — Workflows A..F of
// anforderung/01_RESEARCH_LERNPLATTFORM.md section 2.1.
//
//   node --env-file=.env.local scripts/workflow-test.mjs
//
// smoke.mjs proves a route answers 200. This proves the WORKFLOW STEPS exist:
// for each step of each flowchart it loads the screen that step happens on, as
// the role that performs it, and asserts the step's control or data is actually
// on the page. A 200 with an empty <main> fails here.
//
// Every assertion names the workflow node it comes from, so a failure says
// which box of which flowchart is not implemented.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3107").replace(/\/$/, "");
const L = "de";
const PW = "123123123";
const COURSE = "01980a20-0000-7000-8000-000000000001";
const TASK = "01980a26-0000-7000-8000-000000000001";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing Supabase env. Run with: node --env-file=.env.local scripts/workflow-test.mjs");
  process.exit(2);
}

async function session(email) {
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const parts = [
    `sb-access-token=${data.session.access_token}`,
    `sb-refresh-token=${data.session.refresh_token}`,
  ];
  // The @supabase/ssr cookie name is derived from the project ref.
  const ref = new URL(url).host.split(".")[0].replace(/[^a-zA-Z0-9]/g, "");
  parts.push(
    `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: "bearer",
      user: data.session.user,
    }))}`,
  );
  return parts.join("; ");
}

async function page(path, cookie) {
  const res = await fetch(`${BASE}/${L}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const body = res.status < 400 ? await res.text() : "";
  return { status: res.status, body, location: res.headers.get("location") };
}

const results = [];
function check(wf, node, path, ok, detail) {
  results.push({ wf, node, path, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${wf}  ${node.padEnd(38)} ${path}${ok ? "" : `   <- ${detail}`}`);
}

/** Assert the page contains every one of these (case-insensitive). */
function has(body, ...needles) {
  const miss = needles.filter((n) => !new RegExp(n, "i").test(body));
  return { ok: miss.length === 0, detail: miss.length ? `missing: ${miss.join(", ")}` : "" };
}

const main = async () => {
  console.log(`Workflow coverage against ${BASE}\n`);
  const learner = await session("learner@ditele.local");
  const trainer = await session("trainer@ditele.local");
  const admin = await session("admin@ditele.local");

  // ── Workflow A — Theorie-Lernpfad ────────────────────────────────────────
  console.log("Workflow A — Theorie-Lernpfad (Kurs -> Modul -> Video -> PDF -> Quiz -> Meilenstein)");
  {
    let p = await page("/learn/courses", learner);
    let r = has(p.body, "kurs");
    check("A", "Kursstart / Modul auswählen", "/learn/courses", p.status === 200 && r.ok, r.detail || `status ${p.status}`);

    p = await page(`/learn/courses/${COURSE}`, learner);
    r = has(p.body, "aufgabe|lektion|einheit");
    check("A", "Modul auswählen (Stufen/Aufgaben)", `/learn/courses/:id`, p.status === 200 && r.ok, r.detail || `status ${p.status}`);

    p = await page(`/learn/tasks/${TASK}`, learner);
    check("A", "Video ansehen", "/learn/tasks/:id", /<video|videoplayer|video_url|youtube|iframe/i.test(p.body), "no video element in the task workspace");
    check("A", "PDF-Skript lesen", "/learn/tasks/:id", /pdf|<object|skript/i.test(p.body), "no PDF viewer in the task workspace");
    r = has(p.body, "antwort|abgeben|quiz|frage");
    check("A", "Quiz absolvieren", "/learn/tasks/:id", r.ok, r.detail);
    check("A", "Meilenstein / Fortschritt", "/learn/courses/:id", /fortschritt|%|abgeschlossen/i.test((await page(`/learn/courses/${COURSE}`, learner)).body), "no progress indicator");
  }

  // ── Workflow B — Praxis-Lernpfad ─────────────────────────────────────────
  console.log("\nWorkflow B — Praxis-Lernpfad (Intro -> Szenario -> iFrame -> Defect -> Review)");
  {
    const p = await page(`/learn/tasks/${TASK}`, learner);
    check("B", "Intro-Video", "/learn/tasks/:id", /intro|einf(ü|ue)hrung|<video/i.test(p.body), "no intro video slot");
    check("B", "Szenario lesen", "/learn/tasks/:id", /szenario|beschreibung|aufgabe/i.test(p.body), "no scenario text");
    check("B", "Externe Applikation (iFrame)", "/learn/tasks/:id", /iframe|testumgebung|externe/i.test(p.body), "no practice target panel");
    check("B", "Defect-Management erfassen", "/learn/tasks/:id", /defect|fehler|schweregrad|severity|nachweis|evidenz/i.test(p.body), "no defect/evidence form");
    check("B", "Aufgabe einreichen", "/learn/tasks/:id", /abgeben|einreichen/i.test(p.body), "no submit control");
  }

  // ── Workflow C — Trainer-Verwaltung ──────────────────────────────────────
  console.log("\nWorkflow C — Trainer-Verwaltung");
  {
    let p = await page("/trainer", trainer);
    check("C", "Dashboard", "/trainer", p.status === 200 && /(ü|ue)bersicht|review|frage/i.test(p.body), `status ${p.status}`);

    p = await page("/trainer/submissions", trainer);
    check("C", "Review-Queue (ausstehend)", "/trainer/submissions", p.status === 200 && /review|abgabe|eingereicht|warte/i.test(p.body), `status ${p.status}`);

    p = await page("/trainer/questions", trainer);
    check("C", "Fragen beantworten (Q&A)", "/trainer/questions", p.status === 200 && /frage/i.test(p.body), `status ${p.status}`);

    p = await page("/trainer/progress", trainer);
    check("C", "Lernende-Übersicht (Echtzeit-Fortschritt)", "/trainer/progress", p.status === 200 && /fortschritt|lernende|teilnehmer/i.test(p.body), `status ${p.status}`);

    p = await page("/trainer/submissions", trainer);
    check("C", "Bulk-Aktionen", "/trainer/submissions", /bulk|mehrfach|auswählen|checkbox|type="checkbox"/i.test(p.body), "NOT IMPLEMENTED - no bulk selection in the review queue");
  }

  // ── Workflow D — Admin-Steuerung ─────────────────────────────────────────
  console.log("\nWorkflow D — Admin-Steuerung");
  {
    let p = await page("/admin", admin);
    check("D", "System-Dashboard", "/admin", p.status === 200 && /(ü|ue)bersicht|kurs|benutzer/i.test(p.body), `status ${p.status}`);

    p = await page("/admin/users", admin);
    check("D", "User-Management (CRUD)", "/admin/users", p.status === 200 && /benutzer|rolle/i.test(p.body), `status ${p.status}`);

    p = await page("/admin/courses", admin);
    check("D", "Course-Editor", "/admin/courses", p.status === 200 && /kurs/i.test(p.body), `status ${p.status}`);

    p = await page(`/admin/courses/${COURSE}`, admin);
    check("D", "Unit erstellen / Content hinzufügen", "/admin/courses/:id", p.status === 200 && /version|stufe|aufgabe|sprachfassung/i.test(p.body), `status ${p.status}`);

    p = await page("/admin/applications", admin);
    check("D", "Kursanfragen entscheiden", "/admin/applications", p.status === 200 && /anfrage|antrag|genehmig|ablehn/i.test(p.body), `status ${p.status}`);

    p = await page("/admin/settings", admin);
    check("D", "System-Einstellungen", "/admin/settings", p.status === 200, `status ${p.status}`);

    p = await page("/admin/users", admin);
    check("D", "Trainer zu Kursen zuweisen", "/admin/users", /trainer.*kurs|kurs.*trainer|zuweis/i.test(p.body), "NOT IMPLEMENTED - no course/trainer assignment UI (course_trainers exists in DB)");
  }

  // ── Workflow E — Fehlererstattung (Bug-Report) ───────────────────────────
  console.log("\nWorkflow E — Fehlererstattung");
  {
    const p = await page("/admin/issues", admin);
    check("E", "Admin Bug-Report-Inbox", "/admin/issues", p.status === 200 && /fehler|meldung|issue/i.test(p.body), `status ${p.status}`);
    check("E", "Status setzen / Priorität", "/admin/issues", /status|priorit/i.test(p.body), "no triage controls");

    const s = await page("/learn", learner);
    check("E", "Student meldet Fehler", "/learn (any screen)", /fehler melden|bug|problem melden/i.test(s.body), "NOT IMPLEMENTED - no 'report a problem' entry point for students");
  }

  // ── Workflow F — Content-Feedback ────────────────────────────────────────
  console.log("\nWorkflow F — Content-Feedback");
  {
    const a = await page("/admin/ratings", admin);
    check("F", "Admin Aggregation", "/admin/ratings", a.status === 200 && /bewertung|rating|durchschnitt/i.test(a.body), `status ${a.status}`);

    const t = await page(`/learn/tasks/${TASK}`, learner);
    check("F", "Feedback-Prompt nach Abschluss", "/learn/tasks/:id", /bewert|stern|feedback/i.test(t.body), "NOT IMPLEMENTED - no rating prompt on the task screen");

    const c = await page(`/learn/courses/${COURSE}`, learner);
    check("F", "Kurs bewerten", "/learn/courses/:id", /bewert|stern|feedback/i.test(c.body), "NOT IMPLEMENTED - no course rating control");
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const byWf = {};
  for (const r of results) {
    byWf[r.wf] ??= { pass: 0, fail: 0, gaps: [] };
    if (r.ok) byWf[r.wf].pass += 1;
    else {
      byWf[r.wf].fail += 1;
      byWf[r.wf].gaps.push(`${r.node} (${r.detail})`);
    }
  }
  console.log("\n" + "=".repeat(78));
  console.log("WORKFLOW COVERAGE");
  for (const [wf, s] of Object.entries(byWf)) {
    const total = s.pass + s.fail;
    console.log(`  Workflow ${wf}: ${s.pass}/${total} steps implemented`);
    for (const g of s.gaps) console.log(`      GAP: ${g}`);
  }
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n  TOTAL ${pass}/${results.length} workflow steps verified`);
  process.exit(pass === results.length ? 0 : 1);
};

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
