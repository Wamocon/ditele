"use server";

import { randomUUID } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { hasPermission, hasRole } from "@/shared/auth/authorization";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import { isLocale, locales, type Locale } from "@/shared/i18n/config";

import { cohortManagementCopy } from "../cohort-management-copy";
import {
  classifyCohortCommandRpcError,
  parseCohortTransitionForm,
  parseTaskScheduleForm,
  type CohortCommandActionState,
} from "../cohort-management-validation";

const freshCohortSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  course_id: z.string().uuid(),
  content_version_id: z.string().uuid().nullable(),
});

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;
type CommandPerspective = "admin" | "trainer";

function errorState(
  message: string,
  fieldErrors?: CohortCommandActionState["fieldErrors"],
): CohortCommandActionState {
  return fieldErrors
    ? { status: "error", message, fieldErrors }
    : { status: "error", message };
}

function localeFromForm(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "en";
}

function validationFailure(
  error: unknown,
  locale: Locale,
): CohortCommandActionState {
  const copy = cohortManagementCopy[locale];
  if (!(error instanceof ZodError)) return errorState(copy.invalidInput);
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field] = copy.requiredField;
    }
  }
  return errorState(copy.invalidInput, fieldErrors);
}

function routeFor(
  locale: Locale,
  perspective: CommandPerspective,
  cohortId: string,
): Route {
  return `/${locale}/${perspective}/groups/${cohortId}` as Route;
}

function staleRedirect(
  locale: Locale,
  perspective: CommandPerspective,
  cohortId: string,
): never {
  redirect(`${routeFor(locale, perspective, cohortId)}?notice=stale` as Route);
}

function successRedirect(
  locale: Locale,
  perspective: CommandPerspective,
  cohortId: string,
  notice: "started" | "completed" | "cancelled" | "schedule_saved",
): never {
  redirect(`${routeFor(locale, perspective, cohortId)}?notice=${notice}` as Route);
}

