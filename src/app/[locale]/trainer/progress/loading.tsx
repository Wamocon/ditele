"use client";

import { useParams } from "next/navigation";

import { trainerProgressCopy } from "@/features/cohorts/trainer-read-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function TrainerProgressLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = trainerProgressCopy[locale];
  return (
    <StatePanel
      description={labels.loadingDescription}
      title={labels.loadingTitle}
    />
  );
}
