"use client";

import { useParams } from "next/navigation";

import { learnerNotificationCopy } from "@/features/notifications/learner-copy";
import { isLocale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

export default function LearnerNotificationsError({
  reset,
}: {
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = learnerNotificationCopy[locale];
  return (
    <StatePanel
      action={<Button onClick={reset}>{labels.retry}</Button>}
      description={labels.errorDescription}
      title={labels.errorTitle}
      tone="danger"
    />
  );
}
