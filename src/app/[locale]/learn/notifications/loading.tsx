"use client";

import { useParams } from "next/navigation";

import { learnerNotificationCopy } from "@/features/notifications/learner-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function LearnerNotificationsLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = learnerNotificationCopy[locale];
  return (
    <StatePanel
      description={labels.loadingDescription}
      title={labels.loadingTitle}
    />
  );
}
