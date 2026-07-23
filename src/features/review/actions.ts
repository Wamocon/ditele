"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/shared/auth/guard";
import { createServiceRoleClient } from "@/shared/database/service-role";
import { reviewSubmission, type ReviewOutcome } from "@/shared/data/review";
import type { ProfileActionState, ReviewActionState } from "./action-state";

/**
 * Layer 2 of three: the trainer layout guards the *render*, not the POST. Every
 * action below re-checks the role, and the database RLS (plus the scope check
 * inside `reviewSubmission`) remains the real boundary.
 */

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const decisionSchema = z.enum(["accepted", "needs_revision"]);

export async function reviewSubmissionAction(
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  await requireRole(["trainer", "admin"]);

  const submissionId = text(formData, "submissionId");
  const locale = text(formData, "locale") || "de";
  const comment = text(formData, "comment");
  const parsedDecision = decisionSchema.safeParse(text(formData, "decision"));

  if (!z.uuid().safeParse(submissionId).success) {
    return { status: "error", message: "Ungültige Einreichung.", decided: false };
  }
  if (!parsedDecision.success) {
    return { status: "error", message: "Bitte eine Entscheidung wählen.", decided: false };
  }
  if (comment.length === 0) {
    return { status: "error", message: "Bitte hinterlassen Sie einen Kommentar.", decided: false };
  }

  const result = await reviewSubmission({
    submissionId,
    decision: parsedDecision.data,
    comment,
  });
  if (!result.ok) {
    return { status: "error", message: result.error.message, decided: false };
  }

  revalidatePath(`/${locale}/trainer`);
  revalidatePath(`/${locale}/trainer/submissions`);
  revalidatePath(`/${locale}/trainer/submissions/${submissionId}`);
  revalidatePath(`/${locale}/trainer/progress`);

  return { status: "success", message: outcomeMessage(result.data), decided: true };
}

/** Human-readable German summary, including the XP/badge grant on an arena accept. */
function outcomeMessage(outcome: ReviewOutcome): string {
  if (outcome.decision === "needs_revision") {
    return "Zur Nachbesserung zurückgegeben. Der Lernende kann die Aufgabe erneut bearbeiten.";
  }
  if (outcome.taskKind !== "arena") {
    return "Angenommen.";
  }
  const parts: string[] = ["Angenommen."];
  if (outcome.xpAwarded > 0) parts.push(`${outcome.xpAwarded} XP vergeben.`);
  if (outcome.badgeName) parts.push(`Abzeichen „${outcome.badgeName}" freigeschaltet.`);
  return parts.join(" ");
}

/* ── Own profile ─────────────────────────────────────────────────────────── */

export async function updateTrainerProfileAction(
  _prev: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const { principal } = await requireRole(["trainer", "admin"]);

  const displayName = text(formData, "displayName");
  const avatarUrl = text(formData, "avatarUrl");
  const locale = text(formData, "locale") || "de";

  if (displayName.length === 0) {
    return { status: "error", message: "Bitte geben Sie einen Anzeigenamen an." };
  }
  if (avatarUrl.length > 0 && !z.url().safeParse(avatarUrl).success) {
    return { status: "error", message: "Die Avatar-URL ist ungültig." };
  }

  // Scoped strictly to the caller's own row, so the service-role client cannot
  // touch anyone else's profile.
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: displayName,
      avatar_url: avatarUrl.length > 0 ? avatarUrl : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", principal.userId);

  if (error) {
    return { status: "error", message: "Das Profil konnte nicht gespeichert werden." };
  }

  revalidatePath(`/${locale}/trainer/profile`);
  return { status: "success", message: "Profil gespeichert." };
}
