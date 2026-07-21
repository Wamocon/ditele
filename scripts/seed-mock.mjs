// ---------------------------------------------------------------------------
// WS-0 Task 1d — seed mock data for the DiTeLe V3 build.
//
//   node --env-file=.env.local scripts/seed-mock.mjs
//
// ⚠️⚠️ READ THIS BEFORE EDITING ⚠️⚠️
//
// This database does NOT accept direct table writes. Even an admin session gets
// `42501 permission denied for table …` on attempts, submissions, questions,
// notifications, ratings, profiles and cohorts, and
// `42501 new row violates row-level security policy` on enrollments,
// cohort_memberships and support_issues.
//
// That is deliberate: later migrations revoke DML from `authenticated` and route
// every write through a `SECURITY DEFINER` command RPC. **The RPCs are the only
// write path.** A seed script therefore has to drive the same workflow the app
// drives — which is exactly why the master plan (§4.5) preferred a script over
// raw SQL: it validates plan/status/RPC_CONTRACTS.md while it seeds.
//
// Only these tables accepted a direct admin insert: courses, course_localizations,
// content_versions (verified by WS-0).
//
// 🚨 CURRENTLY BLOCKED — see plan/status/ISSUES.md I-004.
// Sections 2-5 (enrolments, attempts, submissions, questions, ratings) all fail
// with `42501 learning entitlement required`. `request_enrollment` demands a
// public.entitlements row with capability 'catalog' or 'learning'; inserting one
// is refused by RLS even for admin, and none of the 48 RPCs grants an
// entitlement. Only the original learner@ditele.local has one.
//
//   → To unblock: someone with direct Postgres access must run, per learner,
//     insert into public.entitlements
//       (organization_id, user_id, product_package_id, capability, valid_from, source)
//     values
//       ('01980a10-0000-7000-8000-000000000001', '<learner uuid>',
//        '01980a40-0000-7000-8000-000000000001', 'learning', now(), 'manual');
//     Then re-run this script — sections 2-5 become green with no code change.
//
// What DOES currently work when you run it:
//   §1 creates 6 learner auth accounts (profiles + learner roles come from a trigger)
//   §6 creates 2 extra courses so the admin lifecycle bar has draft + in_review
//
// Idempotent: RPC calls carry stable idempotency keys, direct inserts are upserts.
// Never runs a migration, never resets, never touches the 4 original accounts.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "123123123";

const ORG = "01980a10-0000-7000-8000-000000000001";
const COURSE_1 = "01980a20-0000-7000-8000-000000000001";
// kept for reference: the published content version of the seeded course
// const CV_1 = "01980a22-0000-7000-8000-000000000001";
const TASK_1 = "01980a26-0000-7000-8000-000000000001";
const COHORT_1 = "01980a30-0000-7000-8000-000000000001";
const ADMIN = "01980a00-0000-7000-8000-000000000003";
const OPTION_BOUNDARY = "01980a28-0000-7000-8000-000000000001";

const uid = (prefix, n) => `019f9000-${prefix}-7000-8000-${String(n).padStart(12, "0")}`;
const uuid = () => crypto.randomUUID();
const log = (...a) => console.log(...a);

const problems = [];
async function step(label, fn) {
  try {
    const r = await fn();
    log(`  ✅ ${label}${r === undefined ? "" : ` — ${r}`}`);
    return r;
  } catch (e) {
    problems.push(`${label}: ${e.message}`);
    log(`  ❌ ${label} — ${e.message}`);
    return null;
  }
}
function must({ data, error }, what) {
  if (error) throw new Error(`${what} → ${error.code}: ${error.message}${error.details ? ` (${error.details})` : ""}`);
  return data;
}

