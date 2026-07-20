"use client";

import { useParams } from "next/navigation";

import { learnerProfileCopy } from "@/features/identity/profile-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function LearnerProfileLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = learnerProfileCopy[locale];
  return (
    <StatePanel
      description={labels.loadingDescription}
      title={labels.loadingTitle}
    />
  );
}
