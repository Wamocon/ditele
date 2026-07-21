import "server-only";

import { z } from "zod";
import { createServerClient } from "@/shared/database/server";
import { requirePrincipal } from "@/shared/auth/principal";
import { err, ok, fromSupabase, type Result } from "./result";
import { failPostgrest, shapeError } from "./profile";
import {
  markAllNotificationsRead,
  markNotificationRead,
  newCorrelationId,
} from "./rpc";

/**
 * WS-3 · notifications and notification preferences.
 *
 * Reads come straight off the `notifications` table — RLS scopes it to the
 * recipient. Writes are RPC-only, like every other domain write on this
 * deployment (RPC_CONTRACTS.md §0.6), and every one of them needs the row's
 * current `row_version`, so a mark-read is always a read-then-write pair.
 */

const NotificationSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  template_key: z.string(),
  payload: z.unknown(),
  state: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  row_version: z.number(),
});

export type NotificationRow = z.infer<typeof NotificationSchema>;

export interface Notification extends NotificationRow {
  isUnread: boolean;
  /** Ids lifted out of the jsonb payload, for the deep link. */
  questionId: string | null;
  courseId: string | null;
  taskId: string | null;
}

const PayloadIdsSchema = z
  .object({
    question_id: z.string().optional(),
    course_id: z.string().optional(),
    task_id: z.string().optional(),
  })
  .partial();

function decorate(row: NotificationRow): Notification {
  const ids = PayloadIdsSchema.safeParse(row.payload);
  return {
    ...row,
    isUnread: row.read_at === null,
    questionId: ids.success ? (ids.data.question_id ?? null) : null,
    courseId: ids.success ? (ids.data.course_id ?? null) : null,
    taskId: ids.success ? (ids.data.task_id ?? null) : null,
  };
}

export interface NotificationPage {
  items: Notification[];
  total: number;
  unread: number;
}

/**
 * Newest first. `limit`/`offset` from day one (02_WORKSTREAMS §5.5 rule 2) —
 * this is a direct table query, so real `.range()` pagination is available
 * here even though the list RPCs cannot paginate.
 */
export async function listMyNotifications(
  args: { limit?: number; offset?: number } = {}
): Promise<Result<NotificationPage>> {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const supabase = await createServerClient();

  const page = await fromSupabase<{ rows: unknown[]; count: number }>(async () => {
    const { data, error, count } = await supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    return { data: error ? null : { rows: data ?? [], count: count ?? 0 }, error };
  });
  if (!page.ok) return page;

  const parsed = z.array(NotificationSchema).safeParse(page.data.rows);
  if (!parsed.success) return shapeError("Die Benachrichtigungen");

  // `{ count: "exact", head: true }` silently fails on this PostgREST build
  // (WS-0.md), so the unread count is a second bounded query, not a HEAD.
  const unread = await fromSupabase<number>(async () => {
    const { error, count } = await supabase
      .from("notifications")
      .select("id", { count: "exact" })
      .is("read_at", null)
      .limit(1);
    return { data: error ? null : (count ?? 0), error };
  });

  return ok({
    items: parsed.data.map(decorate),
    total: page.data.count,
    unread: unread.ok ? unread.data : parsed.data.filter((n) => n.read_at === null).length,
  });
}

/**
 * Reads the row first because `mark_notification_read` demands the current
 * `p_expected_version` and rejects anything below 1.
 */
export async function markOneNotificationRead(notificationId: string): Promise<Result<unknown>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, row_version, read_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) return failPostgrest(error);
  if (!data) return err({ code: "PGRST116", message: "Nicht gefunden.", retryable: false });
  // Already read: nothing to do, and re-deciding a settled row is the shape of
  // bug I-007 (the call hangs instead of erroring). Guard before calling.
  if (data.read_at !== null) return ok(data);

  return markNotificationRead({
    notificationId,
    expectedVersion: data.row_version,
    idempotencyKey: `notification-read:${notificationId}`,
  });
}

export async function markEveryNotificationRead(): Promise<Result<unknown>> {
  return markAllNotificationsRead({
    before: new Date().toISOString(),
    idempotencyKey: `notifications-read-all:${newCorrelationId()}`,
  });
}

/* ── Preferences ────────────────────────────────────────────────────────── */

/**
 * The five families `set_notification_family_preferences` accepts. Hardcoding a
 * sixth raises `22023` — the list is validated inside the RPC
 * (migration …099500 line 466).
 */
export const NOTIFICATION_FAMILIES = [
  "enrollment",
  "review",
  "question",
  "submission",
  "certificate",
] as const;

export type NotificationFamily = (typeof NOTIFICATION_FAMILIES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

const PreferenceRowSchema = z.object({
  event_family: z.string(),
  channel: z.string(),
  enabled: z.boolean(),
  row_version: z.number(),
});

export interface FamilyPreference {
  family: NotificationFamily;
  inApp: { enabled: boolean; version: number };
  email: { enabled: boolean; version: number };
  push: { enabled: boolean; version: number };
}

/**
 * A learner starts with **no** preference rows at all. A missing row means
 * "default on", and the RPC treats `expected_version = 0` as "create it", so
 * the absent case is represented as version 0 rather than hidden.
 */
export async function listMyNotificationPreferences(): Promise<Result<FamilyPreference[]>> {
  const principal = await requirePrincipal().catch(() => null);
  if (!principal) return err({ code: "AUTH", message: "Nicht angemeldet.", retryable: false });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_family, channel, enabled, row_version")
    .eq("user_id", principal.userId);

  if (error) return failPostgrest(error);
  const parsed = z.array(PreferenceRowSchema).safeParse(data ?? []);
  if (!parsed.success) return shapeError("Die Benachrichtigungseinstellungen");

  const find = (family: string, channel: string) =>
    parsed.data.find((row) => row.event_family === family && row.channel === channel);

  return ok(
    NOTIFICATION_FAMILIES.map((family) => {
      const inApp = find(family, "in_app");
      const email = find(family, "email");
      const push = find(family, "push");
      return {
        family,
        inApp: { enabled: inApp?.enabled ?? true, version: inApp?.row_version ?? 0 },
        email: { enabled: email?.enabled ?? false, version: email?.row_version ?? 0 },
        push: { enabled: push?.enabled ?? false, version: push?.row_version ?? 0 },
      };
    })
  );
}

/**
 * ⚠️ Three separate expected-version values, one per channel — the RPC updates
 * all three rows in one call (RPC_CONTRACTS.md §7).
 */
export async function saveNotificationFamilyPreference(args: {
  family: NotificationFamily;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  expectedInAppVersion: number;
  expectedEmailVersion: number;
  expectedPushVersion: number;
}): Promise<Result<unknown>> {
  const supabase = await createServerClient();
  return fromSupabase<unknown>(async () => {
    const { data, error } = await supabase.rpc("set_notification_family_preferences", {
      p_event_family: args.family,
      p_in_app_enabled: args.inAppEnabled,
      p_email_enabled: args.emailEnabled,
      p_push_enabled: args.pushEnabled,
      p_expected_in_app_version: args.expectedInAppVersion,
      p_expected_email_version: args.expectedEmailVersion,
      p_expected_push_version: args.expectedPushVersion,
      p_correlation_id: newCorrelationId(),
      // The RPC rejects an idempotency key outside 16–200 characters.
      p_idempotency_key: `notification-prefs:${args.family}:${newCorrelationId()}`,
    });
    return { data, error };
  });
}