function revalidateCohortRoutes(cohortId: string): void {
  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/groups`);
    revalidatePath(`/${locale}/admin/groups/${cohortId}`);
    revalidatePath(`/${locale}/trainer/groups`);
    revalidatePath(`/${locale}/trainer/groups/${cohortId}`);
    revalidatePath(`/${locale}/learn`, "layout");
  }
}

function managerScope(principal: Principal, organizationId: string): boolean {
  return (
    hasPermission(principal, "cohort.manage") &&
    (hasRole(principal, "admin") || principal.organizationId === organizationId)
  );
}

// Supabase's generated function argument metadata marks PostgreSQL parameters
// as non-null even when the command intentionally accepts SQL null to clear a
// schedule boundary. Zod has already narrowed this boundary to string | null;
// the assertion preserves the runtime null sent through PostgREST.
function nullableRpcTimestamp(value: string | null): string {
  return value as string;
}

async function authorizeFreshCohort(
  cohortId: string,
  perspective: CommandPerspective,
): Promise<
  | {
      readonly ok: true;
      readonly client: ServerClient;
      readonly principal: Principal;
      readonly cohort: z.infer<typeof freshCohortSchema>;
      readonly canManage: boolean;
      readonly assignedTrainer: boolean;
    }
  | { readonly ok: false; readonly reason: "session" | "forbidden" | "failed" }
> {
  let principal: Principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof AuthenticationRequiredError ? "session" : "failed",
    };
  }
  const roleAllowed =
    perspective === "admin"
      ? hasRole(principal, "admin") || hasRole(principal, "organization_admin")
      : hasRole(principal, "trainer") || hasRole(principal, "admin");
  if (!roleAllowed) return { ok: false, reason: "forbidden" };

  const client = await createServerClient();
  const { data, error } = await client
    .from("cohorts")
    .select("id, organization_id, course_id, content_version_id")
    .eq("id", cohortId)
    .maybeSingle();
  if (error) return { ok: false, reason: "failed" };
  const cohort = freshCohortSchema.safeParse(data);
  if (!cohort.success) return { ok: false, reason: "forbidden" };

  const canManage = managerScope(principal, cohort.data.organization_id);
  const { data: trainerMembership, error: trainerMembershipError } =
    await client
      .from("cohort_memberships")
      .select("id")
      .eq("cohort_id", cohort.data.id)
      .eq("user_id", principal.userId)
      .eq("role", "trainer")
      .eq("state", "active")
      .maybeSingle();
  if (trainerMembershipError) return { ok: false, reason: "failed" };
  const assignedTrainer =
    trainerMembership !== null &&
    hasRole(principal, "trainer") &&
    hasPermission(principal, "cohort.read");
  const perspectiveAllowed =
    perspective === "admin" ? canManage : canManage || assignedTrainer;
  return perspectiveAllowed
    ? {
        ok: true,
        client,
        principal,
        cohort: cohort.data,
        canManage,
        assignedTrainer,
      }
    : { ok: false, reason: "forbidden" };
}

function authorizationFailure(
  reason: "session" | "forbidden" | "failed",
  locale: Locale,
): CohortCommandActionState {
  const copy = cohortManagementCopy[locale];
  if (reason === "session") return errorState(copy.sessionExpired);
  if (reason === "forbidden") return errorState(copy.forbidden);
  return errorState(copy.failed);
}

function rpcFailure(
  error: PostgrestError,
  operation: "transition" | "schedule",
  locale: Locale,
  perspective: CommandPerspective,
  cohortId: string,
): CohortCommandActionState {
  const copy = cohortManagementCopy[locale];
  switch (classifyCohortCommandRpcError(error, operation)) {
    case "stale":
      staleRedirect(locale, perspective, cohortId);
    case "forbidden":
      return errorState(copy.forbidden);
    case "illegal_transition":
      return errorState(copy.illegalTransition);
    case "invalid_schedule":
      return errorState(copy.invalidSchedule);
    case "idempotency":
      return errorState(copy.idempotencyConflict);
    case "input":
      return errorState(copy.invalidInput);
    case "failed":
      return errorState(copy.failed);
  }
}

export async function transitionCohortAction(
  previousState: CohortCommandActionState,
  formData: FormData,
): Promise<CohortCommandActionState> {
  void previousState;
  const locale = localeFromForm(formData);
  let input: ReturnType<typeof parseCohortTransitionForm>;
  try {
    input = parseCohortTransitionForm(formData);
  } catch (error) {
    return validationFailure(error, locale);
  }
  const access = await authorizeFreshCohort(input.cohortId, input.perspective);
  if (!access.ok) return authorizationFailure(access.reason, input.locale);
  if (input.targetState === "cancelled" && !access.canManage) {
    return errorState(cohortManagementCopy[input.locale].forbidden);
  }

  const { error } = await access.client.rpc("transition_cohort", {
    p_cohort_id: input.cohortId,
    p_expected_version: input.expectedVersion,
    p_target_state: input.targetState,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: randomUUID(),
  });
  if (error) {
    return rpcFailure(
      error,
      "transition",
      input.locale,
      input.perspective,
      input.cohortId,
    );
  }
  revalidateCohortRoutes(input.cohortId);
  successRedirect(
    input.locale,
    input.perspective,
    input.cohortId,
    input.targetState === "active"
      ? "started"
      : input.targetState === "completed"
        ? "completed"
        : "cancelled",
  );
}

export async function updateTaskScheduleAction(
  previousState: CohortCommandActionState,
  formData: FormData,
): Promise<CohortCommandActionState> {
  void previousState;
  const locale = localeFromForm(formData);
  let input: ReturnType<typeof parseTaskScheduleForm>;
  try {
    input = parseTaskScheduleForm(formData);
  } catch (error) {
    return validationFailure(error, locale);
  }
  const access = await authorizeFreshCohort(input.cohortId, input.perspective);
  if (!access.ok) return authorizationFailure(access.reason, input.locale);

  const [taskResult, scheduleResult] = await Promise.all([
    access.cohort.content_version_id
      ? access.client
          .from("tasks")
          .select("id")
          .eq("id", input.taskId)
          .eq("course_id", access.cohort.course_id)
          .eq("content_version_id", access.cohort.content_version_id)
          .eq("state", "active")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    access.client
      .from("task_schedules")
      .select("id, row_version")
      .eq("cohort_id", input.cohortId)
      .eq("task_id", input.taskId)
      .maybeSingle(),
  ]);
  if (taskResult.error || scheduleResult.error) {
    return errorState(cohortManagementCopy[input.locale].failed);
  }
  if (!taskResult.data) {
    return errorState(cohortManagementCopy[input.locale].invalidSchedule);
  }
  // Do not reject a local CAS mismatch. The database checks an idempotency
  // receipt first, which preserves a retry after a lost success response.
  const { error } = await access.client.rpc("update_task_schedule", {
    p_available_from: nullableRpcTimestamp(input.availableFrom),
    p_cohort_id: input.cohortId,
    p_correlation_id: randomUUID(),
    p_due_at: nullableRpcTimestamp(input.dueAt),
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason,
    p_task_id: input.taskId,
  });
  if (error) {
    return rpcFailure(
      error,
      "schedule",
      input.locale,
      input.perspective,
      input.cohortId,
    );
  }
  revalidateCohortRoutes(input.cohortId);
  successRedirect(
    input.locale,
    input.perspective,
    input.cohortId,
    "schedule_saved",
  );
}