const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
async function session(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

const admin = await session("admin@ditele.local");
log("Signed in as admin@ditele.local\n");

// ===========================================================================
// 1. Extra learner accounts (Auth Admin API — the one thing the service key can do)
// ===========================================================================
log("1. Learner accounts");
const LEARNERS = [
  { n: 1, name: "Mara Keller" },
  { n: 2, name: "Jonas Weber" },
  { n: 3, name: "Sofia Richter" },
  { n: 4, name: "Elias Brandt" },
  { n: 5, name: "Nina Hoffmann" },
  { n: 6, name: "Tomas Novak" },
];
const { data: existingUsers } = await svc.auth.admin.listUsers({ perPage: 200 });
for (const l of LEARNERS) {
  l.email = `learner${l.n}@ditele.local`;
  await step(`account ${l.email}`, async () => {
    const found = existingUsers.users.find((u) => u.email === l.email);
    if (found) { l.id = found.id; return "exists"; }
    const { data, error } = await svc.auth.admin.createUser({
      email: l.email, password: PASSWORD, email_confirm: true,
      user_metadata: { display_name: l.name },
    });
    if (error) throw new Error(error.message);
    l.id = data.user.id;
    return "created";
  });
}

// ===========================================================================
// 2. Enrolment workflow — request (learner) → decide (admin) → assign (admin)
//    This is WF-1 end to end, driven exactly as the app will drive it.
// ===========================================================================
log("\n2. Enrolments via request_enrollment → decide_enrollment → assign_enrollment");

// leave learner 5 at 'requested' and reject learner 6, so /admin/applications
// has a pending row and a rejected row to render.
const PLAN = [
  { i: 0, decide: "approved", assign: true },
  { i: 1, decide: "approved", assign: true },
  { i: 2, decide: "approved", assign: true },
  { i: 3, decide: "approved", assign: true },
  { i: 4, decide: null, assign: false },          // stays 'requested'
  { i: 5, decide: "rejected", assign: false },
];

for (const p of PLAN) {
  const l = LEARNERS[p.i];
  if (!l.id) continue;
  const learnerClient = await step(`sign in ${l.email}`, () => session(l.email));
  if (!learnerClient) continue;

  await step(`  request_enrollment ${l.name}`, async () => {
    const data = must(
      await learnerClient.rpc("request_enrollment", {
        p_course_id: COURSE_1,
        p_organization_id: ORG,
        p_idempotency_key: `ws0-mock-enroll-${l.n}`,
        p_request_note: "Ich möchte an diesem Kurs teilnehmen.",
      }),
      "request_enrollment"
    );
    l.enrollment = data;
    return typeof data === "object" ? JSON.stringify(data).slice(0, 90) : String(data);
  });

  // find the enrolment row so we can read its row_version for the next call
  const row = await step(`  read enrolment row`, async () => {
    const rows = must(
      await admin.from("enrollments").select("*").eq("learner_id", l.id).order("created_at", { ascending: false }).limit(1),
      "select enrollment"
    );
    if (!rows.length) throw new Error("no enrolment row found after request_enrollment");
    l.enrollmentId = rows[0].id;
    l.enrollmentVersion = rows[0].row_version;
    l.enrollmentState = rows[0].state;
    l.assigned = rows[0].state === "assigned";
    return `${rows[0].id.slice(0, 8)}… state=${rows[0].state} v=${rows[0].row_version}`;
  });
  if (!row || !p.decide) continue;

  // ⚠️ Idempotency guard. Re-deciding an already-decided enrolment does NOT
  //    return a clean error — Kong returns 504 "upstream server is timing out"
  //    after the RPC hangs. Skip anything already past `requested`.
  if (l.enrollmentState !== "requested") {
    log(`  ⏭  already ${l.enrollmentState}, skipping decide/assign`);
    continue;
  }

  await step(`  decide_enrollment ${p.decide}`, async () => {
    must(
      await admin.rpc("decide_enrollment", {
        p_enrollment_id: l.enrollmentId,
        p_decision: p.decide,
        p_reason: p.decide === "rejected" ? "Kapazität für dieses Quartal erreicht." : "Voraussetzungen erfüllt.",
        p_expected_version: l.enrollmentVersion,
        p_correlation_id: uuid(),
      }),
      "decide_enrollment"
    );
    const rows = must(await admin.from("enrollments").select("row_version, state").eq("id", l.enrollmentId), "re-read");
    l.enrollmentVersion = rows[0].row_version;
    return `state=${rows[0].state} v=${rows[0].row_version}`;
  });
  if (!p.assign) continue;

  await step(`  assign_enrollment → cohort 1`, async () => {
    must(
      await admin.rpc("assign_enrollment", {
        p_enrollment_id: l.enrollmentId,
        p_cohort_id: COHORT_1,
        p_reason: "Zuteilung zur laufenden Gruppe.",
        p_expected_version: l.enrollmentVersion,
        p_correlation_id: uuid(),
      }),
      "assign_enrollment"
    );
    const rows = must(await admin.from("enrollments").select("row_version, state").eq("id", l.enrollmentId), "re-read");
    l.enrollmentVersion = rows[0].row_version;
    l.assigned = rows[0].state === "assigned";
    return `state=${rows[0].state} v=${rows[0].row_version}`;
  });
}

// ===========================================================================
// 3. Attempts + submissions — start_attempt → save_attempt_draft → submit_attempt
// ===========================================================================
log("\n3. Attempts & submissions via start_attempt → save_attempt_draft → submit_attempt");
for (const l of LEARNERS) {
  if (!l.assigned) continue;
  const c = await step(`sign in ${l.email}`, () => session(l.email));
  if (!c) continue;

  const attempt = await step(`  start_attempt ${l.name}`, async () => {
    const data = must(
      await c.rpc("start_attempt", {
        p_task_id: TASK_1,
        p_enrollment_id: l.enrollmentId,
        p_correlation_id: uuid(),
        p_idempotency_key: `ws0-mock-attempt-${l.n}`,
      }),
      "start_attempt"
    );
    return data;
  });
  if (!attempt) continue;

  // start_attempt's return shape is not documented anywhere — record it once.
  if (!globalThis.__loggedAttemptShape) {
    globalThis.__loggedAttemptShape = true;
    log(`     ↳ start_attempt returned: ${JSON.stringify(attempt).slice(0, 400)}`);
  }

  // ⚠️ start_attempt returns an ARRAY of one row, not an object.
  //    [{ attempt_id, organization_id, enrollment_id, cohort_id, course_id,
  //       content_version_id, task_id, attempt_state, … }]
  const rec = Array.isArray(attempt) ? attempt[0] : attempt;
  const attemptId = rec?.attempt_id ?? rec?.id ?? (typeof rec === "string" ? rec : null);
  if (!attemptId) { problems.push(`${l.name}: could not find attempt id in start_attempt payload`); continue; }

  const draftVersion = rec?.draft_version ?? rec?.expected_draft_version ?? 0;
  await step(`  save_attempt_draft`, async () => {
    must(
      await c.rpc("save_attempt_draft", {
        p_attempt_id: attemptId,
        p_answer_text:
          "Ich habe die Eingabefelder mit Grenzwerten geprüft: leeres Feld, 1 Zeichen, Maximallänge und Maximallänge+1. " +
          "Bei Maximallänge+1 wird die Eingabe ohne Meldung abgeschnitten.",
        p_selected_option_ids: [OPTION_BOUNDARY],
        p_used_hint_ids: [],
        // ⚠️ p_evidence_draft must be a JSON ARRAY (max 50 items, max 256 KB).
        //    Passing {} fails with `22023 invalid draft payload`.
        p_evidence_draft: [],
        p_elapsed_seconds: 720,
        p_expected_draft_version: draftVersion,
      }),
      "save_attempt_draft"
    );
  });

  // leave learner 4's attempt in_progress so the workspace has a live draft
  if (l.n === 4) { log("     ↳ left in_progress on purpose (live draft for WS-2)"); continue; }

  // ⚠️ This task's skill mapping carries `evidence_required: true`, so
  //    submit_attempt refuses an empty p_evidence_refs with
  //    `22023 verified evidence is required for this task`.
  const evidenceIds = [];
  await step(`  create_external_task_evidence`, async () => {
    const sourceUri = `https://example.invalid/defect-report/${l.n}`;
    const sha = [...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceUri))
    )].map((b) => b.toString(16).padStart(2, "0")).join("");
    const data = must(
      await c.rpc("create_external_task_evidence", {
        p_attempt_id: attemptId,
        p_title: "Fehlerbericht: Eingabe über Maximallänge wird stillschweigend abgeschnitten",
        p_source_uri: sourceUri,
        p_sha256_hex: sha,
        p_idempotency_key: `ws0-mock-evidence-${l.n}`,
      }),
      "create_external_task_evidence"
    );
    if (!globalThis.__loggedEv) {
      globalThis.__loggedEv = true;
      log(`     ↳ create_external_task_evidence returned: ${JSON.stringify(data).slice(0, 300)}`);
    }
    const r = Array.isArray(data) ? data[0] : data;
    const id = r?.evidence_id ?? r?.id;
    if (id) evidenceIds.push(id);
    return id ? `evidence ${String(id).slice(0, 8)}…` : "no id in payload";
  });

  await step(`  submit_attempt`, async () => {
    const rows = must(await admin.from("attempts").select("row_version").eq("id", attemptId), "read attempt version");
    must(
      await c.rpc("submit_attempt", {
        p_attempt_id: attemptId,
        p_answer_text:
          "Grenzwertanalyse an allen Eingabefeldern. Gefundener Fehler: Eingaben über der Maximallänge werden " +
          "stillschweigend abgeschnitten, statt eine Validierungsmeldung zu zeigen.",
        p_selected_option_ids: [OPTION_BOUNDARY],
        p_evidence_refs: evidenceIds,
        p_expected_version: rows[0]?.row_version ?? 1,
        p_correlation_id: uuid(),
        p_idempotency_key: `ws0-mock-submit-${l.n}`,
      }),
      "submit_attempt"
    );
  });
}

