"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/shared/auth/guard";
import { newPasswordSchema } from "@/shared/auth/password-policy";
import {
  assignEnrollment,
  createAdminUser,
  decideEnrollment,
  resetUserPassword,
  setUserActive,
  setUserRole,
  transitionCohortState,
  updateCohortSchedule,
  updateOwnAdminProfile,
  updateSupportIssueState,
  COHORT_STATES,
  type CohortState,
} from "@/shared/data/admin";
import { fromDateTimeLocalValue } from "./format";
import { ISSUE_STATES, type ActionState, type CreateUserState } from "./action-state";

/**
 * ⚠️ Layer 2 of three (MASTER_PLAN §9.3). The `(admin)` layout guard stops a
 * *render*; it does not protect a POST. Every action below re-checks the role
 * before it touches anything, and the database's RLS is still the real boundary.
 */

const success = (message: string): ActionState => ({ status: "success", message });
const failure = (message: string): ActionState => ({ status: "error", message });

/** Guard + a stable German message for anything that escapes. */
async function guarded(run: () => Promise<ActionState>): Promise<ActionState> {
  await requireRole(["admin"]);
  try {
    return await run();
  } catch {
    return failure("Die Aktion konnte nicht ausgeführt werden.");
  }
}

const text = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

/* ── Enrolment applications ─────────────────────────────────────────────── */

export async function decideEnrollmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const enrollmentId = text(formData, "enrollmentId");
    const decision = text(formData, "decision");
    const reason = text(formData, "reason");

    if (!z.uuid().safeParse(enrollmentId).success) return failure("Ungültige Anfrage.");
    if (decision !== "approved" && decision !== "rejected") return failure("Ungültige Entscheidung.");
    if (decision === "rejected" && reason.length === 0) {
      return failure("Bitte geben Sie eine Begründung an.");
    }

    const result = await decideEnrollment({
      enrollmentId,
      decision,
      reason: reason || "Genehmigt durch die Administration",
    });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/applications", "page");
    return success(decision === "approved" ? "Anfrage genehmigt." : "Anfrage abgelehnt.");
  });
}

export async function assignEnrollmentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const enrollmentId = text(formData, "enrollmentId");
    const cohortId = text(formData, "cohortId");

    if (!z.uuid().safeParse(enrollmentId).success) return failure("Ungültige Anfrage.");
    if (!z.uuid().safeParse(cohortId).success) return failure("Bitte wählen Sie eine Gruppe.");

    const result = await assignEnrollment({
      enrollmentId,
      cohortId,
      reason: "Zuteilung durch die Administration",
    });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/applications", "page");
    revalidatePath("/[locale]/(admin)/admin/groups", "page");
    return success("Der Gruppe zugeteilt.");
  });
}

/* ── Users ──────────────────────────────────────────────────────────────── */

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  await requireRole(["admin"]);
  try {
    const email = text(formData, "email");
    const displayName = text(formData, "displayName");
    const password = formData.get("password");
    const roleId = text(formData, "roleId");

    if (!z.email().safeParse(email).success) {
      return failure("Bitte geben Sie eine gültige E-Mail-Adresse an.");
    }
    if (displayName.length === 0) return failure("Bitte geben Sie einen Anzeigenamen an.");
    if (!z.uuid().safeParse(roleId).success) return failure("Bitte wählen Sie eine Rolle.");
    if (typeof password !== "string" || !newPasswordSchema.safeParse(password).success) {
      return failure(
        "Das Passwort muss mindestens 12 Zeichen lang sein und Groß- und Kleinbuchstaben, eine Ziffer und ein Sonderzeichen enthalten."
      );
    }

    const result = await createAdminUser({ email, password, displayName, roleId });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/users", "page");
    return { status: "success", message: "Konto angelegt.", userId: result.data.userId };
  } catch {
    return failure("Das Konto konnte nicht angelegt werden.");
  }
}

export async function setUserRoleAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const userId = text(formData, "userId");
    const roleId = text(formData, "roleId");
    if (!z.uuid().safeParse(userId).success) return failure("Ungültiges Konto.");
    if (!z.uuid().safeParse(roleId).success) return failure("Bitte wählen Sie eine Rolle.");

    const result = await setUserRole({ userId, roleId });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/users", "page");
    revalidatePath("/[locale]/(admin)/admin/users/[userId]", "page");
    return success("Rolle geändert.");
  });
}

