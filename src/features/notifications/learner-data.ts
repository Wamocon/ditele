import "server-only";

import { z } from "zod";

import { hasRole } from "@/shared/auth/authorization";
import { AuthorizationDeniedError } from "@/shared/auth/errors";
import type { Principal } from "@/shared/auth/types";
import { createServerClient } from "@/shared/database/server";

import {
  buildLearnerNotificationPreferences,
  learnerNotificationChannels,
  learnerNotificationEventFamilies,
  projectLearnerNotification,
  type LearnerNotificationCenter,
} from "./learner-model";

const pageSchema = z.number().int().positive().max(10_000);
const timezoneSchema = z.object({
  timezone: z.string().min(1).max(100),
});
const notificationPageSize = 20;
const snapshotSchema = z.string().datetime({ offset: true });
const maximumSnapshotClockSkewMs = 5 * 60 * 1_000;

export function resolveLearnerNotificationSnapshot(
  input: string | undefined,
  now = new Date(),
): string {
  if (input === undefined) return now.toISOString();
  const parsed = snapshotSchema.parse(input);
  const snapshot = new Date(parsed);
  if (snapshot.valueOf() > now.valueOf() + maximumSnapshotClockSkewMs) {
    throw new Error("notifications.snapshot_is_in_the_future");
  }
  return snapshot.toISOString();
}

export async function readLearnerNotificationCenter(
  principal: Principal,
  pageInput: number,
  snapshotInput?: string,
): Promise<LearnerNotificationCenter> {
  if (!hasRole(principal, "learner")) {
    throw new AuthorizationDeniedError("notifications.read_self");
  }
  const page = pageSchema.parse(pageInput);
  const client = await createServerClient();
  const start = (page - 1) * notificationPageSize;
  const end = start + notificationPageSize - 1;
  const snapshotAt = resolveLearnerNotificationSnapshot(snapshotInput);

  const [pageResult, unreadResult, preferenceResult, profileResult] =
    await Promise.all([
      client
        .from("notifications")
        .select(
          "id, event_type, template_key, payload, state, read_at, created_at, row_version",
          { count: "exact" },
        )
        .eq("recipient_id", principal.userId)
        .is("cancelled_at", null)
        .neq("state", "cancelled")
        .lte("created_at", snapshotAt)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end),
      client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", principal.userId)
        .is("read_at", null)
        .is("cancelled_at", null)
        .neq("state", "cancelled")
        .lte("created_at", snapshotAt),
      client
        .from("notification_preferences")
        .select("channel, event_family, enabled, row_version")
        .eq("user_id", principal.userId)
        .in("channel", [...learnerNotificationChannels])
        .in("event_family", [...learnerNotificationEventFamilies]),
      client
        .from("profiles")
        .select("timezone")
        .eq("user_id", principal.userId)
        .maybeSingle(),
    ]);

  if (
    pageResult.error
    || unreadResult.error
    || preferenceResult.error
    || profileResult.error
  ) {
    throw new Error("notifications.learner_center_read_failed", {
      cause:
        pageResult.error
        ?? unreadResult.error
        ?? preferenceResult.error
        ?? profileResult.error,
    });
  }
  const timezone = timezoneSchema.parse(profileResult.data).timezone;
  const total = pageResult.count ?? 0;
  return {
    items: (pageResult.data ?? []).map(projectLearnerNotification),
    preferences: buildLearnerNotificationPreferences(
      preferenceResult.data ?? [],
    ),
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / notificationPageSize)),
    unreadCount: unreadResult.count ?? 0,
    snapshotAt,
    timezone,
  };
}