// ===========================================================================
// 4. Questions via create_question, then claim/answer as the trainer
// ===========================================================================
log("\n4. Questions via create_question → claim_question → answer_question");
const trainer = await session("trainer@ditele.local");
const SUBJECTS = [
  { i: 0, subject: "Wie grenze ich Äquivalenzklassen ab?", answer: true },
  { i: 1, subject: "Welche Schwere für einen Layout-Fehler?", answer: true },
  { i: 2, subject: "Zählt ein Timeout als funktionaler Fehler?", answer: false },
  { i: 3, subject: "Wie viele Testfälle sind genug?", answer: false },
];
for (const s of SUBJECTS) {
  const l = LEARNERS[s.i];
  if (!l.assigned) continue;
  const c = await session(l.email);
  const qid = await step(`create_question "${s.subject.slice(0, 34)}…"`, async () => {
    const data = must(
      await c.rpc("create_question", {
        p_task_id: TASK_1,
        p_cohort_id: COHORT_1,
        p_subject: s.subject,
        p_body: "Ich komme hier nicht weiter und würde mich über einen Hinweis freuen.",
        p_correlation_id: uuid(),
        p_idempotency_key: `ws0-mock-question-${l.n}`,
      }),
      "create_question"
    );
    if (!globalThis.__loggedQ) { globalThis.__loggedQ = true; log(`     ↳ create_question returned: ${JSON.stringify(data).slice(0, 300)}`); }
    return data?.question_id ?? data?.id ?? data;
  });
  if (!qid || !s.answer || typeof qid !== "string") continue;

  await step(`  claim_question`, async () => {
    const rows = must(await admin.from("questions").select("row_version").eq("id", qid), "read question version");
    must(
      await trainer.rpc("claim_question", {
        p_question_id: qid,
        p_expected_version: rows[0]?.row_version ?? 1,
        p_correlation_id: uuid(),
        // key must be unique per (question, payload) — reuse raises 22023
        p_idempotency_key: `ws0-mock-claim-${qid}`,
      }),
      "claim_question"
    );
  });
  await step(`  answer_question`, async () => {
    const rows = must(await admin.from("questions").select("row_version").eq("id", qid), "read question version");
    must(
      await trainer.rpc("answer_question", {
        p_question_id: qid,
        p_body:
          "Guter Ansatz. Schau dir die Grenzwerte an den Rändern der Eingabefelder an — leer, 1 Zeichen, " +
          "Maximallänge und Maximallänge+1 — und dokumentiere jeden Schritt einzeln.",
        p_expected_version: rows[0]?.row_version ?? 1,
        p_correlation_id: uuid(),
        p_idempotency_key: `ws0-mock-answer-${l.n}`,
      }),
      "answer_question"
    );
  });
}

