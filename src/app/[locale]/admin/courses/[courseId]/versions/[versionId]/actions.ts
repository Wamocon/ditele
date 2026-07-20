"use server";

import { randomUUID } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";

import { getPrincipal } from "@/app/[locale]/_data/principal";
import { hasPermission } from "@/shared/auth/authorization";
import { AuthenticationRequiredError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";
import { isLocale, locales, type Locale } from "@/shared/i18n/config";

import { adminContentCopy, type ContentLifecycleCopy } from "../../../copy";
import {
  classifyContentLifecycleRpcError,
  parseContentArchiveCommand,
  parseContentLifecycleCommand,
  parseContentReviewCommand,
  type ContentLifecycleActionState,
  type ContentLifecycleOperation,
} from "../../../lifecycle-validation";
import { contentVersionStateSchema } from "../../../model";

const freshVersionSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  state: contentVersionStateSchema,
  row_version: z.number().int().positive(),
});

const courseSlugSchema = z.object({ slug: z.string().min(1) });

type ServerClient = Awaited<ReturnType<typeof createServerClient>>;

type CommandContext = {
  readonly client: ServerClient;
  readonly courseSlug: string | null;
};

type ContextResult =
  | { readonly ok: true; readonly context: CommandContext }
  | { readonly ok: false; readonly state: ContentLifecycleActionState };

function errorState(
  message: string,
  fieldErrors?: ContentLifecycleActionState["fieldErrors"],
): ContentLifecycleActionState {
  return fieldErrors
    ? { status: "error", message, fieldErrors }
    : { status: "error", message };
}

function localeFromForm(formData: FormData): Locale {
  const value = formData.get("locale");
  return typeof value === "string" && isLocale(value) ? value : "en";
}

function lifecycleRole(principal: Principal): boolean {
  return principal.roles.some((role) => role === "admin" || role === "content_admin");
}

function staleRedirect(locale: Locale, courseId: string, versionId: string): never {
  redirect(
    `/${locale}/admin/courses/${courseId}/versions/${versionId}?notice=stale` as Route,
  );
}

function successRedirect(
  locale: Locale,
  courseId: string,
  versionId: string,
  notice: "submitted" | "review_approved" | "changes_requested" | "published" | "archived",
): never {
  redirect(
    `/${locale}/admin/courses/${courseId}/versions/${versionId}?notice=${notice}` as Route,
  );
}

function zodFailure(
  error: unknown,
  copy: ContentLifecycleCopy,
): ContentLifecycleActionState {
  if (!(error instanceof ZodError)) return errorState(copy.invalidInput);
  const paths = new Set(error.issues.map((issue) => issue.path[0]));
  const fields: {
    comment?: string;
    decision?: string;
    reason?: string;
    confirmImpact?: string;
  } = {};
  if (paths.has("comment")) fields.comment = copy.requiredField;
  if (paths.has("decision")) fields.decision = copy.requiredField;
  if (paths.has("reason")) fields.reason = copy.requiredField;
  if (paths.has("confirmImpact")) fields.confirmImpact = copy.requiredField;
  return errorState(copy.invalidInput, fields);
}

function rpcFailure(
  error: PostgrestError,
  operation: ContentLifecycleOperation,
  copy: ContentLifecycleCopy,
  locale: Locale,
  courseId: string,
  versionId: string,
): ContentLifecycleActionState {
  const failure = classifyContentLifecycleRpcError(error, operation);
  switch (failure) {
    case "stale":
      staleRedirect(locale, courseId, versionId);
    case "forbidden":
      return errorState(copy.forbidden);
    case "readiness":
      return errorState(copy.readinessFailed);
    case "approval":
      return errorState(copy.approvalRequired);
    case "idempotency":
      return errorState(copy.idempotencyConflict);
    case "input":
      return errorState(copy.invalidInput);
    case "failed":
      return errorState(copy.failed);
  }
}

async function authorizeAndReadVersion({
  courseId,
  contentVersionId,
  locale,
  permission,
}: {
  readonly courseId: string;
  readonly contentVersionId: string;
  readonly locale: Locale;
  readonly permission: "content.manage" | "content.publish";
}): Promise<ContextResult> {
  const copy = adminContentCopy[locale].lifecycle;
  let principal: Principal;
  try {
    principal = await getPrincipal();
  } catch (error) {
    return {
      ok: false,
      state: errorState(
        error instanceof AuthenticationRequiredError ? copy.sessionExpired : copy.failed,
      ),
    };
  }
  if (!lifecycleRole(principal) || !hasPermission(principal, permission)) {
    return { ok: false, state: errorState(copy.forbidden) };
  }

  const client = await createServerClient();
  const { data, error } = await client
    .from("content_versions")
    .select("id, course_id, state, row_version")
    .eq("id", contentVersionId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) return { ok: false, state: errorState(copy.failed) };
  const parsed = freshVersionSchema.safeParse(data);
  if (!parsed.success) return { ok: false, state: errorState(copy.forbidden) };

  // Do not short-circuit an optimistic mismatch here. The audited RPC checks
  // an existing idempotency receipt before its state/CAS guard, so a client
  // retry after a lost success response must be allowed to reach that receipt.
  // A new stale or wrong-state command is still rejected atomically by the RPC.

  const { data: courseData } = await client
    .from("courses")
    .select("slug")
    .eq("id", parsed.data.course_id)
    .maybeSingle();
  const course = courseSlugSchema.safeParse(courseData);
  return {
    ok: true,
    context: {
      client,
      courseSlug: course.success ? course.data.slug : null,
    },
  };
}

