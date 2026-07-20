"use client";

import { useParams } from "next/navigation";

import { learnerHistoryCopy } from "@/features/learning/learner-history-copy";
import { isLocale } from "@/shared/i18n/config";
import { StatePanel } from "@/shared/ui/state-panel";

export default function LearnerHistoryLoading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = learnerHistoryCopy[locale];

  return (
    <StatePanel
      description={labels.loadingDescription}
      title={labels.loadingTitle}
    />
  );
}