// ===========================================================================
// 5. Ratings via rate_course / rate_task
// ===========================================================================
log("\n5. Ratings via rate_course / rate_task");
const SCORES = [5, 4, 5, 3, 4, 2];
const COMMENTS = [
  "Sehr praxisnah, die Testumgebung hat mir viel gebracht.",
  "Gut aufgebaut, an manchen Stellen etwas schnell.",
  "Die Aufgaben sind realistisch und fordernd.",
  "Solide, aber die Hinweise könnten früher kommen.",
  "Der Aufbau des Fehlerberichts war das Nützlichste für mich.",
  "Zu wenig Erklärung vor der ersten Praxisaufgabe.",
];
for (let i = 0; i < LEARNERS.length; i++) {
  const l = LEARNERS[i];
  if (!l.assigned) continue;
  const c = await session(l.email);
  for (const kind of ["course", "task"]) {
    await step(`rate_${kind} ${l.name} ${SCORES[i]}★`, async () => {
      must(
        await c.rpc(`rate_${kind}`, {
          ...(kind === "course" ? { p_course_id: COURSE_1 } : { p_task_id: TASK_1 }),
          p_score: SCORES[i],
          p_comment: COMMENTS[i],
          p_expected_version: 0,
          p_correlation_id: uuid(),
          p_idempotency_key: `ws0-mock-rate-${kind}-${l.n}`,
        }),
        `rate_${kind}`
      );
    });
  }
}