function revalidateConnectedContent(
  courseId: string,
  versionId: string,
  courseSlug: string | null,
): void {
  for (const locale of locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/admin`);
    revalidatePath(`/${locale}/admin/courses`);
    revalidatePath(`/${locale}/admin/courses/${courseId}`);
    revalidatePath(`/${locale}/admin/courses/${courseId}/versions/${versionId}`);
    revalidatePath(`/${locale}/admin/courses/${courseId}/versions/${versionId}/preview`);
    revalidatePath(`/${locale}/admin/tasks`);
    revalidatePath(`/${locale}/catalog`);
    if (courseSlug) revalidatePath(`/${locale}/catalog/${courseSlug}`);
    revalidatePath(`/${locale}/learn`, "layout");
    revalidatePath(`/${locale}/learn/courses/${courseId}`);
  }
}

export async function submitContentForReviewAction(
  previousState: ContentLifecycleActionState,
  formData: FormData,
): Promise<ContentLifecycleActionState> {
  void previousState;
  const locale = localeFromForm(formData);
  const copy = adminContentCopy[locale].lifecycle;
  let input: ReturnType<typeof parseContentLifecycleCommand>;
  try {
    input = parseContentLifecycleCommand(formData);
  } catch (error) {
    return zodFailure(error, copy);
  }
  const result = await authorizeAndReadVersion({
    courseId: input.courseId,
    contentVersionId: input.contentVersionId,
    locale: input.locale,
    permission: "content.manage",
  });
  if (!result.ok) return result.state;
  const { error } = await result.context.client.rpc("submit_content_for_review", {
    p_content_version_id: input.contentVersionId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: randomUUID(),
  });
  if (error) {
    return rpcFailure(error, "submit", copy, input.locale, input.courseId, input.contentVersionId);
  }
  revalidateConnectedContent(input.courseId, input.contentVersionId, result.context.courseSlug);
  successRedirect(input.locale, input.courseId, input.contentVersionId, "submitted");
}

export async function decideContentReviewAction(
  previousState: ContentLifecycleActionState,
  formData: FormData,
): Promise<ContentLifecycleActionState> {
  void previousState;
  const locale = localeFromForm(formData);
  const copy = adminContentCopy[locale].lifecycle;
  let input: ReturnType<typeof parseContentReviewCommand>;
  try {
    input = parseContentReviewCommand(formData);
  } catch (error) {
    return zodFailure(error, copy);
  }
  const result = await authorizeAndReadVersion({
    courseId: input.courseId,
    contentVersionId: input.contentVersionId,
    locale: input.locale,
    permission: "content.publish",
  });
  if (!result.ok) return result.state;
  const { error } = await result.context.client.rpc("decide_content_review", {
    p_comment: input.comment,
    p_content_version_id: input.contentVersionId,
    p_correlation_id: randomUUID(),
    p_decision: input.decision,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    return rpcFailure(error, "review", copy, input.locale, input.courseId, input.contentVersionId);
  }
  revalidateConnectedContent(input.courseId, input.contentVersionId, result.context.courseSlug);
  successRedirect(
    input.locale,
    input.courseId,
    input.contentVersionId,
    input.decision === "approved" ? "review_approved" : "changes_requested",
  );
}

export async function publishContentVersionAction(
  previousState: ContentLifecycleActionState,
  formData: FormData,
): Promise<ContentLifecycleActionState> {
  void previousState;
  const locale = localeFromForm(formData);
  const copy = adminContentCopy[locale].lifecycle;
  let input: ReturnType<typeof parseContentLifecycleCommand>;
  try {
    input = parseContentLifecycleCommand(formData);
  } catch (error) {
    return zodFailure(error, copy);
  }
  const result = await authorizeAndReadVersion({
    courseId: input.courseId,
    contentVersionId: input.contentVersionId,
    locale: input.locale,
    permission: "content.publish",
  });
  if (!result.ok) return result.state;
  const { error } = await result.context.client.rpc("publish_content_version", {
    p_content_version_id: input.contentVersionId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: randomUUID(),
  });
  if (error) {
    return rpcFailure(error, "publish", copy, input.locale, input.courseId, input.contentVersionId);
  }
  revalidateConnectedContent(input.courseId, input.contentVersionId, result.context.courseSlug);
  successRedirect(input.locale, input.courseId, input.contentVersionId, "published");
}

export async function archiveContentVersionAction(
  previousState: ContentLifecycleActionState,
  formData: FormData,
): Promise<ContentLifecycleActionState> {
  void previousState;
  const locale = localeFromForm(formData);
  const copy = adminContentCopy[locale].lifecycle;
  let input: ReturnType<typeof parseContentArchiveCommand>;
  try {
    input = parseContentArchiveCommand(formData);
  } catch (error) {
    return zodFailure(error, copy);
  }
  const result = await authorizeAndReadVersion({
    courseId: input.courseId,
    contentVersionId: input.contentVersionId,
    locale: input.locale,
    permission: "content.publish",
  });
  if (!result.ok) return result.state;
  const { error } = await result.context.client.rpc("archive_content_version", {
    p_content_version_id: input.contentVersionId,
    p_expected_version: input.expectedVersion,
    p_impact_fingerprint: input.impactFingerprint,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: randomUUID(),
  });
  if (error) {
    return rpcFailure(error, "archive", copy, input.locale, input.courseId, input.contentVersionId);
  }
  revalidateConnectedContent(input.courseId, input.contentVersionId, result.context.courseSlug);
  successRedirect(input.locale, input.courseId, input.contentVersionId, "archived");
}
