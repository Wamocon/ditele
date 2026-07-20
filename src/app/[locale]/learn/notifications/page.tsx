import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";
import { z } from "zod";

import {
  canRenderProtectedPage,
  getPrincipal,
} from "@/app/[locale]/_data/principal";
import { learnerNotificationCopy } from "@/features/notifications/learner-copy";
import {
  readLearnerNotificationCenter,
  resolveLearnerNotificationSnapshot,
} from "@/features/notifications/learner-data";
import { learnerNotificationEventFamilies } from "@/features/notifications/learner-model";
import { LearnerNotificationCenterView } from "@/features/notifications/learner-view";
import { isLocale } from "@/shared/i18n/config";

import {
  markAllLearnerNotificationsReadAction,
  markLearnerNotificationReadAction,
  setLearnerNotificationPreferenceAction,
} from "./actions";

export default async function LearnerNotificationsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    page?: string | string[];
    snapshot?: string | string[];
  }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  if (
    !(await canRenderProtectedPage(
      locale,
      `/${locale}/learn/notifications`,
      ["learner"],
    ))
  ) {
    return null;
  }
  const parsedPage = z.coerce.number().int().positive().max(10_000).safeParse(
    typeof query.page === "string" ? query.page : "1",
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  if (query.snapshot !== undefined && typeof query.snapshot !== "string") {
    notFound();
  }
  const snapshotInput = typeof query.snapshot === "string"
    ? query.snapshot
    : undefined;
  if (page > 1 && snapshotInput === undefined) notFound();
  let snapshotAt: string;
  try {
    snapshotAt = resolveLearnerNotificationSnapshot(snapshotInput);
  } catch {
    notFound();
  }
  const principal = await getPrincipal();
  const center = await readLearnerNotificationCenter(
    principal,
    page,
    snapshotAt,
  );
  if (page > center.totalPages) notFound();

  const markReadKeys = Object.fromEntries(
    center.items.map((notification) => [
      notification.id,
      `notification-read:${notification.id}:${randomUUID()}`,
    ]),
  );
  const preferenceKeys = Object.fromEntries(
    learnerNotificationEventFamilies.map((eventFamily) => [
      eventFamily,
      `notification-preference:${eventFamily}:${randomUUID()}`,
    ]),
  );

  return (
    <LearnerNotificationCenterView
      center={center}
      idempotencyKeys={{
        markAll: `notification-read-all:${randomUUID()}`,
        markRead: markReadKeys,
        preferences: preferenceKeys,
      }}
      labels={learnerNotificationCopy[locale]}
      locale={locale}
      markAllAction={markAllLearnerNotificationsReadAction.bind(null, locale)}
      markReadAction={markLearnerNotificationReadAction.bind(null, locale)}
      preferenceAction={setLearnerNotificationPreferenceAction.bind(
        null,
        locale,
      )}
    />
  );
}