// ===========================================================================
// 6. Two more courses so the admin lifecycle bar has draft + in_review
//    (courses / course_localizations / content_versions DO accept direct inserts)
// ===========================================================================
log("\n6. Extra courses (draft / in review)");
const EXTRA = [
  {
    n: 1, slug: "testautomatisierung-grundlagen", state: "in_review", minutes: 360,
    de: { title: "Testautomatisierung — Grundlagen", summary: "Erste Schritte in der automatisierten Testausführung." },
    en: { title: "Test Automation Fundamentals", summary: "First steps in automated test execution." },
    ru: { title: "Основы автоматизации тестирования", summary: "Первые шаги в автоматизации." },
  },
  {
    n: 2, slug: "api-testing-praxis", state: "draft", minutes: 300,
    de: { title: "API-Testing in der Praxis", summary: "REST-Schnittstellen systematisch prüfen." },
    en: { title: "Practical API Testing", summary: "Systematically test REST interfaces." },
    ru: { title: "Практика тестирования API", summary: "Системная проверка REST." },
  },
];
for (const c of EXTRA) {
  const courseId = uid("000c", c.n);
  await step(`course ${c.slug}`, async () => {
    must(
      await admin.from("courses").upsert(
        { id: courseId, organization_id: ORG, slug: c.slug, state: "active",
          default_locale: "de", estimated_minutes: c.minutes, created_by: ADMIN },
        { onConflict: "id" }
      ),
      "upsert course"
    );
  });
  for (const [locale, text] of Object.entries({ de: c.de, en: c.en, ru: c.ru })) {
    await step(`  localization ${locale}`, async () => {
      must(
        await admin.from("course_localizations").upsert(
          { id: uid("000e", c.n * 10 + { de: 1, en: 2, ru: 3 }[locale]),
            course_id: courseId, locale, title: text.title, summary: text.summary,
            description_html: `<p>${text.summary}</p>`, learning_outcomes: [text.summary] },
          { onConflict: "id" }
        ),
        "upsert course localization"
      );
    });
  }
  await step(`  content version (${c.state})`, async () => {
    must(
      await admin.from("content_versions").upsert(
        { id: uid("000d", c.n), course_id: courseId, version_number: 1, state: c.state,
          change_summary: `Entwurf für ${c.de.title}`, snapshot: {}, created_by: ADMIN },
        { onConflict: "id" }
      ),
      "upsert content version"
    );
  });
}

// ===========================================================================
log("\n--- verification (counts as seen by the admin session) ---");
for (const t of [
  "courses", "content_versions", "cohorts", "cohort_memberships", "enrollments",
  "attempts", "submissions", "questions", "question_messages", "notifications",
  "ratings", "profiles", "user_roles",
]) {
  const { count, error } = await admin.from(t).select("*", { count: "exact" }).limit(1);
  log(`  ${t.padEnd(20)} ${error ? `ERR ${error.code}` : count}`);
}

if (problems.length) {
  log(`\n⚠️  ${problems.length} step(s) failed:`);
  for (const p of problems) log(`   - ${p}`);
  process.exit(1);
}
log("\n✅ seed complete, no failures");
