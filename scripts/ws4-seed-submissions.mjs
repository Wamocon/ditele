// WS-4 — create real submissions so the review queue and the review detail
// screen can be built against data instead of guesses.
//
// ISSUES.md I-006 concluded submissions cannot be seeded because the task has
// `evidence_required: true`. Reading submit_attempt's source shows the check is
// only "an evidence row owned by this actor for this task exists" — which
// create_external_task_evidence does produce. No upload pipeline needed.
//
//   node --env-file=.env.local scripts/ws4-seed-submissions.mjs
//
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = "123123123";

const LEARNERS = [
  { email: "learner1@ditele.local", answer: "Beim Login mit gültigen Zugangsdaten erscheint kurz die Fehlermeldung 'Ungültige Daten', bevor die Startseite geladen wird.\n\nSchritte:\n1. /login öffnen\n2. Gültige Zugangsdaten eingeben\n3. Auf 'Anmelden' klicken\n\nErwartet: direkte Weiterleitung ohne Fehlermeldung.\nTatsächlich: Fehlermeldung blitzt für ca. 400 ms auf." },
  { email: "learner2@ditele.local", answer: "Das Passwortfeld akzeptiert Eingaben über 128 Zeichen, der Server lehnt sie dann mit einem 500er ab.\n\nSchritte:\n1. Registrierung öffnen\n2. Passwort mit 200 Zeichen eingeben\n3. Absenden\n\nErwartet: Validierungsmeldung im Formular.\nTatsächlich: Serverfehler 500." },
  { email: "learner3@ditele.local", answer: "Nach dreimaliger Fehleingabe wird die Sperre nicht angezeigt, der Button bleibt aktiv.\n\nErwartet: Hinweis auf die Wartezeit.\nTatsächlich: keine Rückmeldung, erst der vierte Versuch meldet einen Fehler." },
  { email: "learner4@ditele.local", answer: "Die Fehlermeldung ist auf 375 px Breite abgeschnitten und nicht vollständig lesbar.\n\nErwartet: umbrechender Text.\nTatsächlich: horizontaler Überlauf." },
];

async function session(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

for (const [i, learner] of LEARNERS.entries()) {
  console.log(`\n──────── ${learner.email}`);
  try {
    const c = await session(learner.email);

    const { data: attempts, error: attemptError } = await c
      .from("attempts")
      .select("id,task_id,state,row_version")
      .eq("state", "in_progress");
    if (attemptError) throw attemptError;
    if (!attempts?.length) {
      console.log("  no in_progress attempt — skipped");
      continue;
    }
    const attempt = attempts[0];
    console.log("  attempt", attempt.id, "v" + attempt.row_version);

    const sha = createHash("sha256").update(`ws4-evidence-${learner.email}`).digest("hex");
    const { data: evidence, error: evidenceError } = await c.rpc("create_external_task_evidence", {
      p_attempt_id: attempt.id,
      p_title: "Screenshot des Fehlverhaltens",
      p_source_uri: `https://example.invalid/ws4/defect-${i + 1}.png`,
      p_sha256_hex: sha,
      p_idempotency_key: `ws4-external-evidence-seed-${i + 1}`,
    });
    if (evidenceError) throw evidenceError;
    console.log("  evidence", JSON.stringify(evidence));

    const evidenceId =
      typeof evidence === "string"
        ? evidence
        : (evidence?.evidence_id ?? evidence?.id ?? evidence?.[0]?.evidence_id ?? evidence?.[0]?.id);
    if (!evidenceId) throw new Error("could not read an evidence id from the payload");

    const { data: task } = await c.rpc("get_my_learning_task", { p_task_id: attempt.task_id });
    const optionIds = (task?.assessment?.options ?? []).map((o) => o.id);
    const selected = optionIds.length ? [optionIds[i % optionIds.length]] : [];

    const { data: submitted, error: submitError } = await c.rpc("submit_attempt", {
      p_attempt_id: attempt.id,
      p_answer_text: learner.answer,
      p_selected_option_ids: selected,
      p_evidence_refs: [evidenceId],
      p_expected_version: attempt.row_version,
      p_correlation_id: crypto.randomUUID(),
      p_idempotency_key: `ws4-submit-attempt-seed-${i + 1}`,
    });
    if (submitError) throw submitError;
    console.log("  ✅ submitted:", JSON.stringify(submitted));
  } catch (e) {
    console.log("  ❌", e.code ?? "", e.message ?? e);
  }
}