export async function setUserActiveAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const userId = text(formData, "userId");
    const active = text(formData, "active") === "true";
    if (!z.uuid().safeParse(userId).success) return failure("Ungültiges Konto.");

    const result = await setUserActive({ userId, active });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/users", "page");
    revalidatePath("/[locale]/(admin)/admin/users/[userId]", "page");
    return success(active ? "Konto aktiviert." : "Konto deaktiviert.");
  });
}

export async function resetUserPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const userId = text(formData, "userId");
    const password = formData.get("password");
    if (!z.uuid().safeParse(userId).success) return failure("Ungültiges Konto.");
    if (typeof password !== "string" || !newPasswordSchema.safeParse(password).success) {
      return failure(
        "Das Passwort muss mindestens 12 Zeichen lang sein und Groß- und Kleinbuchstaben, eine Ziffer und ein Sonderzeichen enthalten."
      );
    }

    const result = await resetUserPassword({ userId, password });
    if (!result.ok) return failure(result.error.message);
    return success("Passwort gesetzt. Bitte dem Konto sicher mitteilen.");
  });
}

/* ── Cohorts ────────────────────────────────────────────────────────────── */

function parseCohortTarget(value: string): CohortState | null {
  return COHORT_STATES.find((s) => s === value) ?? null;
}

export async function transitionCohortAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const cohortId = text(formData, "cohortId");
    const targetState = parseCohortTarget(text(formData, "targetState"));
    const reason = text(formData, "reason");

    if (!z.uuid().safeParse(cohortId).success) return failure("Ungültige Gruppe.");
    if (!targetState) return failure("Ungültiger Zielstatus.");
    if (reason.length === 0) return failure("Bitte geben Sie eine Begründung an.");

    const result = await transitionCohortState({ cohortId, targetState, reason });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/groups", "page");
    revalidatePath("/[locale]/(admin)/admin/groups/[cohortId]", "page");
    return success("Status geändert.");
  });
}

export async function updateCohortScheduleAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const cohortId = text(formData, "cohortId");
    const name = text(formData, "name");
    const capacityRaw = text(formData, "capacity");
    if (!z.uuid().safeParse(cohortId).success) return failure("Ungültige Gruppe.");
    if (name.length === 0) return failure("Bitte geben Sie einen Namen an.");

    const capacity = capacityRaw === "" ? null : Number.parseInt(capacityRaw, 10);
    if (capacity !== null && (Number.isNaN(capacity) || capacity < 0)) {
      return failure("Die Kapazität muss eine positive Zahl sein.");
    }

    const startsAt = fromDateTimeLocalValue(text(formData, "startsAt"));
    const endsAt = fromDateTimeLocalValue(text(formData, "endsAt"));
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      return failure("Das Ende darf nicht vor dem Beginn liegen.");
    }

    const result = await updateCohortSchedule({ cohortId, name, capacity, startsAt, endsAt });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/groups", "page");
    revalidatePath("/[locale]/(admin)/admin/groups/[cohortId]", "page");
    return success("Stammdaten gespeichert.");
  });
}

/* ── Support issues ─────────────────────────────────────────────────────── */

export async function updateSupportIssueStateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const issueId = text(formData, "issueId");
    const state = text(formData, "state");
    if (!z.uuid().safeParse(issueId).success) return failure("Ungültige Meldung.");
    if (!ISSUE_STATES.some((s) => s === state)) return failure("Ungültiger Status.");

    const result = await updateSupportIssueState({ issueId, state });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/issues", "page");
    return success("Status gesetzt.");
  });
}

/* ── Own profile ────────────────────────────────────────────────────────── */

export async function updateOwnProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return guarded(async () => {
    const displayName = text(formData, "displayName");
    const locale = text(formData, "locale");
    const timezone = text(formData, "timezone");
    const expectedVersion = Number.parseInt(text(formData, "expectedVersion"), 10);

    if (displayName.length === 0) return failure("Bitte geben Sie einen Anzeigenamen an.");
    if (Number.isNaN(expectedVersion)) return failure("Bitte laden Sie die Seite neu.");

    const result = await updateOwnAdminProfile({
      displayName,
      locale: locale || "de",
      timezone: timezone || "UTC",
      expectedVersion,
    });
    if (!result.ok) return failure(result.error.message);

    revalidatePath("/[locale]/(admin)/admin/profile", "page");
    return success("Profil gespeichert.");
  });
}
