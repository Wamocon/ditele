"use client";

import { useParams } from "next/navigation";

import { trainerHistoryCopy } from "@/features/review/trainer-history-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function TrainerHistoryLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = trainerHistoryCopy[locale];
  return (
    <StatePanel
      description={labels.loadingDescription}
      title={labels.loadingTitle}
    />
  );
}
