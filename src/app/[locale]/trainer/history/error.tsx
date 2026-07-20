"use client";

import { useParams } from "next/navigation";

import { trainerHistoryCopy } from "@/features/review/trainer-history-copy";
import { isLocale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { StatePanel } from "@/shared/ui/state-panel";

export default function TrainerHistoryError({ reset }: { reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "en";
  const labels = trainerHistoryCopy[locale];
  return (
    <StatePanel
      action={<Button onClick={reset}>{labels.retry}</Button>}
      description={labels.errorDescription}
      title={labels.errorTitle}
      tone="danger"
    />
  );
}
